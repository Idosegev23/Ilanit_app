import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
  This route no longer decides WHEN to bill. It used to fire on
  settings.group_billing_day and charge every active group, which is how a group
  that had not met since July was billed ₪650 for August and again for
  September. The decision now belongs to each group's own first session; the
  route is only a daily second chance for a tick that failed.
*/

vi.mock('@/lib/env', () => ({ env: () => ({ CRON_SECRET: 'super-secret-cron-value-1234' }) }));

const runGroupBillingOnFirstSession = vi.fn((..._a: unknown[]) =>
  Promise.resolve({ billed: ['אנגלית כיתה ו'], created: 3 }),
);
vi.mock('@/lib/jobs', () => ({
  runGroupBillingOnFirstSession: (...a: unknown[]) => runGroupBillingOnFirstSession(...a),
}));

import { GET } from '@/app/api/cron/group-billing/route';

function authedReq(token = 'super-secret-cron-value-1234'): Request {
  return new Request('https://x/api/cron/group-billing', {
    headers: { authorization: `Bearer ${token}` },
  });
}

beforeEach(() => {
  runGroupBillingOnFirstSession.mockClear();
});

describe('GET /api/cron/group-billing', () => {
  it('401s without a valid CRON_SECRET', async () => {
    const res = await GET(new Request('https://x/api/cron/group-billing'));
    expect(res.status).toBe(401);
    expect(runGroupBillingOnFirstSession).not.toHaveBeenCalled();
  });

  it('401s with a wrong token', async () => {
    const res = await GET(authedReq('nope-nope-nope-nope-nope'));
    expect(res.status).toBe(401);
    expect(runGroupBillingOnFirstSession).not.toHaveBeenCalled();
  });

  it('runs the session-triggered job on EVERY day, not just the 1st', async () => {
    // A group's first session can fall on any date, so the safety net cannot be
    // gated on one.
    const res = await GET(authedReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(runGroupBillingOnFirstSession).toHaveBeenCalledTimes(1);
    expect(body.result.created).toBe(3);
  });

  it('returns 500 when billing throws', async () => {
    runGroupBillingOnFirstSession.mockRejectedValueOnce(new Error('billing failed'));
    const res = await GET(authedReq());
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('billing failed');
  });
});
