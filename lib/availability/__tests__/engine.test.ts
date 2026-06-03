import { describe, it, expect } from 'vitest';
import {
  computeSlots,
  computeOccupancyPct,
  effectiveWindows,
  overlaps,
  type ComputeSlotsInput,
} from '@/lib/availability/engine';

const MIN = 60_000;
// Fixed day start: 2026-06-08 00:00 in UTC ms terms for the test (value is opaque
// to the engine — it only does ms arithmetic relative to dayStartMs).
const DAY = Date.UTC(2026, 5, 8, 0, 0, 0);
const at = (hh: number, mm = 0) => DAY + (hh * 60 + mm) * MIN;

function base(overrides: Partial<ComputeSlotsInput> = {}): ComputeSlotsInput {
  return {
    templateWindows: [{ startMin: 9 * 60, endMin: 12 * 60 }], // 09:00–12:00
    exception: undefined,
    busy: [],
    durationMin: 60,
    bufferMin: 0,
    dayStartMs: DAY,
    earliestStartMs: 0, // no lead-time / past restriction by default
    ...overrides,
  };
}

describe('overlaps', () => {
  it('detects overlapping intervals and treats touching edges as free', () => {
    expect(overlaps(0, 10, 5, 15)).toBe(true);
    expect(overlaps(0, 10, 10, 20)).toBe(false); // back-to-back, no overlap
    expect(overlaps(0, 10, 20, 30)).toBe(false);
  });
});

describe('effectiveWindows', () => {
  const tmpl = [{ startMin: 540, endMin: 720 }];
  it('returns the template when there is no exception', () => {
    expect(effectiveWindows(tmpl, undefined)).toEqual(tmpl);
  });
  it('returns nothing for a blocked day', () => {
    expect(effectiveWindows(tmpl, { type: 'blocked' })).toEqual([]);
  });
  it('replaces the template with custom windows', () => {
    const custom = [{ startMin: 600, endMin: 660 }];
    expect(effectiveWindows(tmpl, { type: 'custom', windows: custom })).toEqual(custom);
  });
});

describe('computeSlots — basic splitting', () => {
  it('splits a 3h window into three 60m slots (no buffer)', () => {
    const slots = computeSlots(base());
    expect(slots).toHaveLength(3);
    expect(slots[0]).toEqual({ startMs: at(9), endMs: at(10) });
    expect(slots[1]).toEqual({ startMs: at(10), endMs: at(11) });
    expect(slots[2]).toEqual({ startMs: at(11), endMs: at(12) });
  });

  it('honors a buffer between slots (stride = duration + buffer)', () => {
    // 09:00–12:00, 60m duration, 15m buffer → starts 09:00, 10:15, 11:30 (ends 12:30 > 12:00 → dropped)
    const slots = computeSlots(base({ bufferMin: 15 }));
    expect(slots.map((s) => s.startMs)).toEqual([at(9), at(10, 15)]);
  });

  it('returns no slots when the window is shorter than the duration', () => {
    const slots = computeSlots(
      base({ templateWindows: [{ startMin: 9 * 60, endMin: 9 * 60 + 30 }] }),
    );
    expect(slots).toEqual([]);
  });

  it('returns no slots for an empty template', () => {
    expect(computeSlots(base({ templateWindows: [] }))).toEqual([]);
  });

  it('returns no slots for non-positive duration', () => {
    expect(computeSlots(base({ durationMin: 0 }))).toEqual([]);
  });
});

describe('computeSlots — multiple windows', () => {
  it('produces slots from every template window, in order', () => {
    const slots = computeSlots(
      base({
        templateWindows: [
          { startMin: 9 * 60, endMin: 11 * 60 }, // 09,10
          { startMin: 16 * 60, endMin: 18 * 60 }, // 16,17
        ],
      }),
    );
    expect(slots.map((s) => s.startMs)).toEqual([at(9), at(10), at(16), at(17)]);
  });

  it('de-duplicates identical slots from overlapping windows', () => {
    const slots = computeSlots(
      base({
        templateWindows: [
          { startMin: 9 * 60, endMin: 11 * 60 },
          { startMin: 9 * 60, endMin: 10 * 60 },
        ],
      }),
    );
    // 09 appears in both windows → only once; plus 10 from the first window
    expect(slots.map((s) => s.startMs)).toEqual([at(9), at(10)]);
  });
});

describe('computeSlots — exceptions', () => {
  it('blocks the whole day', () => {
    expect(computeSlots(base({ exception: { type: 'blocked' } }))).toEqual([]);
  });

  it('uses custom windows instead of the template', () => {
    const slots = computeSlots(
      base({ exception: { type: 'custom', windows: [{ startMin: 14 * 60, endMin: 16 * 60 }] } }),
    );
    expect(slots.map((s) => s.startMs)).toEqual([at(14), at(15)]);
  });
});

describe('computeSlots — busy intervals (lessons + freeBusy)', () => {
  it('drops slots that overlap an existing lesson', () => {
    const slots = computeSlots(base({ busy: [{ startMs: at(10), endMs: at(11) }] }));
    expect(slots.map((s) => s.startMs)).toEqual([at(9), at(11)]);
  });

  it('drops slots overlapping a partial busy interval', () => {
    // busy 10:30–10:45 overlaps the 10:00–11:00 slot only
    const slots = computeSlots(base({ busy: [{ startMs: at(10, 30), endMs: at(10, 45) }] }));
    expect(slots.map((s) => s.startMs)).toEqual([at(9), at(11)]);
  });

  it('keeps a slot that merely touches the edge of a busy interval', () => {
    // busy exactly 10:00–11:00 → 09 (ends 10:00) and 11 (starts 11:00) survive
    const slots = computeSlots(base({ busy: [{ startMs: at(10), endMs: at(11) }] }));
    expect(slots.map((s) => s.startMs)).toContain(at(9));
    expect(slots.map((s) => s.startMs)).toContain(at(11));
  });
});

describe('computeSlots — lead-time & past', () => {
  it('drops slots that start before the lead-time cutoff', () => {
    // cutoff 10:30 → only the 11:00 slot survives
    const slots = computeSlots(base({ earliestStartMs: at(10, 30) }));
    expect(slots.map((s) => s.startMs)).toEqual([at(11)]);
  });

  it('keeps a slot starting exactly at the cutoff', () => {
    const slots = computeSlots(base({ earliestStartMs: at(10) }));
    expect(slots.map((s) => s.startMs)).toEqual([at(10), at(11)]);
  });

  it('drops everything when the cutoff is past the whole window', () => {
    expect(computeSlots(base({ earliestStartMs: at(23) }))).toEqual([]);
  });
});

describe('computeOccupancyPct', () => {
  it('computes a rounded percentage', () => {
    expect(computeOccupancyPct(600, 300)).toBe(50);
    expect(computeOccupancyPct(180, 60)).toBe(33);
  });
  it('returns 0 for empty capacity (no divide-by-zero)', () => {
    expect(computeOccupancyPct(0, 0)).toBe(0);
    expect(computeOccupancyPct(0, 100)).toBe(0);
  });
  it('clamps to 0..100', () => {
    expect(computeOccupancyPct(100, 200)).toBe(100);
    expect(computeOccupancyPct(100, -50)).toBe(0);
  });
});
