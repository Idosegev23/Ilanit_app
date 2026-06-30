import { describe, it, expect } from 'vitest';
import {
  dayKey,
  addDaysKey,
  addMonthsKey,
  weekdayOfKey,
  startOfWeekKey,
  weekDayKeys,
  startOfMonthKey,
  monthGridKeys,
  isSameMonthKey,
  dayLabel,
  weekRangeLabel,
  monthLabel,
  deriveTimeBounds,
  layoutDayEvents,
  eventsInRange,
  eventsOnDay,
  isUnassignedImport,
  eventVisual,
} from '../calendar-lib';
import type { LessonRow } from '../../data';

// Build a lesson with Asia/Jerusalem wall-clock start/end on a given date.
// We construct the UTC instant directly via an ISO string with the +03:00 IDT
// offset (June → Israel Daylight Time) so the helpers' TZ conversion is exact.
function lesson(
  partial: Partial<LessonRow> & { startISO: string; endISO: string },
): LessonRow {
  const { startISO, endISO, ...rest } = partial;
  return {
    id: rest.id ?? Math.random().toString(36).slice(2),
    type: rest.type ?? 'individual',
    status: rest.status ?? 'confirmed',
    startsAt: new Date(startISO),
    endsAt: new Date(endISO),
    price: rest.price ?? null,
    location: rest.location ?? null,
    studentName: rest.studentName ?? 'תלמיד',
    groupName: rest.groupName ?? null,
    recurrenceId: rest.recurrenceId ?? null,
    notes: rest.notes ?? null,
    needsMatch: rest.needsMatch ?? false,
    source: rest.source ?? 'manual',
  };
}

describe('day-key arithmetic', () => {
  it('addDaysKey crosses month boundaries', () => {
    expect(addDaysKey('2026-06-30', 1)).toBe('2026-07-01');
    expect(addDaysKey('2026-06-01', -1)).toBe('2026-05-31');
    expect(addDaysKey('2026-06-10', 7)).toBe('2026-06-17');
  });

  it('addMonthsKey clamps day-of-month', () => {
    expect(addMonthsKey('2026-01-31', 1)).toBe('2026-02-28'); // no Feb 31
    expect(addMonthsKey('2026-12-15', 1)).toBe('2027-01-15'); // year roll
    expect(addMonthsKey('2026-03-15', -1)).toBe('2026-02-15');
  });

  it('weekdayOfKey: 2026-06-30 is Tuesday (2)', () => {
    expect(weekdayOfKey('2026-06-30')).toBe(2);
    expect(weekdayOfKey('2026-06-28')).toBe(0); // Sunday
  });
});

describe('week + month grids (Sunday-first)', () => {
  it('startOfWeekKey returns the Sunday', () => {
    // 2026-06-30 is a Tuesday → its week starts Sunday 2026-06-28.
    expect(startOfWeekKey('2026-06-30')).toBe('2026-06-28');
  });

  it('weekDayKeys returns 7 days Sun→Sat', () => {
    const keys = weekDayKeys('2026-06-30');
    expect(keys).toHaveLength(7);
    expect(keys[0]).toBe('2026-06-28'); // Sunday
    expect(keys[6]).toBe('2026-07-04'); // Saturday
    expect(weekdayOfKey(keys[0])).toBe(0);
    expect(weekdayOfKey(keys[6])).toBe(6);
  });

  it('startOfMonthKey returns the 1st', () => {
    expect(startOfMonthKey('2026-06-30')).toBe('2026-06-01');
  });

  it('monthGridKeys yields whole weeks covering the month', () => {
    const cells = monthGridKeys('2026-06-15');
    // June 2026: 1st is Monday → grid starts Sunday May 31.
    expect(cells[0]).toBe('2026-05-31');
    expect(weekdayOfKey(cells[0])).toBe(0); // Sunday
    expect(weekdayOfKey(cells[cells.length - 1])).toBe(6); // Saturday
    expect(cells.length % 7).toBe(0);
    // Must contain every day of June.
    expect(cells).toContain('2026-06-01');
    expect(cells).toContain('2026-06-30');
  });

  it('isSameMonthKey distinguishes adjacent-month spill days', () => {
    expect(isSameMonthKey('2026-06-15', '2026-06-01')).toBe(true);
    expect(isSameMonthKey('2026-05-31', '2026-06-01')).toBe(false);
  });
});

describe('Hebrew range labels', () => {
  it('dayLabel reads weekday + day + month + year', () => {
    expect(dayLabel('2026-06-28')).toBe('ראשון, 28 ביוני 2026');
  });

  it('weekRangeLabel same-month', () => {
    expect(weekRangeLabel('2026-06-07')).toBe('7–13 ביוני 2026');
  });

  it('weekRangeLabel month crossing', () => {
    expect(weekRangeLabel('2026-06-28')).toBe('28 ביוני – 4 ביולי 2026');
  });

  it('monthLabel', () => {
    expect(monthLabel('2026-06-15')).toBe('יוני 2026');
  });
});

describe('time bounds', () => {
  it('defaults to 08:00–21:00 with no events', () => {
    expect(deriveTimeBounds([])).toEqual({ startHour: 8, endHour: 21 });
  });

  it('widens for early/late events', () => {
    const events = [
      lesson({ startISO: '2026-06-28T04:00:00+03:00', endISO: '2026-06-28T05:00:00+03:00' }), // 07:00? no: 04:00 IDT
      lesson({ startISO: '2026-06-28T19:30:00+03:00', endISO: '2026-06-28T22:15:00+03:00' }),
    ];
    const b = deriveTimeBounds(events);
    expect(b.startHour).toBe(4);
    expect(b.endHour).toBe(23); // 22:15 rounds up to 23
  });
});

describe('layoutDayEvents overlap columns', () => {
  it('non-overlapping events share a single column', () => {
    const events = [
      lesson({ id: 'a', startISO: '2026-06-28T09:00:00+03:00', endISO: '2026-06-28T10:00:00+03:00' }),
      lesson({ id: 'b', startISO: '2026-06-28T11:00:00+03:00', endISO: '2026-06-28T12:00:00+03:00' }),
    ];
    const positioned = layoutDayEvents(events, { startHour: 8, endHour: 21 });
    expect(positioned).toHaveLength(2);
    expect(positioned.every((p) => p.cols === 1 && p.col === 0)).toBe(true);
  });

  it('overlapping events split into side-by-side columns', () => {
    const events = [
      lesson({ id: 'a', startISO: '2026-06-28T09:00:00+03:00', endISO: '2026-06-28T10:30:00+03:00' }),
      lesson({ id: 'b', startISO: '2026-06-28T10:00:00+03:00', endISO: '2026-06-28T11:00:00+03:00' }),
    ];
    const positioned = layoutDayEvents(events, { startHour: 8, endHour: 21 });
    const a = positioned.find((p) => p.lesson.id === 'a')!;
    const b = positioned.find((p) => p.lesson.id === 'b')!;
    expect(a.cols).toBe(2);
    expect(b.cols).toBe(2);
    expect(a.col).not.toBe(b.col);
  });

  it('positions top/height as fractions of the window', () => {
    // 09:00–10:00 in an 08:00–21:00 (13h) window.
    const events = [
      lesson({ id: 'a', startISO: '2026-06-28T09:00:00+03:00', endISO: '2026-06-28T10:00:00+03:00' }),
    ];
    const [p] = layoutDayEvents(events, { startHour: 8, endHour: 21 });
    expect(p.top).toBeCloseTo(60 / (13 * 60), 5); // 1h after start
    expect(p.height).toBeCloseTo(60 / (13 * 60), 5); // 1h tall
  });
});

describe('range filtering', () => {
  const events = [
    lesson({ id: 'in', startISO: '2026-06-29T09:00:00+03:00', endISO: '2026-06-29T10:00:00+03:00' }),
    lesson({ id: 'before', startISO: '2026-06-20T09:00:00+03:00', endISO: '2026-06-20T10:00:00+03:00' }),
    lesson({ id: 'after', startISO: '2026-07-10T09:00:00+03:00', endISO: '2026-07-10T10:00:00+03:00' }),
  ];

  it('eventsInRange filters by start day-key inclusively', () => {
    const got = eventsInRange(events, '2026-06-28', '2026-07-04');
    expect(got.map((e) => e.id)).toEqual(['in']);
  });

  it('eventsOnDay returns and sorts that day', () => {
    const day = [
      lesson({ id: 'late', startISO: '2026-06-29T15:00:00+03:00', endISO: '2026-06-29T16:00:00+03:00' }),
      lesson({ id: 'early', startISO: '2026-06-29T08:00:00+03:00', endISO: '2026-06-29T09:00:00+03:00' }),
    ];
    const got = eventsOnDay(day, '2026-06-29');
    expect(got.map((e) => e.id)).toEqual(['early', 'late']);
  });
});

describe('event classification', () => {
  it('isUnassignedImport requires needsMatch + calendar_import', () => {
    expect(
      isUnassignedImport(
        lesson({ startISO: '2026-06-29T09:00:00+03:00', endISO: '2026-06-29T10:00:00+03:00', needsMatch: true, source: 'calendar_import' }),
      ),
    ).toBe(true);
    expect(
      isUnassignedImport(
        lesson({ startISO: '2026-06-29T09:00:00+03:00', endISO: '2026-06-29T10:00:00+03:00', needsMatch: true, source: 'manual' }),
      ),
    ).toBe(false);
  });

  it('eventVisual titles group / individual / import distinctly', () => {
    const group = eventVisual(
      lesson({ startISO: '2026-06-29T09:00:00+03:00', endISO: '2026-06-29T10:00:00+03:00', type: 'group_session', groupName: 'מתחילים' }),
    );
    expect(group.isGroup).toBe(true);
    expect(group.title).toBe('מתחילים');

    const cancelled = eventVisual(
      lesson({ startISO: '2026-06-29T09:00:00+03:00', endISO: '2026-06-29T10:00:00+03:00', status: 'cancelled' }),
    );
    expect(cancelled.dimmed).toBe(true);
  });
});

describe('dayKey is timezone-aware (Asia/Jerusalem)', () => {
  it('an instant late evening IDT stays on the same local day', () => {
    // 23:30 IDT on 2026-06-29 = 20:30 UTC same day.
    expect(dayKey(new Date('2026-06-29T23:30:00+03:00'))).toBe('2026-06-29');
  });
});
