import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
  The rule these tests defend: a parent's DECLARATION is not a payment.

  Ilanit's Bit link carries no amount and no reference, and cash reports
  nothing, so nothing ever comes back from the money itself. If tapping
  "שילמתי במזומן" settled the row, debts would quietly disappear unpaid — the
  one failure here that costs real money.
*/

const state = vi.hoisted(() => ({
  lessons: [] as any[],
  payments: [] as any[],
  students: [] as any[],
  inserted: [] as any[],
  updates: [] as any[],
  notified: [] as any[],
  consumed: null as null | { type: string; lessonId: string },
  now: new Date('2026-09-01T12:00:00.000Z'),
}));

const mocks = vi.hoisted(() => ({
  notify: vi.fn(async (t: string, to: string, vars: any, rel?: string) => {
    state.notified.push({ template: t, to, vars, rel });
    return { ok: true };
  }),
  notifyStudent: vi.fn(async (s: any, t: string, vars: any, rel?: string) => {
    state.notified.push({ template: t, to: s?.name, vars, rel });
    return { ok: true };
  }),
  createActionToken: vi.fn(async () => 'raw-tok'),
  consumeActionToken: vi.fn(async () => state.consumed),
}));

vi.mock('@/lib/notifications/dispatch', () => ({
  notify: mocks.notify,
  notifyStudent: mocks.notifyStudent,
}));
vi.mock('@/lib/tokens', () => ({
  createActionToken: mocks.createActionToken,
  consumeActionToken: mocks.consumeActionToken,
  hashToken: (r: string) => `h-${r}`,
}));
vi.mock('@/lib/settings', () => ({
  getSettings: async () => ({ bitLink: 'https://bit.test/me/abc' }),
}));
vi.mock('@/lib/env', () => ({
  env: () => ({ NEXT_PUBLIC_APP_URL: 'https://app.test', ILANIT_PHONE: '972545886779' }),
}));
vi.mock('@/lib/time', async () => {
  const actual = await vi.importActual<typeof import('@/lib/time')>('@/lib/time');
  return { ...actual, nowIL: () => state.now };
});
vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => a,
  eq: () => ({}),
  isNull: () => ({}),
  lt: () => ({}),
  gt: () => ({}),
}));
// Tagged so the db mock can answer by TABLE rather than by call order — the
// two functions under test query in different orders.
vi.mock('@/db/schema', () => ({
  payments: { __t: 'payments' },
  lessons: { __t: 'lessons' },
  students: { __t: 'students' },
  actionTokens: { __t: 'actionTokens' },
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: (table: { __t?: string }) => {
        const rows = table?.__t === 'payments' ? state.payments : state.lessons;
        const chain: any = {
          leftJoin: () => chain,
          innerJoin: () => chain,
          where: () => chain,
          limit: async () => rows,
        };
        return chain;
      },
    }),
    insert: () => ({
      values: (v: any) => {
        state.inserted.push(v);
        return { returning: async () => [{ id: `pay-${state.inserted.length}`, ...v }] };
      },
    }),
    update: () => ({
      set: (patch: any) => ({
        where: async () => {
          state.updates.push(patch);
        },
      }),
    }),
  },
}));

import { declareIntent, runPaymentRequests } from '@/lib/payments';

beforeEach(() => {
  state.lessons = [];
  state.payments = [];
  state.inserted = [];
  state.updates = [];
  state.notified = [];
  state.consumed = { type: 'pay', lessonId: 'lesson-1' };
  Object.values(mocks).forEach((m) => m.mockClear());
});

describe('declareIntent — a declaration is never a payment', () => {
  it('records the intent WITHOUT settling the row', async () => {
    state.payments = [{ id: 'pay-1', status: 'due', amount: 140, lessonId: 'lesson-1' }];

    const res = await declareIntent('tok', 'cash');

    expect(res.ok).toBe(true);
    const patch = state.updates[0];
    expect(patch.intent).toBe('cash');
    // The load-bearing assertion: nothing here settles the debt.
    expect(patch.status).toBeUndefined();
    expect(patch.paidAt).toBeUndefined();
  });

  it('tells Ilanit at once so she can watch for the money', async () => {
    state.payments = [{ id: 'pay-1', status: 'due', amount: 140, lessonId: 'lesson-1' }];

    await declareIntent('tok', 'bit');

    const msg = state.notified.find((n) => n.template === 'pay_intent_ilanit');
    expect(msg).toBeTruthy();
    expect(msg.vars.methodLabel).toContain('ביט');
  });

  it('rejects a token of the wrong kind', async () => {
    // A cancel or approve link must not be able to settle a payment.
    state.consumed = { type: 'cancel', lessonId: 'lesson-1' };

    const res = await declareIntent('tok', 'cash');

    expect(res.ok).toBe(false);
    expect(state.updates).toHaveLength(0);
  });

  it('is a no-op once the payment is already settled', async () => {
    state.payments = [{ id: 'pay-1', status: 'paid', amount: 140, lessonId: 'lesson-1' }];

    const res = await declareIntent('tok', 'cash');

    expect(res.ok).toBe(true);
    expect(state.updates).toHaveLength(0);
  });
});

describe('runPaymentRequests', () => {
  it('bills a finished lesson and messages the parent', async () => {
    state.lessons = [
      {
        lesson: {
          id: 'l1', type: 'individual', status: 'confirmed', price: 140,
          startsAt: new Date('2026-09-01T08:00:00Z'),
          endsAt: new Date('2026-09-01T09:00:00Z'),
        },
        student: { id: 's1', name: 'דנה', defaultPrice: 140 },
      },
    ];

    const res = await runPaymentRequests();

    expect(res.requested).toBe(1);
    expect(state.inserted[0]).toMatchObject({ status: 'due', amount: 140 });
    const msg = state.notified.find((n) => n.template === 'pay_request_individual');
    expect(msg.vars.actionUrl).toContain('/pay/');
  });

  it('never reaches back beyond its window', async () => {
    // Without a lower bound the first run after enabling collection bills the
    // whole back catalogue at once — nine lessons and four surprised parents,
    // when this was written.
    const mod = await import('@/lib/payments');
    const src = (await import('node:fs')).readFileSync('lib/payments/index.ts', 'utf8');
    expect(src).toContain('PRIVATE_REQUEST_WINDOW_H');
    expect(src).toContain('gt(lessons.endsAt, floor)');
    expect(typeof mod.runPaymentRequests).toBe('function');
  });

  it('skips a student whose price is zero — an exemption, not a debt', async () => {
    // עומריקה is deliberately at 0; billing her would be wrong.
    state.lessons = [
      {
        lesson: {
          id: 'l1', type: 'individual', status: 'confirmed', price: null,
          startsAt: new Date('2026-09-01T08:00:00Z'),
          endsAt: new Date('2026-09-01T09:00:00Z'),
        },
        student: { id: 's1', name: 'עומריקה', defaultPrice: 0 },
      },
    ];

    const res = await runPaymentRequests();

    expect(res.requested).toBe(0);
    expect(res.skipped).toBe(1);
    expect(state.inserted).toHaveLength(0);
  });
});
