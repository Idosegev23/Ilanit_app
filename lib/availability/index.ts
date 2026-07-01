import { db } from '@/lib/db';
import { availability, availabilityExceptions, lessons } from '@/db/schema';
import { and, eq, gte, inArray, lt, ne } from 'drizzle-orm';
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
import { weekStartOf } from '@/lib/open-weeks';

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
async function busyIntervals(
  dayStartMs: number,
  dayEndMs: number,
  excludeLessonId?: string,
): Promise<Interval[]> {
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
        // Exclude a specific lesson (the one being approved): a pending lesson
        // already holds its own slot here, so without this it self-collides.
        excludeLessonId ? ne(lessons.id, excludeLessonId) : undefined,
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
 * Partial time-block intervals for a date — `block_window` exceptions that
 * SUBTRACT a window from the day's open hours (the "everything open, mark what to
 * close" model). Returned as busy intervals so they carve slots out like a lesson.
 */
async function timeBlocksFor(dateISO: string, dayStartMs: number): Promise<Interval[]> {
  const rows = await db
    .select({
      type: availabilityExceptions.type,
      startTime: availabilityExceptions.startTime,
      endTime: availabilityExceptions.endTime,
    })
    .from(availabilityExceptions)
    .where(
      and(
        eq(availabilityExceptions.date, dateISO),
        eq(availabilityExceptions.type, 'block_window'),
      ),
    );

  const out: Interval[] = [];
  for (const r of rows) {
    if (r.type !== 'block_window' || !r.startTime || !r.endTime) continue;
    const s = timeStrToMinutes(r.startTime);
    const e = timeStrToMinutes(r.endTime);
    if (e > s) {
      out.push({ startMs: dayStartMs + s * MS_PER_MIN, endMs: dayStartMs + e * MS_PER_MIN });
    }
  }
  return out;
}

/**
 * Returns the bookable slots for a single `yyyy-MM-dd` date, applying the
 * operating-hours template, exceptions (full-day + time-window blocks), existing
 * lessons, calendar freeBusy, lead-time and the past.
 */
export async function availableSlots(dateISO: string): Promise<Slot[]> {
  // 00:00 (Asia/Jerusalem) of the requested date, as a UTC instant.
  const dayStart = parseILDateTime(dateISO, '00:00');

  const settings = await getSettings();
  const durationMin = settings.defaultDurationMin;
  const bufferMin = settings.bufferMin;

  const dayStartMs = dayStart.getTime();
  const dayEndMs = dayStartMs + 24 * 60 * MS_PER_MIN;
  const weekday = ilWeekday(dayStart);

  const [templateWindows, exception, baseBusy, timeBlocks] = await Promise.all([
    templateWindowsFor(weekday),
    exceptionFor(dateISO),
    busyIntervals(dayStartMs, dayEndMs),
    timeBlocksFor(dateISO, dayStartMs),
  ]);
  const busy = [...baseBusy, ...timeBlocks];

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
 * Lightweight double-booking check for ADMIN (owner) scheduling. Unlike
 * `isSlotBookable`, this is NOT gated by open-weeks, lead-time, or the weekly
 * template — Ilanit can schedule whenever she likes. It only reports whether the
 * slot OVERLAPS an existing pending/confirmed lesson or a calendar busy block,
 * so the UI can warn before letting her proceed anyway. A calendar lookup
 * failure degrades to the lesson-based busy set (same as `busyIntervals`).
 */
export async function hasSlotConflict(
  startISO: string,
  endISO: string,
  excludeLessonId?: string,
): Promise<boolean> {
  const start = new Date(startISO);
  const end = new Date(endISO);
  if (!(start.getTime() < end.getTime())) return false;

  const dateISO = toILDateStr(start);
  const dayStart = parseILDateTime(dateISO, '00:00');
  const busy = await busyIntervals(
    dayStart.getTime(),
    dayStart.getTime() + 24 * 60 * MS_PER_MIN,
    excludeLessonId,
  );
  return busy.some((b) => start.getTime() < b.endMs && b.startMs < end.getTime());
}

export interface WeekDay {
  /** `yyyy-MM-dd` (Asia/Jerusalem). */
  dateISO: string;
  /** 0=Sunday … 6=Saturday. */
  weekday: number;
  /** Bookable slots for this day (empty when the week is closed). */
  slots: Slot[];
}

export interface AvailableWeek {
  /** The Sunday `yyyy-MM-dd` that starts this week. */
  weekStartISO: string;
  /**
   * Kept for backward-compat with the booking UI. Booking is no longer gated by
   * a manual open-weeks step — every week within the horizon is bookable, so
   * this is always true.
   */
  isOpen: boolean;
  /** Seven days, Sunday→Saturday. */
  days: WeekDay[];
}

/**
 * The 7-day (Sunday→Saturday, Asia/Jerusalem) view used by the week-grid booking
 * UI. `weekStartISO` is normalized to its Sunday. Availability is governed purely
 * by the weekly template, per-date exceptions, lead-time and existing lessons —
 * there is no manual open-weeks gate, so every week is computed.
 */
export async function availableWeek(weekStartISO: string): Promise<AvailableWeek> {
  const sundayDate = parseILDateTime(weekStartOf(parseILDateTime(weekStartISO, '00:00')), '00:00');
  const sundayISO = toILDateStr(sundayDate);

  const dayDates: { dateISO: string; weekday: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(sundayDate.getTime() + i * 24 * 60 * MS_PER_MIN);
    dayDates.push({ dateISO: toILDateStr(d), weekday: ilWeekday(d) });
  }

  const days: WeekDay[] = await Promise.all(
    dayDates.map(async ({ dateISO, weekday }) => ({
      dateISO,
      weekday,
      slots: await availableSlots(dateISO),
    })),
  );

  return { weekStartISO: sundayISO, isOpen: true, days };
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

  const [busy, timeBlocks] = await Promise.all([
    busyIntervals(dayStart.getTime(), dayStart.getTime() + 24 * 60 * MS_PER_MIN),
    timeBlocksFor(dateISO, dayStart.getTime()),
  ]);
  const collides = [...busy, ...timeBlocks].some(
    (b) => start.getTime() < b.endMs && b.startMs < end.getTime(),
  );
  return !collides;
}
