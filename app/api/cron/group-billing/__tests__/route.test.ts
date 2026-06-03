import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/env', () => ({ env: () => ({ CRON_SECRET: 'super-secret-cron-value-1234' }) }));

const runGroupBilling = vi.fn((..._a: unknown[]) =>
  Promise.resolve({ monthISO: '2026-06-01', created: 4 }),
);
vi.mock('@/lib/jobs', () => ({ runGroupBilling: (...a: unknown[]) => runGroupBilling(...a) }));

const getSettings = vi.fn(async () => ({ groupBillingDay: 1 }));
vi.mock('@/lib/settings', () => ({ getSettings: () => getSettings() }));

// Controllable IL date — the route derives the day-of-month from toILDateStr.
let mockDateStr = '2026-06-01';
vi.mock('@/lib/time', () => ({
  nowIL: () => new Date('2026-06-01T00:00:00Z'),
  toILDateStr: () => mockDateStr,
}));

import { GET } from '@/app/api/cron/group-billing/route';

function authedReq(token = 'super-secret-cron-value-1234'): Request {
  return new Request('https://x/api/cron/group-billing', {
    headers: { authorization: `Bearer ${token}` },
  });
}

beforeEach(() => {
  runGroupBilling.mockClear();
  getSettings.mockClear();
  mockDateStr = '2026-06-01';
});

describe('GET /api/cron/group-billing', () => {
  it('401s without a valid CRON_SECRET', async () => {
    const res = await GET(new Request('https://x/api/cron/group-billing'));
    expect(res.status).toBe(401);
    expect(runGroupBilling).not.toHaveBeenCalled();
  });

  it('runs billing on the configured billing day', async () => {
    mockDateStr = '2026-06-01'; // day 1 === groupBillingDay
    const res = await GET(authedReq());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.isBillingDay).toBe(true);
    expect(runGroupBilling).toHaveBeenCalledTimes(1);
    expect(body.result.created).toBe(4);
  });

  it('does nothing on a non-billing day', async () => {
    mockDateStr = '2026-06-15'; // day 15 !== 1
    const res = await GET(authedReq());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.isBillingDay).toBe(false);
    expect(body.day).toBe(15);
    expect(runGroupBilling).not.toHaveBeenCalled();
  });

  it('returns 500 when billing throws', async () => {
    mockDateStr = '2026-06-01';
    runGroupBilling.mockRejectedValueOnce(new Error('billing failed'));
    const res = await GET(authedReq());
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('billing failed');
  });
});
