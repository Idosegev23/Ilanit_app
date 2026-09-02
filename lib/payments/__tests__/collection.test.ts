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
  bounds: [] as Array<{ op: string; col: unknown; v: unknown }>,
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
// Record the range predicates so the window can be asserted as behaviour
// rather than by matching source text.
vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => a,
  eq: () => ({}),
  isNull: () => ({}),
  lt: (col: unknown, v: unknown) => {
    state.bounds.push({ op: 'lt', col, v });
    return {};
  },
  gt: (col: unknown, v: unknown) => {
    state.bounds.push({ op: 'gt', col, v });
    return {};
  },
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
        const rows =
          table?.__t === 'payments'
            ? state.payments
            : table?.__t === 'students'
              ? state.students
              : state.lessons;
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
  state.bounds = [];
  state.consumed = { type: 'pay', lessonId: 'lesson-1' };
  Object.values(mocks).forEach((m) => m.mockClear());
});

describe('who the charge is for', () => {
  /*
    Ilanit's Bit alert used to open with an empty name, because it read
    `lesson.bookedByName` — which is only set when someone TYPED a name. A
    lesson booked against a roster student leaves it null, so she was told a
    payment had happened without being told whose.
  */
  it('names the linked student, not the typed booking name', async () => {
    state.payments = [{ id: 'pay-1', status: 'due', amount: 140, lessonId: 'lesson-1' }];
    state.lessons = [
      { id: 'lesson-1', studentId: 'stu-1', bookedByName: null, type: 'individual', startsAt: new Date('2026-09-01T13:00:00Z') },
    ];
    state.students = [{ id: 'stu-1', name: 'תהל בישלה' }];

    await declareIntent('tok', 'bit');

    const msg = state.notified.find((n) => n.template === 'pay_intent_ilanit');
    expect(msg.vars.studentName).toBe('תהל בישלה');
  });

  it('falls back to the typed name when no student is linked', async () => {
    state.payments = [{ id: 'pay-1', status: 'due', amount: 140, lessonId: 'lesson-1' }];
    state.lessons = [
      { id: 'lesson-1', studentId: null, bookedByName: 'הורה חדש', type: 'individual', startsAt: new Date('2026-09-01T13:00:00Z') },
    ];
    state.students = [];

    await declareIntent('tok', 'bit');

    const msg = state.notified.find((n) => n.template === 'pay_intent_ilanit');
    expect(msg.vars.studentName).toBe('הורה חדש');
  });

  it('never sends an alert with an empty name', async () => {
    state.payments = [{ id: 'pay-1', status: 'due', amount: 140, lessonId: 'lesson-1' }];
    state.lessons = [
      { id: 'lesson-1', studentId: null, bookedByName: null, type: 'individual', startsAt: new Date('2026-09-01T13:00:00Z') },
    ];
    state.students = [];

    await declareIntent('tok', 'bit');

    const msg = state.notified.find((n) => n.template === 'pay_intent_ilanit');
    expect(String(msg.vars.studentName).trim()).not.toBe('');
  });
});

describe('declareIntent — a declaration is never a payment', () => {
  it('records the intent WITHOUT settling the row', async () => {
    state.payments = [{ id: 'pay-1', status: 'due', amount: 140, lessonId: 'lesson-1' }];

    const res = await declareIntent('tok', 'paid');

    expect(res.ok).toBe(true);
    const patch = state.updates[0];
    expect(patch.intent).toBe('paid');
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

    const res = await declareIntent('tok', 'paid');

    expect(res.ok).toBe(false);
    expect(state.updates).toHaveLength(0);
  });

  it('is a no-op once the payment is already settled', async () => {
    state.payments = [{ id: 'pay-1', status: 'paid', amount: 140, lessonId: 'lesson-1' }];

    const res = await declareIntent('tok', 'paid');

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
        student: { id: 's1', name: 'דנה', defaultPrice: 140, autoCollect: true },
      },
    ];

    const res = await runPaymentRequests();

    expect(res.requested).toBe(1);
    expect(state.inserted[0]).toMatchObject({ status: 'due', amount: 140 });
    const msg = state.notified.find((n) => n.template === 'pay_request_individual');
    expect(msg.vars.actionUrl).toContain('/pay/');
  });

  it('records the debt but sends nothing for a hand-billed family', async () => {
    /*
      Ilanit settles some families privately and does not want them chased. The
      row must still be written — she reads what is owed off her own reports —
      but no request may leave the building.
    */
    state.lessons = [
      {
        lesson: {
          id: 'l1', type: 'individual', status: 'confirmed', price: 140,
          startsAt: new Date('2026-09-01T08:00:00Z'),
          endsAt: new Date('2026-09-01T09:00:00Z'),
        },
        student: { id: 's1', name: 'מיתר', defaultPrice: 140, autoCollect: false },
      },
    ];

    const res = await runPaymentRequests();

    expect(state.inserted[0]).toMatchObject({ status: 'due', amount: 140 });
    expect(res.requested).toBe(0);
    expect(state.notified.find((n) => n.template === 'pay_request_individual')).toBeUndefined();
  });

  it('records the charge but holds the request until the family pay-day', async () => {
    /*
      דריה טפר pays on the 15th. Charging her on the 2nd is correct; ASKING her
      on the 2nd is a fortnight of nagging. The row is written either way so
      Ilanit sees the money owed, and the deferred pass does the asking on the
      15th.
    */
    state.now = new Date('2026-09-02T12:00:00.000Z');
    state.lessons = [
      {
        lesson: {
          id: 'l1', type: 'individual', status: 'confirmed', price: 140,
          startsAt: new Date('2026-09-02T08:00:00Z'),
          endsAt: new Date('2026-09-02T09:00:00Z'),
        },
        student: {
          id: 's1', name: 'דריה טפר', defaultPrice: 140,
          autoCollect: true, collectFromDay: 15,
        },
      },
    ];

    const res = await runPaymentRequests();

    expect(state.inserted[0]).toMatchObject({ status: 'due', amount: 140 });
    expect(res.requested).toBe(0);
    expect(state.notified.find((n) => n.template === 'pay_request_individual')).toBeUndefined();
  });

  it('asks once the pay-day has arrived', async () => {
    state.now = new Date('2026-09-15T12:00:00.000Z');
    state.lessons = [
      {
        lesson: {
          id: 'l1', type: 'individual', status: 'confirmed', price: 140,
          startsAt: new Date('2026-09-15T08:00:00Z'),
          endsAt: new Date('2026-09-15T09:00:00Z'),
        },
        student: {
          id: 's1', name: 'דריה טפר', defaultPrice: 140,
          autoCollect: true, collectFromDay: 15,
        },
      },
    ];

    const res = await runPaymentRequests();

    expect(res.requested).toBe(1);
    expect(state.notified.find((n) => n.template === 'pay_request_individual')).toBeDefined();
  });

  it('bounds the query on BOTH sides so it cannot reach into the past', async () => {
    /*
      Without a lower bound, the first run after enabling collection bills the
      entire back catalogue — measured against production before switching on,
      that was nine lessons going back to July landing on four parents at once.
      So assert an upper AND a lower bound, and that the lower one is a few
      hours back rather than open-ended.
    */
    await runPaymentRequests();

    const upper = state.bounds.find((b) => b.op === 'lt');
    const lower = state.bounds.find((b) => b.op === 'gt');
    expect(upper).toBeTruthy();
    expect(lower).toBeTruthy();

    const floor = lower!.v as Date;
    const hoursBack = (state.now.getTime() - floor.getTime()) / 3600_000;
    expect(hoursBack).toBeGreaterThan(1);
    expect(hoursBack).toBeLessThanOrEqual(24);
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
