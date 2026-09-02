import { describe, it, expect, vi, beforeEach } from 'vitest';

// Records the range predicates, so the ₪0 rule — which lives in SQL and never
// reaches the rows the mock returns — can still be asserted as behaviour.
const bounds = vi.hoisted(() => ({ gt: [] as Array<{ col: unknown; v: unknown }> }));

const notify = vi.fn((..._a: unknown[]) => Promise.resolve({ ok: true }));
vi.mock('@/lib/notifications/dispatch', () => ({ notify: (...a: unknown[]) => notify(...a) }));

const getSettings = vi.fn(async () => ({ paymentFollowupDelayH: 24 }));
vi.mock('@/lib/settings', () => ({ getSettings: () => getSettings() }));

vi.mock('@/lib/env', () => ({ env: () => ({ ILANIT_PHONE: '972545886779' }) }));

vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => a,
  eq: (...a: unknown[]) => a,
  lt: (...a: unknown[]) => a,
  gt: (col: unknown, v: unknown) => {
    bounds.gt.push({ col, v });
    return [col, v];
  },
}));

vi.mock('@/db/schema', () => ({
  payments: { __t: 'payments', id: { __c: 'id' }, amount: { __c: 'amount' }, status: { __c: 'status' }, createdAt: { __c: 'createdAt' }, lessonId: { __c: 'lessonId' } },
  lessons: { __t: 'lessons', id: { __c: 'id' }, startsAt: { __c: 'startsAt' }, studentId: { __c: 'studentId' } },
  students: {
    __t: 'students',
    id: { __c: 'id' },
    name: { __c: 'name' },
    autoCollect: { __c: 'autoCollect' },
  },
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
  bounds.gt = [];
});

describe('runPaymentFollowup', () => {
  /*
    This note is a WORKLIST, not a ledger. The 01/09 one went out as thirteen
    lines, most of them ₪0, for the two families Ilanit had just said she
    settles by hand — unreadable and pointless in the same message. Each test
    below pins one of the rules that came out of it.
  */
  function due(over: Record<string, unknown> = {}) {
    return {
      amount: 140,
      startsAt: new Date('2026-08-01T10:00:00Z'),
      studentId: 's1',
      studentName: 'דנה',
      autoCollect: true,
      ...over,
    };
  }

  it('sends Ilanit one line per family, not per lesson', async () => {
    selectResult = [
      due({ amount: 140, startsAt: new Date('2026-08-01T10:00:00Z') }),
      due({ amount: 140, startsAt: new Date('2026-08-08T10:00:00Z') }),
      due({ amount: 120, startsAt: new Date('2026-08-15T10:00:00Z') }),
      due({ studentId: 's2', studentName: 'יוסי', amount: 80 }),
    ];

    const res = await runPaymentFollowup();

    expect(res.reminderSent).toBe(true);
    const call = notify.mock.calls[0];
    expect(call[0]).toBe('payment_followup_ilanit');
    expect(call[1]).toBe('972545886779');
    const summary = (call[2] as Record<string, string>).summary;

    // Four charges, two families → two lines.
    expect(summary.split('\n').filter((l) => l.startsWith('•'))).toHaveLength(2);
    expect(summary).toContain('דנה');
    expect(summary).toContain('400'); // 140 + 140 + 120, summed per family
    expect(summary).toContain('480'); // grand total
    // Biggest debt first — that is the call worth making tonight.
    expect(summary.indexOf('דנה')).toBeLessThan(summary.indexOf('יוסי'));
    expect(String(call[3])).toMatch(/^followup:\d{4}-\d{2}-\d{2}$/);
  });

  it('says nothing about a family Ilanit settles by hand', async () => {
    // She has already decided not to chase them; a nightly reminder of that
    // decision is the friction this note exists to remove.
    selectResult = [
      due({ studentId: 'm1', studentName: 'מיתר', amount: 1360, autoCollect: false }),
    ];

    const res = await runPaymentFollowup();

    expect(res).toEqual({ openDebts: 0, reminderSent: false });
    expect(notify).not.toHaveBeenCalled();
  });

  it('leaves an unmatched import off the chase list', async () => {
    // No student means nobody can be asked to settle it — it needs assigning
    // first, so it is not a debt yet.
    selectResult = [due({ studentId: null, studentName: null })];

    const res = await runPaymentFollowup();

    expect(res).toEqual({ openDebts: 0, reminderSent: false });
    expect(notify).not.toHaveBeenCalled();
  });

  it('drops the grand total when there is only one family to chase', async () => {
    selectResult = [due()];

    await runPaymentFollowup();

    const summary = (notify.mock.calls[0][2] as Record<string, string>).summary;
    expect(summary).not.toContain('סה"כ');
    expect(summary).toContain('שיעור אחד');
  });

  it('excludes a ₪0 charge in the query itself', async () => {
    /*
      A zero charge is an exemption or a row created before a price was set —
      never money anyone owes. Thirteen "₪0" lines is what made the 01/09 note
      unreadable, and filtering it in SQL keeps the rows from ever arriving.
    */
    await runPaymentFollowup();

    const zeroBound = bounds.gt.find((b) => (b.col as { __c?: string })?.__c === 'amount');
    expect(zeroBound).toBeDefined();
    expect(zeroBound!.v).toBe(0);
  });

  it('does nothing when there are no overdue debts', async () => {
    selectResult = [];
    const res = await runPaymentFollowup();
    expect(res).toEqual({ openDebts: 0, reminderSent: false });
    expect(notify).not.toHaveBeenCalled();
  });
});
