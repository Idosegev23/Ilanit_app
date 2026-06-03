import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────
// We mock the DB with a tiny fluent query-builder fake that resolves to a
// result set programmed per "table key" (the schema object passed to .from()).
// notify / settings / env are mocked at the module boundary.

const notify = vi.fn((..._a: unknown[]) => Promise.resolve({ ok: true }));
vi.mock('@/lib/notifications/dispatch', () => ({ notify: (...a: unknown[]) => notify(...a) }));

const getSettings = vi.fn(async () => ({
  locationAddress: 'רחוב הדקל 5, חיפה',
  defaultDurationMin: 60,
}));
vi.mock('@/lib/settings', () => ({ getSettings: () => getSettings() }));

vi.mock('@/lib/env', () => ({ env: () => ({ ILANIT_PHONE: '972545886779' }) }));

// drizzle-orm operators are no-ops here (the fake ignores predicates).
vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => a,
  eq: (...a: unknown[]) => a,
  gte: (...a: unknown[]) => a,
  lt: (...a: unknown[]) => a,
  inArray: (...a: unknown[]) => a,
}));

// Schema tables become identity tokens we can key results on.
vi.mock('@/db/schema', () => ({
  lessons: { __t: 'lessons' },
  students: { __t: 'students' },
  groups: { __t: 'groups' },
  groupMembers: { __t: 'groupMembers' },
}));

// Programmable result sets per table, in call order.
const results: Record<string, unknown[][]> = {};
function queueResult(table: string, rows: unknown[]) {
  (results[table] ||= []).push(rows);
}
function nextResult(table: string): unknown[] {
  const q = results[table];
  if (q && q.length) return q.shift() as unknown[];
  return [];
}

// A thenable query builder. It records the first table it touches (via from /
// innerJoin source is the same table) and resolves to the queued result for it.
function makeSelectBuilder() {
  let table = '';
  const builder: Record<string, unknown> = {};
  const chain = (fn?: (arg: unknown) => void) => (arg?: unknown) => {
    if (fn) fn(arg);
    return builder;
  };
  builder.from = chain((t) => {
    table = (t as { __t: string }).__t;
  });
  builder.innerJoin = chain();
  builder.leftJoin = chain();
  builder.where = chain();
  builder.orderBy = chain();
  builder.limit = chain();
  builder.then = (resolve: (v: unknown[]) => unknown) => resolve(nextResult(table));
  return builder as { then: unknown };
}

vi.mock('@/lib/db', () => ({
  db: {
    select: () => makeSelectBuilder(),
  },
}));

import { runDayBeforeReminders } from '@/lib/jobs/day-before-reminders';

beforeEach(() => {
  notify.mockClear();
  getSettings.mockClear();
  for (const k of Object.keys(results)) delete results[k];
});

describe('runDayBeforeReminders', () => {
  it('reminds an individual student and includes them in the Ilanit summary', async () => {
    const start = new Date();
    // lessons query
    queueResult('lessons', [
      {
        id: 'l1',
        type: 'individual',
        status: 'confirmed',
        studentId: 's1',
        groupId: null,
        startsAt: start,
        location: null,
      },
    ]);
    // students prefetch
    queueResult('students', [{ id: 's1', name: 'דנה', phone: '+972500000001' }]);
    // groups prefetch (none)
    queueResult('groups', []);

    const res = await runDayBeforeReminders();

    expect(res.studentReminders).toBe(1);
    expect(res.groupMemberReminders).toBe(0);
    expect(res.ilanitSummarySent).toBe(true);

    const keys = notify.mock.calls.map((c) => c[0]);
    expect(keys).toContain('reminder_day_before_individual');
    expect(keys).toContain('reminder_day_before_ilanit');

    // student reminder went to the student's phone, keyed idempotently
    const studentCall = notify.mock.calls.find((c) => c[0] === 'reminder_day_before_individual')!;
    expect(studentCall[1]).toBe('+972500000001');
    expect(studentCall[3]).toBe('l1:s1');
  });

  it('reminds every active group member for a group session', async () => {
    queueResult('lessons', [
      {
        id: 'g-session',
        type: 'group_session',
        status: 'confirmed',
        studentId: null,
        groupId: 'grp1',
        startsAt: new Date(),
        location: 'חדר 2',
      },
    ]);
    queueResult('students', []); // no individual lessons
    queueResult('groups', [{ id: 'grp1', name: 'אנגלית מתחילים' }]);
    // members join result (per group session): rows shaped { student }
    queueResult('groupMembers', [
      { student: { id: 's2', name: 'יוסי', phone: '+972500000002' } },
      { student: { id: 's3', name: 'מיה', phone: '+972500000003' } },
    ]);

    const res = await runDayBeforeReminders();

    expect(res.groupMemberReminders).toBe(2);
    const groupCalls = notify.mock.calls.filter((c) => c[0] === 'reminder_day_before_group');
    expect(groupCalls).toHaveLength(2);
    expect(groupCalls.map((c) => c[1])).toEqual(['+972500000002', '+972500000003']);
    // group name passed in vars
    expect((groupCalls[0][2] as Record<string, unknown>).groupName).toBe('אנגלית מתחילים');
  });

  it('does nothing and sends no summary when there are no lessons tomorrow', async () => {
    queueResult('lessons', []);
    queueResult('students', []);
    queueResult('groups', []);

    const res = await runDayBeforeReminders();

    expect(res).toEqual({
      studentReminders: 0,
      groupMemberReminders: 0,
      ilanitSummarySent: false,
    });
    expect(notify).not.toHaveBeenCalled();
  });
});
