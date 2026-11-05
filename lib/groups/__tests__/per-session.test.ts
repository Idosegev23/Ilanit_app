import { describe, it, expect, beforeEach, vi } from 'vitest';

/*
  A Friday group, ₪100 a session, paid in advance at the start of the month. The
  month's charge is the price times the sessions that month actually holds —
  four Fridays in November, five in some months — so these tests pin how the
  sessions are counted and that the parent is told what the sum is made of.
*/

const state = vi.hoisted(() => ({
  selects: [] as unknown[][],
  inserted: [] as any[],
  notified: [] as any[],
  now: new Date('2026-11-01T07:00:00Z'), // Sun 1 Nov, 09:00 Israel time
}));

vi.mock('@/lib/db', () => {
  const chain = (): any => {
    const c: any = {};
    for (const m of ['from', 'innerJoin', 'where', 'orderBy', 'limit']) c[m] = () => c;
    c.then = (res: (v: unknown) => unknown) => Promise.resolve(res(state.selects.shift() ?? []));
    return c;
  };
  return {
    db: {
      select: () => chain(),
      insert: () => ({
        values: (v: any) => ({
          returning: async () => {
            state.inserted.push(v);
            return [{ id: `bill-${state.inserted.length}`, ...v }];
          },
        }),
      }),
    },
  };
});
vi.mock('@/lib/time', async () => {
  const actual = await vi.importActual<typeof import('@/lib/time')>('@/lib/time');
  return { ...actual, nowIL: () => state.now };
});
vi.mock('@/lib/settings', () => ({ getSettings: async () => ({}) }));
vi.mock('@/lib/recurrence', () => ({ createSeries: vi.fn() }));
vi.mock('@/lib/morning', () => ({ createReceipt: vi.fn() }));
vi.mock('@/lib/whatsapp/provider', () => ({ sendFileByUrl: vi.fn() }));
vi.mock('@/lib/tokens', () => ({ createGroupBillingToken: async () => 'tok' }));
vi.mock('@/lib/notifications/dispatch', () => ({
  notify: async (template: string, to: string, vars: any) => {
    state.notified.push({ template, to, vars });
    return { ok: true };
  },
}));
vi.mock('@/lib/env', () => ({
  env: () => ({ NEXT_PUBLIC_APP_URL: 'https://app.test', ILANIT_PHONE: '972500000000' }),
  collectionEnabled: () => true,
  receiptsEnabled: () => false,
}));

import { billableSessions, generateMonthlyBilling } from '@/lib/groups';
import { parseILDateTime } from '@/lib/time';
import { renderTemplate } from '@/lib/notifications/templates';

const FRIDAY_9 = { weekday: 5, startTime: '09:00:00' };
const fri = (d: string) => parseILDateTime(d, '09:00');
const session = (d: string, status = 'confirmed') => ({ startsAt: fri(d), status });

const group = {
  id: 'g-fri',
  name: 'שישי בבוקר',
  monthlyPrice: 0,
  pricePerSession: 100,
  active: true,
};

beforeEach(() => {
  state.selects = [];
  state.inserted = [];
  state.notified = [];
  state.now = new Date('2026-11-01T07:00:00Z');
});

describe('billableSessions', () => {
  it('counts every Friday of the month from the weekly schedule', async () => {
    // Nothing written to the diary at all — the series ran out. The month
    // still has four Fridays and the group still meets on all of them.
    state.selects = [[], [FRIDAY_9]];

    const dates = await billableSessions('g-fri', '2026-11-01', new Date(0));

    expect(dates.map((d) => d.toISOString())).toEqual(
      ['2026-11-06', '2026-11-13', '2026-11-20', '2026-11-27'].map((d) => fri(d).toISOString()),
    );
  });

  it('counts a five-Friday month as five', async () => {
    state.selects = [[], [FRIDAY_9]];
    const dates = await billableSessions('g-fri', '2027-01-01', new Date(0));
    expect(dates).toHaveLength(5); // 1, 8, 15, 22, 29 Jan 2027
  });

  it('does not double-count a Friday that is both scheduled and in the diary', async () => {
    state.selects = [[session('2026-11-06'), session('2026-11-13')], [FRIDAY_9]];
    const dates = await billableSessions('g-fri', '2026-11-01', new Date(0));
    expect(dates).toHaveLength(4);
  });

  it('leaves out a session that was called off', async () => {
    state.selects = [[session('2026-11-20', 'cancelled')], [FRIDAY_9]];
    const dates = await billableSessions('g-fri', '2026-11-01', new Date(0));
    expect(dates).toHaveLength(3);
    expect(dates.map((d) => d.getTime())).not.toContain(fri('2026-11-20').getTime());
  });

  it('counts only what is still ahead for a mid-month start', async () => {
    // Opened on Mon 9 Nov: the 6th has passed, three Fridays remain.
    state.selects = [[], [FRIDAY_9]];
    const dates = await billableSessions('g-fri', '2026-11-01', parseILDateTime('2026-11-09', '00:00'));
    expect(dates).toHaveLength(3);
  });
});

describe('generateMonthlyBilling — a per-session group', () => {
  it('charges price × sessions and tells the parent the dates', async () => {
    state.selects = [
      [group], // active groups
      [], // diary rows for the month
      [FRIDAY_9], // weekly schedule
      [{ studentId: 's1', name: 'נועה', phone: '972501111111', guardianPhone: null, collectFromDay: null }],
      [], // no charge yet this month
    ];

    const { created } = await generateMonthlyBilling('2026-11');

    expect(created).toBe(1);
    expect(state.inserted[0].amount).toBe(400);
    const req = state.notified.find((n) => n.template === 'pay_request_group');
    expect(req.vars.amount).toBe(400);
    expect(req.vars.details).toBe('4 מפגשים (6/11, 13/11, 20/11, 27/11) × 100 ₪');
  });

  it('bills nothing in a month with no sessions left', async () => {
    state.now = new Date('2026-11-28T08:00:00Z'); // after the last Friday
    state.selects = [[group], [], [FRIDAY_9]];

    const { created } = await generateMonthlyBilling('2026-11');

    expect(created).toBe(0);
    expect(state.notified).toHaveLength(0);
  });

  it('leaves a flat-fee group exactly as it was', async () => {
    state.selects = [
      [{ ...group, monthlyPrice: 320, pricePerSession: null }],
      [{ studentId: 's1', name: 'נועה', phone: '972501111111', guardianPhone: null, collectFromDay: null }],
      [],
    ];

    await generateMonthlyBilling('2026-11');

    expect(state.inserted[0].amount).toBe(320);
    expect(state.notified[0].vars.details).toBeUndefined();
  });
});

describe('pay_request_group', () => {
  it('shows the breakdown line only when there is one', () => {
    const base = { studentName: 'נועה', groupName: 'שישי בבוקר', month: '11/2026', amount: 400, actionUrl: 'https://x' };
    expect(renderTemplate('pay_request_group', { ...base, details: '4 מפגשים × 100 ₪' })).toContain('4 מפגשים');
    expect(renderTemplate('pay_request_group', base)).not.toContain('מפגשים');
  });
});
