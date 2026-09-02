import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
  The rule this replaces charged every active group on the 1st, regardless of
  whether the group met. «מתמטיקה עולות לז'» was billed ₪650 for August and
  again for September — two months with no sessions at all — because a calendar
  date cannot know whether a group ran. These tests pin the new trigger from
  both ends: a group that meets is billed, a group that does not is not.
*/

const state = vi.hoisted(() => ({
  groups: [] as any[],
  billing: [] as any[],
  firstSession: [] as any[],
  statusFilters: [] as unknown[],
  now: new Date('2026-09-02T14:00:00Z'), // 17:00 IL, 2 Sep
}));

const generateMonthlyBilling = vi.fn(async (_month: string, _ids?: string[]) => ({ created: 2 }));
vi.mock('@/lib/groups', () => ({
  generateMonthlyBilling: (m: string, ids?: string[]) => generateMonthlyBilling(m, ids),
}));

vi.mock('@/lib/time', async () => {
  const actual = await vi.importActual<typeof import('@/lib/time')>('@/lib/time');
  return { ...actual, nowIL: () => state.now };
});

vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => a,
  asc: () => ({}),
  eq: () => ({}),
  gte: () => ({}),
  lt: () => ({}),
  notInArray: (_col: unknown, vals: unknown) => {
    state.statusFilters.push(vals);
    return {};
  },
}));

vi.mock('@/db/schema', () => ({
  groups: { __t: 'groups' },
  lessons: { __t: 'lessons', startsAt: {}, groupId: {}, type: {}, status: {} },
  groupBilling: { __t: 'groupBilling', groupId: {}, month: {} },
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: (_cols?: unknown) => ({
      from: (table: { __t?: string }) => {
        const rows =
          table?.__t === 'groups'
            ? state.groups
            : table?.__t === 'groupBilling'
              ? state.billing
              : state.firstSession;
        const chain: any = {
          where: () => chain,
          orderBy: () => chain,
          limit: async () => rows,
          then: (res: (v: unknown) => unknown) => Promise.resolve(rows).then(res),
        };
        return chain;
      },
    }),
  },
}));

import { runGroupBillingOnFirstSession } from '@/lib/jobs/group-billing-on-session';

beforeEach(() => {
  state.groups = [{ id: 'g1', name: 'אנגלית כיתה ו' }];
  state.billing = [];
  state.firstSession = [];
  state.statusFilters = [];
  state.now = new Date('2026-09-02T14:00:00Z');
  generateMonthlyBilling.mockClear();
});

describe('runGroupBillingOnFirstSession', () => {
  it('bills the group once its first session of the month has begun', async () => {
    state.firstSession = [{ startsAt: new Date('2026-09-02T13:15:00Z') }]; // 16:15 IL

    const res = await runGroupBillingOnFirstSession();

    expect(generateMonthlyBilling).toHaveBeenCalledWith('2026-09-01', ['g1']);
    expect(res.billed).toEqual(['אנגלית כיתה ו']);
    expect(res.created).toBe(2);
  });

  it('waits when the session has not started yet', async () => {
    // Same day, later — a parent should be asked during the lesson, not before.
    state.firstSession = [{ startsAt: new Date('2026-09-02T15:30:00Z') }];

    const res = await runGroupBillingOnFirstSession();

    expect(generateMonthlyBilling).not.toHaveBeenCalled();
    expect(res.billed).toEqual([]);
  });

  it('never bills a month the group did not meet in', async () => {
    // The whole point: no session this month, no charge — no one has to
    // remember to switch the group off.
    state.firstSession = [];

    await runGroupBillingOnFirstSession();

    expect(generateMonthlyBilling).not.toHaveBeenCalled();
  });

  it('does not bill twice in the same month', async () => {
    state.firstSession = [{ startsAt: new Date('2026-09-02T13:15:00Z') }];
    state.billing = [{ id: 'gb1' }];

    await runGroupBillingOnFirstSession();

    expect(generateMonthlyBilling).not.toHaveBeenCalled();
  });

  it('ignores a cancelled session as the trigger', async () => {
    // Calling off the month's first session must not bill everyone for it.
    state.firstSession = [{ startsAt: new Date('2026-09-02T13:15:00Z') }];

    await runGroupBillingOnFirstSession();

    expect(state.statusFilters).toContainEqual(['cancelled', 'rejected']);
  });
});
