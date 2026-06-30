// Pure helpers for the /lessons calendar. All wall-clock reasoning is done in
// Asia/Jerusalem (via @/lib/time); Date instances are UTC instants as stored.
// Kept framework-free so it can be unit-tested directly.

import {
  ilHour,
  ilMinute,
  ilWeekday,
  toILDateStr,
  toILTimeStr,
} from '@/lib/time';
import type { LessonRow } from '../data';

export type CalendarView = 'day' | 'week' | 'month';

// ── Hebrew labels ──────────────────────────────────────────────────────────
export const HE_WEEKDAYS_LONG = [
  'ראשון',
  'שני',
  'שלישי',
  'רביעי',
  'חמישי',
  'שישי',
  'שבת',
] as const;

export const HE_WEEKDAYS_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'] as const;

export const HE_MONTHS = [
  'ינואר',
  'פברואר',
  'מרץ',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר',
] as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ── Day-key (Asia/Jerusalem) helpers ───────────────────────────────────────

/** `yyyy-MM-dd` (Asia/Jerusalem) for an instant — the canonical day key. */
export function dayKey(date: Date): string {
  return toILDateStr(date);
}

/** Parses a `yyyy-MM-dd` key into a UTC-midnight anchor used only for pure
 *  calendar arithmetic (add days / weekday). We never display this instant. */
export function keyToAnchor(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** `yyyy-MM-dd` for an anchor produced by {@link keyToAnchor}. */
export function anchorToKey(anchor: Date): string {
  const y = anchor.getUTCFullYear();
  const m = String(anchor.getUTCMonth() + 1).padStart(2, '0');
  const d = String(anchor.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Adds (or subtracts) whole days to a day key. */
export function addDaysKey(key: string, days: number): string {
  return anchorToKey(new Date(keyToAnchor(key).getTime() + days * MS_PER_DAY));
}

/** Adds whole months to a day key (clamps day-of-month to month length). */
export function addMonthsKey(key: string, months: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const total = (y * 12 + (m - 1)) + months;
  const ny = Math.floor(total / 12);
  const nm = total % 12; // 0-based
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  const nd = Math.min(d, lastDay);
  return anchorToKey(new Date(Date.UTC(ny, nm, nd)));
}

/** Weekday (0=Sun … 6=Sat) for a day key. */
export function weekdayOfKey(key: string): number {
  return keyToAnchor(key).getUTCDay();
}

/** Sunday day-key of the week containing `key` (weeks start Sunday). */
export function startOfWeekKey(key: string): string {
  return addDaysKey(key, -weekdayOfKey(key));
}

/** The 7 day keys Sun→Sat of the week containing `key`. */
export function weekDayKeys(key: string): string[] {
  const sun = startOfWeekKey(key);
  return Array.from({ length: 7 }, (_, i) => addDaysKey(sun, i));
}

/** First day-key of the month containing `key`. */
export function startOfMonthKey(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return anchorToKey(new Date(Date.UTC(y, m - 1, 1)));
}

/**
 * The day-key grid for a month view: complete weeks (Sun→Sat) covering the
 * whole month — typically 35 or 42 cells. Leading/trailing days belong to the
 * adjacent months (flagged via {@link isSameMonthKey}).
 */
export function monthGridKeys(key: string): string[] {
  const first = startOfMonthKey(key);
  const gridStart = startOfWeekKey(first);
  const [y, m] = key.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lastKey = anchorToKey(new Date(Date.UTC(y, m - 1, lastDay)));
  // Saturday on/after the last day → grid end.
  const gridEnd = addDaysKey(lastKey, 6 - weekdayOfKey(lastKey));
  const cells: string[] = [];
  let cur = gridStart;
  // Inclusive walk; guard at 6 weeks max.
  for (let i = 0; i < 42 && cur <= gridEnd; i++) {
    cells.push(cur);
    cur = addDaysKey(cur, 1);
  }
  return cells;
}

/** True when `key` is in the same calendar month/year as `ref`. */
export function isSameMonthKey(key: string, ref: string): boolean {
  return key.slice(0, 7) === ref.slice(0, 7);
}

// ── Hebrew range labels ────────────────────────────────────────────────────

/** "ראשון, 7 ביוני 2026" style label for a single day key. */
export function dayLabel(key: string): string {
  const [y, , d] = key.split('-').map(Number);
  const wd = HE_WEEKDAYS_LONG[weekdayOfKey(key)];
  const month = HE_MONTHS[Number(key.slice(5, 7)) - 1];
  return `${wd}, ${d} ב${month} ${y}`;
}

/** "7–13 ביוני 2026" / "28 ביוני – 4 ביולי 2026" range for a week. */
export function weekRangeLabel(weekStartKey: string): string {
  const start = weekStartKey.split('-').map(Number);
  const endKey = addDaysKey(weekStartKey, 6);
  const end = endKey.split('-').map(Number);
  const startMonth = HE_MONTHS[start[1] - 1];
  const endMonth = HE_MONTHS[end[1] - 1];
  if (start[1] === end[1] && start[0] === end[0]) {
    return `${start[2]}–${end[2]} ב${endMonth} ${end[0]}`;
  }
  if (start[0] === end[0]) {
    return `${start[2]} ב${startMonth} – ${end[2]} ב${endMonth} ${end[0]}`;
  }
  return `${start[2]} ב${startMonth} ${start[0]} – ${end[2]} ב${endMonth} ${end[0]}`;
}

/** "יוני 2026" for the month containing `key`. */
export function monthLabel(key: string): string {
  const [y] = key.split('-').map(Number);
  return `${HE_MONTHS[Number(key.slice(5, 7)) - 1]} ${y}`;
}

// ── Time-of-day positioning ────────────────────────────────────────────────

/** Minutes since 00:00 (Asia/Jerusalem) for an instant. */
export function minutesOfDay(date: Date): number {
  return ilHour(date) * 60 + ilMinute(date);
}

/** `HH:mm` (Asia/Jerusalem). */
export function timeLabel(date: Date): string {
  return toILTimeStr(date);
}

export interface TimeBounds {
  /** Earliest hour shown (inclusive), 0-23. */
  startHour: number;
  /** Latest hour boundary shown (exclusive end), 1-24. */
  endHour: number;
}

const DEFAULT_BOUNDS: TimeBounds = { startHour: 8, endHour: 21 };

/**
 * Derives sensible time-grid bounds from the events in view: the default
 * 08:00–21:00 window, widened to include any event that starts earlier or ends
 * later. Always padded to whole hours and kept within 0–24.
 */
export function deriveTimeBounds(events: LessonRow[]): TimeBounds {
  let startHour = DEFAULT_BOUNDS.startHour;
  let endHour = DEFAULT_BOUNDS.endHour;
  for (const e of events) {
    const sH = ilHour(e.startsAt);
    if (sH < startHour) startHour = sH;
    const endMin = minutesOfDay(e.endsAt);
    // Round the end up to the next whole hour for a clean bottom edge.
    const eH = Math.ceil(endMin / 60);
    if (eH > endHour) endHour = eH;
  }
  return {
    startHour: Math.max(0, startHour),
    endHour: Math.min(24, Math.max(endHour, startHour + 1)),
  };
}

// ── Event layout within a single day (overlap columns) ─────────────────────

export interface PositionedEvent {
  lesson: LessonRow;
  /** Top offset as a fraction (0–1) of the visible day window. */
  top: number;
  /** Height as a fraction (0–1) of the visible day window. */
  height: number;
  /** 0-based column index among mutually-overlapping events. */
  col: number;
  /** Number of columns in this event's overlap cluster. */
  cols: number;
}

/**
 * Positions a day's events on the time grid, splitting overlapping events into
 * side-by-side columns (greedy interval-graph colouring). `bounds` defines the
 * visible window; events are clamped to it.
 */
export function layoutDayEvents(
  events: LessonRow[],
  bounds: TimeBounds,
): PositionedEvent[] {
  const windowStart = bounds.startHour * 60;
  const windowEnd = bounds.endHour * 60;
  const span = Math.max(1, windowEnd - windowStart);

  // Sort by start, then by longer-first for stable column packing.
  const sorted = [...events].sort((a, b) => {
    const d = a.startsAt.getTime() - b.startsAt.getTime();
    if (d !== 0) return d;
    return b.endsAt.getTime() - a.endsAt.getTime();
  });

  type Interval = {
    lesson: LessonRow;
    start: number;
    end: number;
    col: number;
  };
  const intervals: Interval[] = sorted.map((lesson) => {
    const start = Math.max(windowStart, minutesOfDay(lesson.startsAt));
    // Min 30-minute visual height even for zero-length / very short events.
    const rawEnd = Math.max(minutesOfDay(lesson.endsAt), minutesOfDay(lesson.startsAt) + 30);
    const end = Math.min(windowEnd, rawEnd);
    return { lesson, start, end, col: 0 };
  });

  // Cluster consecutive overlapping intervals, assign columns greedily, and
  // record the cluster width so each event can size its track.
  const positioned: PositionedEvent[] = [];
  let i = 0;
  while (i < intervals.length) {
    const cluster: Interval[] = [intervals[i]];
    let clusterEnd = intervals[i].end;
    let j = i + 1;
    while (j < intervals.length && intervals[j].start < clusterEnd) {
      cluster.push(intervals[j]);
      clusterEnd = Math.max(clusterEnd, intervals[j].end);
      j++;
    }
    // Greedy column assignment within the cluster.
    const colEnds: number[] = [];
    for (const iv of cluster) {
      let placed = false;
      for (let c = 0; c < colEnds.length; c++) {
        if (iv.start >= colEnds[c]) {
          iv.col = c;
          colEnds[c] = iv.end;
          placed = true;
          break;
        }
      }
      if (!placed) {
        iv.col = colEnds.length;
        colEnds.push(iv.end);
      }
    }
    const cols = colEnds.length;
    for (const iv of cluster) {
      positioned.push({
        lesson: iv.lesson,
        top: (iv.start - windowStart) / span,
        height: Math.max(0.02, (iv.end - iv.start) / span),
        col: iv.col,
        cols,
      });
    }
    i = j;
  }
  return positioned;
}

// ── Range filtering ────────────────────────────────────────────────────────

/** Events whose start day-key is within [startKey, endKey] inclusive. */
export function eventsInRange(
  events: LessonRow[],
  startKey: string,
  endKey: string,
): LessonRow[] {
  return events.filter((e) => {
    const k = dayKey(e.startsAt);
    return k >= startKey && k <= endKey;
  });
}

/** Events on a specific day key, sorted by start time. */
export function eventsOnDay(events: LessonRow[], key: string): LessonRow[] {
  return events
    .filter((e) => dayKey(e.startsAt) === key)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

// ── Event presentation classification ──────────────────────────────────────

/** True for a calendar-imported lesson still awaiting a student assignment. */
export function isUnassignedImport(lesson: LessonRow): boolean {
  return lesson.needsMatch && lesson.source === 'calendar_import';
}

export interface EventVisual {
  /** Display title (group name / student name / raw imported title). */
  title: string;
  isGroup: boolean;
  unassignedImport: boolean;
  dimmed: boolean;
}

/** Derives the title + flags used to render an event block. */
export function eventVisual(lesson: LessonRow): EventVisual {
  const isGroup = lesson.type === 'group_session';
  const unassignedImport = isUnassignedImport(lesson);
  const title = isGroup
    ? lesson.groupName ?? 'קבוצה'
    : unassignedImport
      ? lesson.studentName ?? 'שיעור מהיומן'
      : lesson.studentName ?? 'שיעור';
  const dimmed = lesson.status === 'rejected' || lesson.status === 'cancelled';
  return { title, isGroup, unassignedImport, dimmed };
}
