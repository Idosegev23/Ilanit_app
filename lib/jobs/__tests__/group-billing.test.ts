import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateMonthlyBilling = vi.fn((..._a: unknown[]) => Promise.resolve({ created: 5 }));
vi.mock('@/lib/groups', () => ({
  generateMonthlyBilling: (...a: unknown[]) => generateMonthlyBilling(...a),
}));

import { runGroupBilling } from '@/lib/jobs/group-billing';

beforeEach(() => generateMonthlyBilling.mockClear());

describe('runGroupBilling', () => {
  it('delegates to lib/groups with an explicit month and returns the count', async () => {
    const res = await runGroupBilling('2026-06-01');
    expect(generateMonthlyBilling).toHaveBeenCalledWith('2026-06-01');
    expect(res).toEqual({ monthISO: '2026-06-01', created: 5 });
  });

  it('defaults to the first day of the current month when none is given', async () => {
    const res = await runGroupBilling();
    expect(res.monthISO).toMatch(/^\d{4}-\d{2}-01$/);
    expect(generateMonthlyBilling).toHaveBeenCalledWith(res.monthISO);
    expect(res.created).toBe(5);
  });
});
