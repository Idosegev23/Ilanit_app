import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/env', () => ({ env: () => ({ CRON_SECRET: 'super-secret-cron-value-1234' }) }));

const runDayBeforeReminders = vi.fn((..._a: unknown[]) =>
  Promise.resolve({ studentReminders: 1, groupMemberReminders: 0, ilanitSummarySent: true }),
);
const runCalendarScan = vi.fn((..._a: unknown[]) =>
  Promise.resolve({ completed: 2, paymentPrompts: 2, needsMatchCreated: 0, groupSkipped: 1 }),
);
const runPaymentFollowup = vi.fn((..._a: unknown[]) =>
  Promise.resolve({ openDebts: 0, reminderSent: false }),
);
vi.mock('@/lib/jobs', () => ({
  runDayBeforeReminders: () => runDayBeforeReminders(),
  runCalendarScan: (...a: unknown[]) => runCalendarScan(...a),
  runPaymentFollowup: () => runPaymentFollowup(),
}));

const reconcileCancellations = vi.fn((..._a: unknown[]) =>
  Promise.resolve({ checked: 0, cancelled: 0 }),
);
vi.mock('@/lib/jobs/reconcile-cancellations', () => ({
  reconcileCancellations: () => reconcileCancellations(),
}));

// Collection runs on EVERY tick, so it is mocked here rather than reaching the
// real module (and a real database) from a route test.
const runPaymentRequests = vi.fn(async () => ({ requested: 0, skipped: 0 }));
const runPaymentConfirms = vi.fn(async () => ({ asked: 0 }));
vi.mock('@/lib/payments', () => ({
  runPaymentRequests: () => runPaymentRequests(),
  runPaymentConfirms: () => runPaymentConfirms(),
}));

const runReceiptReminders = vi.fn(async () => ({ pending: 0, totalAmount: 0, sent: false }));
vi.mock('@/lib/jobs/receipt-reminders', () => ({
  runReceiptReminders: () => runReceiptReminders(),
}));

const getSettings = vi.fn(async () => ({ reminderTime: '18:00' }));
vi.mock('@/lib/settings', () => ({ getSettings: () => getSettings() }));

// Controllable IL clock.
let mockHour = 9;
// The 3rd of the month, so the monthly receipt reminder stays out of these
// cases; the tests that care about it set this explicitly.
let mockDayOfMonth = 3;
vi.mock('@/lib/time', () => ({
  nowIL: () => new Date('2026-06-03T00:00:00Z'),
  ilHour: () => mockHour,
  ilDayOfMonth: () => mockDayOfMonth,
}));

import { GET } from '@/app/api/cron/tick/route';

function authedReq(token = 'super-secret-cron-value-1234'): Request {
  return new Request('https://x/api/cron/tick', {
    headers: { authorization: `Bearer ${token}` },
  });
}

beforeEach(() => {
  runDayBeforeReminders.mockClear();
  runCalendarScan.mockClear();
  runPaymentFollowup.mockClear();
  reconcileCancellations.mockClear();
  getSettings.mockClear();
  runPaymentRequests.mockClear();
  runPaymentConfirms.mockClear();
  runReceiptReminders.mockClear();
  mockHour = 9;
  mockDayOfMonth = 3;
});

describe('GET /api/cron/tick', () => {
  it('401s without a valid CRON_SECRET', async () => {
    const res = await GET(new Request('https://x/api/cron/tick'));
    expect(res.status).toBe(401);
    expect(runCalendarScan).not.toHaveBeenCalled();
  });

  it('401s with a wrong token', async () => {
    const res = await GET(authedReq('nope-nope-nope-nope-nope'));
    expect(res.status).toBe(401);
  });

  it('runs only the calendar scan outside the reminder hour', async () => {
    mockHour = 9; // not 18
    const res = await GET(authedReq());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.atReminderHour).toBe(false);
    expect(runCalendarScan).toHaveBeenCalledTimes(1);
    expect(reconcileCancellations).toHaveBeenCalledTimes(1); // every run
    expect(runDayBeforeReminders).not.toHaveBeenCalled();
    expect(runPaymentFollowup).not.toHaveBeenCalled();
  });

  it('runs all three jobs at the reminder hour', async () => {
    mockHour = 18;
    const res = await GET(authedReq());
    const body = await res.json();
    expect(body.atReminderHour).toBe(true);
    expect(runCalendarScan).toHaveBeenCalledTimes(1);
    expect(runDayBeforeReminders).toHaveBeenCalledTimes(1);
    expect(runPaymentFollowup).toHaveBeenCalledTimes(1);
    expect(body.ran.dayBeforeReminders).toBeDefined();
  });

  it('passes a trailing scan window (since < until = now)', async () => {
    await GET(authedReq());
    const [sinceISO, untilISO] = runCalendarScan.mock.calls[0] as [string, string];
    expect(new Date(sinceISO).getTime()).toBeLessThan(new Date(untilISO).getTime());
  });

  it('does not fail the whole tick if the calendar scan throws', async () => {
    runCalendarScan.mockRejectedValueOnce(new Error('boom'));
    const res = await GET(authedReq());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ran.calendarScanError).toBe('boom');
  });

  it('runs collection on EVERY tick, not just the reminder hour', async () => {
    // A lesson can start at any hour, so billing cannot wait for 18:00.
    mockHour = 9;
    await GET(authedReq());
    expect(runPaymentRequests).toHaveBeenCalledTimes(1);
    expect(runPaymentConfirms).toHaveBeenCalledTimes(1);
  });

  it('reminds about receipts only on the 1st, at the reminder hour', async () => {
    mockDayOfMonth = 1;
    mockHour = 18;
    await GET(authedReq());
    expect(runReceiptReminders).toHaveBeenCalledTimes(1);
  });

  it('does not remind about receipts on other days', async () => {
    mockDayOfMonth = 12;
    mockHour = 18;
    await GET(authedReq());
    expect(runReceiptReminders).not.toHaveBeenCalled();
  });

  it('does not remind about receipts at the wrong hour on the 1st', async () => {
    // Otherwise the hourly tick would send it 24 times that day.
    mockDayOfMonth = 1;
    mockHour = 9;
    await GET(authedReq());
    expect(runReceiptReminders).not.toHaveBeenCalled();
  });
});
