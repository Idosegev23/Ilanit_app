import { db } from '@/lib/db';
import {
  availability,
  availabilityExceptions,
  groupMembers,
  groups,
  lessons,
  students,
} from '@/db/schema';
import { and, eq, exists, gt, gte, inArray, isNull, lt, lte, ne, or } from 'drizzle-orm';
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
/**
 * Keep a lesson as "busy" unless it is an EMPTY group session. An individual
 * lesson always counts; a group_session counts only when its group has ≥1 active
 * member — a group with 0 students isn't really happening, so its hour stays open
 * for booking. Read live from group_members, so adding/removing members updates
 * availability instantly.
 */
function notEmptyGroupSession() {
  return or(
    ne(lessons.type, 'group_session'),
    // Defensive: an orphaned group session (group deleted → groupId NULL) still
    // blocks, so it can't be silently double-booked.
    isNull(lessons.groupId),
    exists(
      db
        .select({ id: groupMembers.id })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, lessons.groupId), eq(groupMembers.active, true))),
    ),
  );
}

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
        // Empty group sessions (0 active members) don't block.
        notEmptyGroupSession(),
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

/** Time-window exception intervals of a given kind for a date, as ms intervals. */
async function windowIntervalsFor(
  dateISO: string,
  dayStartMs: number,
  kind: 'block_window' | 'force_open',
): Promise<Interval[]> {
  const rows = await db
    .select({
      type: availabilityExceptions.type,
      startTime: availabilityExceptions.startTime,
      endTime: availabilityExceptions.endTime,
    })
    .from(availabilityExceptions)
    .where(and(eq(availabilityExceptions.date, dateISO), eq(availabilityExceptions.type, kind)));

  const out: Interval[] = [];
  for (const r of rows) {
    if (r.type !== kind || !r.startTime || !r.endTime) continue;
    const s = timeStrToMinutes(r.startTime);
    const e = timeStrToMinutes(r.endTime);
    if (e > s) {
      out.push({ startMs: dayStartMs + s * MS_PER_MIN, endMs: dayStartMs + e * MS_PER_MIN });
    }
  }
  return out;
}

/**
 * `block_window` exceptions — partial closes that SUBTRACT a window from the
 * day's open hours (fed into busy so they carve slots out like a lesson).
 */
function timeBlocksFor(dateISO: string, dayStartMs: number): Promise<Interval[]> {
  return windowIntervalsFor(dateISO, dayStartMs, 'block_window');
}

/**
 * `force_open` exceptions — windows Ilanit explicitly opened for booking even
 * though a lesson/event overlaps them. Subtracted from the busy set so the slot
 * becomes bookable (an intentional override / possible double-book).
 */
function forceOpenFor(dateISO: string, dayStartMs: number): Promise<Interval[]> {
  return windowIntervalsFor(dateISO, dayStartMs, 'force_open');
}

/** Subtracts `holes` from `intervals` (interval difference). */
function subtractIntervals(intervals: Interval[], holes: Interval[]): Interval[] {
  if (holes.length === 0) return intervals;
  let result = intervals;
  for (const hole of holes) {
    const next: Interval[] = [];
    for (const iv of result) {
      if (hole.endMs <= iv.startMs || hole.startMs >= iv.endMs) {
        next.push(iv); // no overlap
        continue;
      }
      if (hole.startMs > iv.startMs) next.push({ startMs: iv.startMs, endMs: hole.startMs });
      if (hole.endMs < iv.endMs) next.push({ startMs: hole.endMs, endMs: iv.endMs });
    }
    result = next;
  }
  return result;
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

  const [templateWindows, exception, baseBusy, timeBlocks, forceOpen] = await Promise.all([
    templateWindowsFor(weekday),
    exceptionFor(dateISO),
    busyIntervals(dayStartMs, dayEndMs),
    timeBlocksFor(dateISO, dayStartMs),
    forceOpenFor(dateISO, dayStartMs),
  ]);
  // Force-open windows reopen otherwise-busy/blocked time for booking.
  const busy = subtractIntervals([...baseBusy, ...timeBlocks], forceOpen);

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
  const [busy, forceOpen] = await Promise.all([
    busyIntervals(dayStart.getTime(), dayStart.getTime() + 24 * 60 * MS_PER_MIN, excludeLessonId),
    forceOpenFor(dateISO, dayStart.getTime()),
  ]);
  // Force-opened windows are deliberate overrides — not conflicts.
  const effective = subtractIntervals(busy, forceOpen);
  return effective.some((b) => start.getTime() < b.endMs && b.startMs < end.getTime());
}

/** True when a force_open window fully covers [start,end] (a deliberate override). */
export async function isSlotForceOpen(startISO: string, endISO: string): Promise<boolean> {
  const start = new Date(startISO);
  const end = new Date(endISO);
  if (!(start.getTime() < end.getTime())) return false;
  const dateISO = toILDateStr(start);
  const dayStart = parseILDateTime(dateISO, '00:00');
  const forceOpen = await forceOpenFor(dateISO, dayStart.getTime());
  return forceOpen.some((f) => f.startMs <= start.getTime() && end.getTime() <= f.endMs);
}

export interface OverlappingLesson {
  id: string;
  timeLabel: string; // "09:00–10:00"
  name: string; // student / group / booked-by name
  isGroup: boolean;
}

/**
 * The DB lessons (pending/confirmed) that occupy a slot, labeled with the
 * student/group name + time — so the admin scheduler can show WHAT is on a taken
 * slot (booking is still allowed over it). Calendar-only busy blocks are not
 * included (freeBusy has no title). Half-open overlap, matching hasSlotConflict.
 */
export async function overlappingLessons(
  startISO: string,
  endISO: string,
  excludeLessonId?: string,
): Promise<OverlappingLesson[]> {
  const start = new Date(startISO);
  const end = new Date(endISO);
  if (!(start.getTime() < end.getTime())) return [];

  const rows = await db
    .select({
      id: lessons.id,
      type: lessons.type,
      startsAt: lessons.startsAt,
      endsAt: lessons.endsAt,
      studentName: students.name,
      groupName: groups.name,
      bookedByName: lessons.bookedByName,
    })
    .from(lessons)
    .leftJoin(students, eq(lessons.studentId, students.id))
    .leftJoin(groups, eq(lessons.groupId, groups.id))
    .where(
      and(
        inArray(lessons.status, ['pending', 'confirmed']),
        lt(lessons.startsAt, end),
        gt(lessons.endsAt, start),
        excludeLessonId ? ne(lessons.id, excludeLessonId) : undefined,
        // Match the engine: empty group sessions aren't shown as occupying.
        notEmptyGroupSession(),
      ),
    );

  return rows.map((r) => ({
    id: r.id,
    timeLabel: `${toILTimeStr(r.startsAt)}–${toILTimeStr(r.endsAt)}`,
    name: r.groupName ?? r.studentName ?? r.bookedByName ?? 'שיעור',
    isGroup: r.type === 'group_session',
  }));
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

  const [busy, timeBlocks, forceOpen] = await Promise.all([
    busyIntervals(dayStart.getTime(), dayStart.getTime() + 24 * 60 * MS_PER_MIN),
    timeBlocksFor(dateISO, dayStart.getTime()),
    forceOpenFor(dateISO, dayStart.getTime()),
  ]);
  const effective = subtractIntervals([...busy, ...timeBlocks], forceOpen);
  const collides = effective.some(
    (b) => start.getTime() < b.endMs && b.startMs < end.getTime(),
  );
  return !collides;
}

// ── Availability EDITOR data (the interactive month/day calendar) ─────────────

export type SlotState = 'open' | 'closed' | 'taken' | 'past' | 'forced';

export interface DaySlot {
  startISO: string;
  endISO: string;
  label: string; // "08:00–09:00"
  state: SlotState;
}

/** Slices operating windows into (duration) slots stepped by duration+buffer. */
function sliceWindows(
  windows: TimeWindow[],
  dayStartMs: number,
  durationMin: number,
  bufferMin: number,
): { startMs: number; endMs: number }[] {
  const step = durationMin + Math.max(0, bufferMin);
  const out: { startMs: number; endMs: number }[] = [];
  for (const w of windows) {
    for (let m = w.startMin; m + durationMin <= w.endMin; m += step) {
      out.push({
        startMs: dayStartMs + m * MS_PER_MIN,
        endMs: dayStartMs + (m + durationMin) * MS_PER_MIN,
      });
    }
  }
  return out;
}

/**
 * Every operating-hours slot for a date with its state — backs the availability
 * editor. open = bookable; closed = a block; taken = a lesson/calendar event;
 * past = elapsed. Includes calendar freeBusy for accuracy.
 */
export async function dayAvailability(dateISO: string): Promise<DaySlot[]> {
  const dayStart = parseILDateTime(dateISO, '00:00');
  const dayStartMs = dayStart.getTime();
  const dayEndMs = dayStartMs + 24 * 60 * MS_PER_MIN;
  const settings = await getSettings();
  const weekday = ilWeekday(dayStart);

  const [templateWindows, exception, busy, timeBlocks, forceOpen] = await Promise.all([
    templateWindowsFor(weekday),
    exceptionFor(dateISO),
    busyIntervals(dayStartMs, dayEndMs),
    timeBlocksFor(dateISO, dayStartMs),
    forceOpenFor(dateISO, dayStartMs),
  ]);

  const fullDayBlocked = exception?.type === 'blocked';
  const windows = exception?.type === 'custom' ? exception.windows : templateWindows;
  const earliestMs = nowIL().getTime() + settings.leadTimeMin * MS_PER_MIN;

  return sliceWindows(windows, dayStartMs, settings.defaultDurationMin, settings.bufferMin).map(
    ({ startMs, endMs }) => {
      const overlaps = (b: Interval) => startMs < b.endMs && b.startMs < endMs;
      const forced = forceOpen.some(overlaps);
      const overlapsBusy = busy.some(overlaps);
      const overlapsBlockWindow = timeBlocks.some(overlaps);
      let state: SlotState;
      if (startMs < earliestMs) state = 'past';
      // A full-day block wins over a force-open (availableSlots yields nothing).
      else if (fullDayBlocked) state = 'closed';
      // Force-opened over a real conflict → bookable override.
      else if (forced && (overlapsBusy || overlapsBlockWindow)) state = 'forced';
      else if (overlapsBusy) state = 'taken';
      else if (overlapsBlockWindow) state = 'closed';
      else state = 'open';
      return {
        startISO: new Date(startMs).toISOString(),
        endISO: new Date(endMs).toISOString(),
        label: slotLabel(startMs, endMs),
        state,
      };
    },
  );
}

export interface DayState {
  date: string; // yyyy-MM-dd
  open: number;
  total: number;
  taken: number;
  fullyClosed: boolean;
}

/**
 * Per-day open/taken/total slot counts across [fromISO, toISO] — backs the month
 * grid. Batched (template + lessons + blocks in 3 queries); calendar freeBusy is
 * omitted here for speed (the day panel adds it when a day is opened).
 */
export async function monthDayStates(
  fromISO: string,
  toISO: string,
): Promise<Record<string, DayState>> {
  const settings = await getSettings();
  const durationMin = settings.defaultDurationMin;
  const bufferMin = settings.bufferMin;

  const tmplRows = await db.select().from(availability).where(eq(availability.active, true));
  const byWeekday = new Map<number, TimeWindow[]>();
  for (const r of tmplRows) {
    const arr = byWeekday.get(r.weekday) ?? [];
    arr.push({ startMin: timeStrToMinutes(r.startTime), endMin: timeStrToMinutes(r.endTime) });
    byWeekday.set(r.weekday, arr);
  }

  const fromDay = parseILDateTime(fromISO, '00:00');
  const toDay = parseILDateTime(toISO, '00:00');

  const lessonRows = await db
    .select({ startsAt: lessons.startsAt, endsAt: lessons.endsAt })
    .from(lessons)
    .where(
      and(
        inArray(lessons.status, ['pending', 'confirmed']),
        lt(lessons.startsAt, new Date(toDay.getTime() + 24 * 60 * MS_PER_MIN)),
        gte(lessons.endsAt, fromDay),
        // Empty group sessions (0 active members) don't block.
        notEmptyGroupSession(),
      ),
    );
  const lessonIntervals = lessonRows.map((l) => ({
    startMs: l.startsAt.getTime(),
    endMs: l.endsAt.getTime(),
  }));

  const blockRows = await db
    .select()
    .from(availabilityExceptions)
    .where(and(gte(availabilityExceptions.date, fromISO), lte(availabilityExceptions.date, toISO)));
  const fullDay = new Set<string>();
  const blocksByDate = new Map<string, { startMin: number; endMin: number }[]>();
  const forceByDate = new Map<string, { startMin: number; endMin: number }[]>();
  for (const b of blockRows) {
    if (b.type === 'blocked') fullDay.add(b.date);
    if (b.type === 'block_window' && b.startTime && b.endTime) {
      const arr = blocksByDate.get(b.date) ?? [];
      arr.push({ startMin: timeStrToMinutes(b.startTime), endMin: timeStrToMinutes(b.endTime) });
      blocksByDate.set(b.date, arr);
    }
    if (b.type === 'force_open' && b.startTime && b.endTime) {
      const arr = forceByDate.get(b.date) ?? [];
      arr.push({ startMin: timeStrToMinutes(b.startTime), endMin: timeStrToMinutes(b.endTime) });
      forceByDate.set(b.date, arr);
    }
  }

  const earliestMs = nowIL().getTime() + settings.leadTimeMin * MS_PER_MIN;

  const result: Record<string, DayState> = {};
  for (let d = new Date(fromDay); d <= toDay; d = new Date(d.getTime() + 24 * 60 * MS_PER_MIN)) {
    const dateISO = toILDateStr(d);
    const dayStart = parseILDateTime(dateISO, '00:00');
    const dayStartMs = dayStart.getTime();
    const windows = byWeekday.get(ilWeekday(dayStart)) ?? [];
    const dayFullyBlocked = fullDay.has(dateISO);
    const toMs = (w: { startMin: number; endMin: number }) => ({
      startMs: dayStartMs + w.startMin * MS_PER_MIN,
      endMs: dayStartMs + w.endMin * MS_PER_MIN,
    });
    const dbw = (blocksByDate.get(dateISO) ?? []).map(toMs);
    const fo = (forceByDate.get(dateISO) ?? []).map(toMs);

    let open = 0;
    let total = 0;
    let taken = 0;
    for (const { startMs, endMs } of sliceWindows(windows, dayStartMs, durationMin, bufferMin)) {
      const overlaps = (b: { startMs: number; endMs: number }) =>
        startMs < b.endMs && b.startMs < endMs;
      total += 1;
      // Force-opened over a conflict → bookable (unless the whole day is blocked / past).
      if (fo.some(overlaps) && !dayFullyBlocked && startMs >= earliestMs) {
        open += 1;
        continue;
      }
      if (lessonIntervals.some(overlaps)) {
        taken += 1;
        continue;
      }
      if (dayFullyBlocked || dbw.some(overlaps)) continue;
      if (startMs < earliestMs) continue;
      open += 1;
    }
    result[dateISO] = { date: dateISO, open, total, taken, fullyClosed: total > 0 && open === 0 };
  }
  return result;
}
