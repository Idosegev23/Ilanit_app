import { describe, it, expect, vi, beforeEach } from 'vitest';

const notify = vi.fn((..._a: unknown[]) => Promise.resolve({ ok: true }));
vi.mock('@/lib/notifications/dispatch', () => ({ notify: (...a: unknown[]) => notify(...a) }));

const getSettings = vi.fn(async () => ({ paymentFollowupDelayH: 24 }));
vi.mock('@/lib/settings', () => ({ getSettings: () => getSettings() }));

vi.mock('@/lib/env', () => ({ env: () => ({ ILANIT_PHONE: '972545886779' }) }));

vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => a,
  eq: (...a: unknown[]) => a,
  lt: (...a: unknown[]) => a,
}));

vi.mock('@/db/schema', () => ({
  payments: { __t: 'payments', id: { __c: 'id' }, amount: { __c: 'amount' }, status: { __c: 'status' }, createdAt: { __c: 'createdAt' }, lessonId: { __c: 'lessonId' } },
  lessons: { __t: 'lessons', id: { __c: 'id' }, startsAt: { __c: 'startsAt' }, studentId: { __c: 'studentId' } },
  students: { __t: 'students', id: { __c: 'id' }, name: { __c: 'name' } },
}));

let selectResult: unknown[] = [];
function makeSelectBuilder() {
  const b: Record<string, unknown> = {};
  const chain = () => () => b;
  b.from = chain();
  b.innerJoin = chain();
  b.leftJoin = chain();
  b.where = chain();
  b.then = (resolve: (v: unknown[]) => unknown) => resolve(selectResult);
  return b;
}
vi.mock('@/lib/db', () => ({ db: { select: () => makeSelectBuilder() } }));

import { runPaymentFollowup } from '@/lib/jobs/payment-followup';

beforeEach(() => {
  notify.mockClear();
  getSettings.mockClear();
  selectResult = [];
});

describe('runPaymentFollowup', () => {
  it('sends Ilanit a consolidated reminder of overdue debts', async () => {
    selectResult = [
      { paymentId: 'p1', amount: 120, startsAt: new Date('2026-06-01T10:00:00Z'), studentName: 'דנה' },
      { paymentId: 'p2', amount: 80, startsAt: new Date('2026-06-01T12:00:00Z'), studentName: 'יוסי' },
    ];

    const res = await runPaymentFollowup();

    expect(res.openDebts).toBe(2);
    expect(res.reminderSent).toBe(true);
    expect(notify).toHaveBeenCalledTimes(1);
    const call = notify.mock.calls[0];
    expect(call[0]).toBe('payment_followup_ilanit');
    expect(call[1]).toBe('972545886779');
    const summary = (call[2] as Record<string, string>).summary;
    expect(summary).toContain('דנה');
    expect(summary).toContain('יוסי');
    expect(summary).toContain('200'); // total 120 + 80
    // idempotency key is per-day
    expect(String(call[3])).toMatch(/^followup:\d{4}-\d{2}-\d{2}$/);
  });

  it('falls back to a generic label when a debt has no student', async () => {
    selectResult = [{ paymentId: 'p1', amount: 100, startsAt: new Date(), studentName: null }];
    const res = await runPaymentFollowup();
    expect(res.openDebts).toBe(1);
    const summary = (notify.mock.calls[0][2] as Record<string, string>).summary;
    expect(summary).toContain('תלמיד/ה');
  });

  it('does nothing when there are no overdue debts', async () => {
    selectResult = [];
    const res = await runPaymentFollowup();
    expect(res).toEqual({ openDebts: 0, reminderSent: false });
    expect(notify).not.toHaveBeenCalled();
  });
});
