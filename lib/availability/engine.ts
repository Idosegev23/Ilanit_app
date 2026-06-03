// Pure slot-computation engine for the availability system. No DB / no clock:
// everything it needs is passed in, so it is exhaustively unit-testable.
//
// A free slot = (weekly template window for the weekday)
//             − exceptions (blocked days / custom day windows)
//             − busy intervals (existing pending+confirmed lessons + freeBusy)
//             − lead-time (slots starting too soon)
//             − past (slots already started)
// split into fixed-length slots of `durationMin`, advancing by `durationMin +
// bufferMin` so consecutive lessons keep their buffer.

export interface TimeWindow {
  /** minutes-from-midnight (Asia/Jerusalem wall clock), e.g. 09:00 → 540 */
  startMin: number;
  endMin: number;
}

export interface Interval {
  /** absolute instants (UTC epoch ms) */
  startMs: number;
  endMs: number;
}

export interface ComputeSlotsInput {
  /** template windows active for this weekday (may be empty / multiple) */
  templateWindows: TimeWindow[];
  /**
   * Exception for this date, if any:
   *  - { type:'blocked' } → no availability at all
   *  - { type:'custom', windows } → REPLACES the template windows for the day
   */
  exception?: { type: 'blocked' } | { type: 'custom'; windows: TimeWindow[] };
  /** busy intervals (lessons + calendar freeBusy), absolute ms */
  busy: Interval[];
  /** lesson length in minutes */
  durationMin: number;
  /** buffer (minutes) appended after each lesson before the next can start */
  bufferMin: number;
  /** start-of-day for the requested date, as UTC epoch ms (00:00 Asia/Jerusalem) */
  dayStartMs: number;
  /** earliest instant a slot may START (now + lead-time), UTC epoch ms */
  earliestStartMs: number;
}

export interface ComputedSlot {
  startMs: number;
  endMs: number;
}

const MS_PER_MIN = 60_000;

/** Two intervals overlap if they share any non-zero-length time. */
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Effective windows for the day: a custom exception replaces the template; a
 * blocked exception clears everything; otherwise the template stands.
 */
export function effectiveWindows(
  templateWindows: TimeWindow[],
  exception: ComputeSlotsInput['exception'],
): TimeWindow[] {
  if (exception?.type === 'blocked') return [];
  if (exception?.type === 'custom') return exception.windows;
  return templateWindows;
}

/**
 * Computes the bookable slots for a single day.
 * Slots are emitted in chronological order, de-duplicated, and never overlap a
 * busy interval, start in the past, or start before the lead-time cutoff.
 */
export function computeSlots(input: ComputeSlotsInput): ComputedSlot[] {
  const {
    templateWindows,
    exception,
    busy,
    durationMin,
    bufferMin,
    dayStartMs,
    earliestStartMs,
  } = input;

  if (durationMin <= 0) return [];

  const windows = effectiveWindows(templateWindows, exception);
  if (windows.length === 0) return [];

  const stepMin = durationMin + Math.max(0, bufferMin);
  const out: ComputedSlot[] = [];

  for (const w of windows) {
    if (w.endMin <= w.startMin) continue;
    const windowEndMs = dayStartMs + w.endMin * MS_PER_MIN;

    for (
      let startMin = w.startMin;
      startMin + durationMin <= w.endMin;
      startMin += stepMin
    ) {
      const startMs = dayStartMs + startMin * MS_PER_MIN;
      const endMs = startMs + durationMin * MS_PER_MIN;

      // never spill past the window
      if (endMs > windowEndMs) break;
      // lead-time + past guard (a slot must START at/after the cutoff)
      if (startMs < earliestStartMs) continue;
      // collision with any busy interval
      const collides = busy.some((b) => overlaps(startMs, endMs, b.startMs, b.endMs));
      if (collides) continue;

      out.push({ startMs, endMs });
    }
  }

  // sort + dedupe (overlapping template windows could repeat a slot)
  out.sort((a, b) => a.startMs - b.startMs);
  const deduped: ComputedSlot[] = [];
  for (const s of out) {
    const prev = deduped[deduped.length - 1];
    if (!prev || prev.startMs !== s.startMs) deduped.push(s);
  }
  return deduped;
}

export interface OccupancyInput {
  /** total bookable capacity in minutes derived from the template over the range */
  capacityMin: number;
  /** confirmed (booked) minutes over the range */
  bookedMin: number;
}

/**
 * Occupancy = booked / capacity, as a 0-100 integer percentage.
 * Guards against divide-by-zero (empty template ⇒ 0%).
 */
export function computeOccupancyPct(capacityMin: number, bookedMin: number): number {
  if (capacityMin <= 0) return 0;
  const pct = (bookedMin / capacityMin) * 100;
  return Math.round(Math.max(0, Math.min(100, pct)));
}

export { overlaps };
