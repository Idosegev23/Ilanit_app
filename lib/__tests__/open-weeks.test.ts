import { describe, it, expect, beforeEach, vi } from 'vitest';

// Tests for the open-weeks lib. The schema table and db are mocked; drizzle
// operators are no-ops (filtering is simulated by the fake db keyed on the
// `where` argument value). `weekStartOf` runs against the real time helpers.

const state = vi.hoisted(() => ({
  // weekStart strings currently "open"
  rows: [] as { id: string; weekStart: string; createdAt: Date }[],
  // captured ops for assertions
  inserted: [] as string[],
  deleted: [] as string[],
}));

vi.mock('@/db/schema', () => ({
  openWeeks: {
    __t: 'openWeeks',
    id: { __c: 'id' },
    weekStart: { __c: 'weekStart' },
    createdAt: { __c: 'createdAt' },
  },
}));

// Operators return a tagged descriptor so the fake db can interpret filters.
vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => ({ op: 'and', args: a }),
  eq: (_col: unknown, val: unknown) => ({ op: 'eq', val }),
  gte: (_col: unknown, val: unknown) => ({ op: 'gte', val }),
  lte: (_col: unknown, val: unknown) => ({ op: 'lte', val }),
  asc: (c: unknown) => ({ op: 'asc', c }),
}));

type Filter =
  | { op: 'eq'; val: string }
  | { op: 'gte'; val: string }
  | { op: 'lte'; val: string }
  | { op: 'and'; args: Filter[] };

function matches(row: { weekStart: string }, f: Filter | undefined): boolean {
  if (!f) return true;
  switch (f.op) {
    case 'eq':
      return row.weekStart === f.val;
    case 'gte':
      return row.weekStart >= f.val;
    case 'lte':
      return row.weekStart <= f.val;
    case 'and':
      return f.args.every((a) => matches(row, a));
  }
}

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (f: Filter) => {
          const filtered = state.rows.filter((r) => matches(r, f));
          const result = {
            limit: () => Promise.resolve(filtered),
            orderBy: () =>
              Promise.resolve([...filtered].sort((a, b) => a.weekStart.localeCompare(b.weekStart))),
            then: (res: (v: unknown[]) => unknown) => Promise.resolve(filtered).then(res),
          };
          return result;
        },
      }),
    }),
    insert: () => ({
      values: (v: { weekStart: string }) => ({
        onConflictDoNothing: () => ({
          returning: () => {
            if (state.rows.some((r) => r.weekStart === v.weekStart)) return Promise.resolve([]);
            const row = { id: `ow-${v.weekStart}`, weekStart: v.weekStart, createdAt: new Date() };
            state.rows.push(row);
            state.inserted.push(v.weekStart);
            return Promise.resolve([row]);
          },
        }),
      }),
    }),
    delete: () => ({
      where: (f: Filter) => {
        const before = state.rows.length;
        state.rows = state.rows.filter((r) => !matches(r, f));
        if (state.rows.length < before && f.op === 'eq') state.deleted.push(f.val);
        return Promise.resolve();
      },
    }),
  },
}));

import {
  weekStartOf,
  isWeekOpen,
  openWeek,
  closeWeek,
  listOpenWeeks,
} from '@/lib/open-weeks';
import { parseILDateTime } from '@/lib/time';

beforeEach(() => {
  state.rows = [];
  state.inserted = [];
  state.deleted = [];
});

describe('weekStartOf', () => {
  it('returns the same date for a Sunday', () => {
    // 2026-06-07 is a Sunday (Asia/Jerusalem).
    expect(weekStartOf(parseILDateTime('2026-06-07', '12:00'))).toBe('2026-06-07');
  });

  it('returns the preceding Sunday for a mid-week day', () => {
    // 2026-06-10 is a Wednesday → week starts 2026-06-07.
    expect(weekStartOf(parseILDateTime('2026-06-10', '09:00'))).toBe('2026-06-07');
  });

  it('returns the preceding Sunday for Saturday (end of the week)', () => {
    // 2026-06-13 is a Saturday → still in the 2026-06-07 week.
    expect(weekStartOf(parseILDateTime('2026-06-13', '23:30'))).toBe('2026-06-07');
  });

  it('rolls to the next Sunday for the following day', () => {
    // 2026-06-14 is a Sunday → its own week.
    expect(weekStartOf(parseILDateTime('2026-06-14', '00:30'))).toBe('2026-06-14');
  });
});

describe('isWeekOpen', () => {
  it('is false when no row exists for the week', async () => {
    expect(await isWeekOpen(parseILDateTime('2026-06-10', '09:00'))).toBe(false);
  });

  it('is true when a row exists for the week (any day in the week)', async () => {
    state.rows = [{ id: 'a', weekStart: '2026-06-07', createdAt: new Date() }];
    expect(await isWeekOpen(parseILDateTime('2026-06-07', '08:00'))).toBe(true);
    expect(await isWeekOpen(parseILDateTime('2026-06-11', '08:00'))).toBe(true); // Thu
    expect(await isWeekOpen(parseILDateTime('2026-06-13', '08:00'))).toBe(true); // Sat
  });

  it('is false for a different week', async () => {
    state.rows = [{ id: 'a', weekStart: '2026-06-07', createdAt: new Date() }];
    expect(await isWeekOpen(parseILDateTime('2026-06-14', '08:00'))).toBe(false);
  });
});

describe('openWeek', () => {
  it('inserts a row for the normalized Sunday', async () => {
    // Pass a mid-week day; it must normalize to the Sunday.
    const row = await openWeek('2026-06-10');
    expect(row.weekStart).toBe('2026-06-07');
    expect(state.inserted).toEqual(['2026-06-07']);
  });

  it('is idempotent — opening an already-open week returns the existing row', async () => {
    await openWeek('2026-06-07');
    state.inserted = [];
    const row = await openWeek('2026-06-07');
    expect(row.weekStart).toBe('2026-06-07');
    expect(state.inserted).toEqual([]); // no second insert
    expect(state.rows).toHaveLength(1);
  });
});

describe('closeWeek', () => {
  it('removes the row for the week (normalized)', async () => {
    state.rows = [{ id: 'a', weekStart: '2026-06-07', createdAt: new Date() }];
    await closeWeek('2026-06-11'); // a Thursday in that week
    expect(state.deleted).toEqual(['2026-06-07']);
    expect(state.rows).toHaveLength(0);
  });

  it('is a no-op when the week is not open', async () => {
    await closeWeek('2026-06-07');
    expect(state.rows).toHaveLength(0);
  });
});

describe('listOpenWeeks', () => {
  it('returns open weekStart strings within the inclusive range, ascending', async () => {
    state.rows = [
      { id: 'a', weekStart: '2026-06-07', createdAt: new Date() },
      { id: 'b', weekStart: '2026-06-21', createdAt: new Date() },
      { id: 'c', weekStart: '2026-06-14', createdAt: new Date() },
      { id: 'd', weekStart: '2026-07-05', createdAt: new Date() }, // out of range
    ];
    const out = await listOpenWeeks('2026-06-07', '2026-06-28');
    expect(out).toEqual(['2026-06-07', '2026-06-14', '2026-06-21']);
  });

  it('normalizes range endpoints to their weeks', async () => {
    state.rows = [{ id: 'a', weekStart: '2026-06-07', createdAt: new Date() }];
    // from = a Wednesday in the 2026-06-07 week → endpoint normalizes to 2026-06-07.
    const out = await listOpenWeeks('2026-06-10', '2026-06-10');
    expect(out).toEqual(['2026-06-07']);
  });
});
