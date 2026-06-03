import { db } from '@/lib/db';
import { availability, availabilityExceptions, lessons } from '@/db/schema';
import { and, eq, gte, inArray, lt } from 'drizzle-orm';
import { getSettings } from '@/lib/settings';
import { freeBusy } from '@/lib/google-calendar';
import {
  startOfDayIL,
  nowIL,
  parseILDateTime,
  ilWeekday,
  toILTimeStr,
  toILDateStr,
} from '@/lib/time';
import {
  computeSlots,
  computeOccupancyPct,
  type TimeWindow,
  type Interval,
} from '@/lib/availability/engine';

// Availability engine: turns the weekly template (minus exceptions, existing
// lessons, calendar freeBusy, lead-time and past) into concrete bookable slots,
// and feeds the same data into the occupancy metric. The heavy lifting lives in
// the pure ./engine module; this file is the DB + calendar adapter.

export interface Slot {
  startISO: string;
  endISO: string;
  label: string;
}

const MS_PER_MIN = 60_000;

/** Parses a `HH:mm` or `HH:mm:ss` wall-clock string to minutes-from-midnight. */
export function timeStrToMinutes(t: string): number {
  const [h, m] = t.split(':');
  return Number(h) * 60 + Number(m);
}

/** Slot picker label, e.g. `09:00–10:00`. */
function slotLabel(startMs: number, endMs: number): string {
  return `${toILTimeStr(new Date(startMs))}–${toILTimeStr(new Date(endMs))}`;
}

/** Loads the weekly template windows for a given weekday (0=Sun…6=Sat). */
async function templateWindowsFor(weekday: number): Promise<TimeWindow[]> {
  const rows = await db
    .select()
    .from(availability)
    .where(and(eq(availability.weekday, weekday), eq(availability.active, true)));
  return rows.map((r) => ({
    startMin: timeStrToMinutes(r.startTime),
    endMin: timeStrToMinutes(r.endTime),
  }));
}

/** Loads the exception (if any) for a given `yyyy-MM-dd` date. */
async function exceptionFor(
  dateISO: string,
): Promise<{ type: 'blocked' } | { type: 'custom'; windows: TimeWindow[] } | undefined> {
  const rows = await db
    .select()
    .from(availabilityExceptions)
    .where(eq(availabilityExceptions.date, dateISO));
  if (rows.length === 0) return undefined;
  // a blocked exception wins; otherwise gather custom windows
  if (rows.some((r) => r.type === 'blocked')) return { type: 'blocked' };
  const windows = rows
    .filter((r) => r.type === 'custom' && r.startTime && r.endTime)
    .map((r) => ({
      startMin: timeStrToMinutes(r.startTime as string),
      endMin: timeStrToMinutes(r.endTime as string),
    }));
  if (windows.length === 0) return undefined;
  return { type: 'custom', windows };
}

/**
 * Busy intervals for the day: pending+confirmed lessons that intersect the day
 * plus the calendar's freeBusy for the same window. Calendar errors degrade
 * gracefully (we keep the lesson-based busy set) so booking still works.
 */
async function busyIntervals(dayStartMs: number, dayEndMs: number): Promise<Interval[]> {
  const dayStart = new Date(dayStartMs);
  const dayEnd = new Date(dayEndMs);

  const lessonRows = await db
    .select({ startsAt: lessons.startsAt, endsAt: lessons.endsAt })
    .from(lessons)
    .where(
      and(
        inArray(lessons.status, ['pending', 'confirmed']),
        lt(lessons.startsAt, dayEnd),
        gte(lessons.endsAt, dayStart),
      ),
    );

  const busy: Interval[] = lessonRows.map((l) => ({
    startMs: l.startsAt.getTime(),
    endMs: l.endsAt.getTime(),
  }));

  try {
    const fb = await freeBusy(dayStart.toISOString(), dayEnd.toISOString());
    for (const b of fb) {
      busy.push({ startMs: new Date(b.start).getTime(), endMs: new Date(b.end).getTime() });
    }
  } catch (err) {
    console.error('[availability] freeBusy failed, using lessons only:', err);
  }

  return busy;
}

/**
 * Returns the bookable slots for a single `yyyy-MM-dd` date, applying the
 * weekly template, exceptions, existing lessons, calendar freeBusy, lead-time
 * and the past.
 */
export async function availableSlots(dateISO: string): Promise<Slot[]> {
  const settings = await getSettings();
  const durationMin = settings.defaultDurationMin;
  const bufferMin = settings.bufferMin;

  // 00:00 (Asia/Jerusalem) of the requested date, as a UTC instant.
  const dayStart = parseILDateTime(dateISO, '00:00');
  const dayStartMs = dayStart.getTime();
  const dayEndMs = dayStartMs + 24 * 60 * MS_PER_MIN;
  const weekday = ilWeekday(dayStart);

  const [templateWindows, exception, busy] = await Promise.all([
    templateWindowsFor(weekday),
    exceptionFor(dateISO),
    busyIntervals(dayStartMs, dayEndMs),
  ]);

  const earliestStartMs = nowIL().getTime() + settings.leadTimeMin * MS_PER_MIN;

  const slots = computeSlots({
    templateWindows,
    exception,
    busy,
    durationMin,
    bufferMin,
    dayStartMs,
    earliestStartMs,
  });

  return slots.map((s) => ({
    startISO: new Date(s.startMs).toISOString(),
    endISO: new Date(s.endMs).toISOString(),
    label: slotLabel(s.startMs, s.endMs),
  }));
}

/**
 * Occupancy over a date range [fromISO, toISO): template capacity (minutes)
 * vs. confirmed booked minutes. Both endpoints are `yyyy-MM-dd` dates.
 */
export async function occupancy(
  fromISO: string,
  toISO: string,
): Promise<{ capacity: number; booked: number; pct: number }> {
  const from = startOfDayIL(parseILDateTime(fromISO, '00:00'));
  const to = startOfDayIL(parseILDateTime(toISO, '00:00'));

  // Template capacity (minutes) summed per day across the range.
  const template = await db
    .select()
    .from(availability)
    .where(eq(availability.active, true));
  const minutesByWeekday = new Map<number, number>();
  for (const w of template) {
    const mins = timeStrToMinutes(w.endTime) - timeStrToMinutes(w.startTime);
    if (mins > 0) {
      minutesByWeekday.set(w.weekday, (minutesByWeekday.get(w.weekday) ?? 0) + mins);
    }
  }

  let capacityMin = 0;
  for (let d = new Date(from); d < to; d = new Date(d.getTime() + 24 * 60 * MS_PER_MIN)) {
    capacityMin += minutesByWeekday.get(ilWeekday(d)) ?? 0;
  }

  // Confirmed/completed booked minutes within the range.
  const booked = await db
    .select({ startsAt: lessons.startsAt, endsAt: lessons.endsAt })
    .from(lessons)
    .where(
      and(
        inArray(lessons.status, ['confirmed', 'completed']),
        gte(lessons.startsAt, from),
        lt(lessons.startsAt, to),
      ),
    );
  let bookedMin = 0;
  for (const l of booked) {
    bookedMin += Math.round((l.endsAt.getTime() - l.startsAt.getTime()) / MS_PER_MIN);
  }

  return {
    capacity: capacityMin,
    booked: bookedMin,
    pct: computeOccupancyPct(capacityMin, bookedMin),
  };
}

/**
 * Re-checks that a specific slot (startISO/endISO) is still bookable. Used by
 * /api/book and /api/approve before committing. Returns true only when the slot
 * is in the future (past lead-time), inside an active template/custom window,
 * not blocked, and not colliding with any existing lesson or calendar busy.
 */
export async function isSlotBookable(startISO: string, endISO: string): Promise<boolean> {
  const start = new Date(startISO);
  const end = new Date(endISO);
  if (!(start.getTime() < end.getTime())) return false;

  const settings = await getSettings();
  const earliestStartMs = nowIL().getTime() + settings.leadTimeMin * MS_PER_MIN;
  if (start.getTime() < earliestStartMs) return false;

  const dateISO = toILDateStr(start);
  const dayStart = parseILDateTime(dateISO, '00:00');
  const weekday = ilWeekday(dayStart);

  const exception = await exceptionFor(dateISO);
  if (exception?.type === 'blocked') return false;

  const windows =
    exception?.type === 'custom' ? exception.windows : await templateWindowsFor(weekday);
  const startMin = (start.getTime() - dayStart.getTime()) / MS_PER_MIN;
  const endMin = (end.getTime() - dayStart.getTime()) / MS_PER_MIN;
  const insideWindow = windows.some((w) => startMin >= w.startMin && endMin <= w.endMin);
  if (!insideWindow) return false;

  const busy = await busyIntervals(dayStart.getTime(), dayStart.getTime() + 24 * 60 * MS_PER_MIN);
  const collides = busy.some((b) => start.getTime() < b.endMs && b.startMs < end.getTime());
  return !collides;
}
