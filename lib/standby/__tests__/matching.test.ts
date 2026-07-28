import { describe, it, expect, vi, beforeEach } from 'vitest';

// findMatchingStandbys: a slot matches an active request when its weekday is in
// the request's weekdays AND its start time is within [startTime, endTime).
// offerFreedSlot: mints an offer + alerts Ilanit only when someone matches.

vi.mock('drizzle-orm', () => ({ and: (...a: unknown[]) => a, eq: () => ({}) }));
vi.mock('@/db/schema', () => ({
  standbyRequests: { __t: 'standby', status: {} },
  standbyOffers: { __t: 'offers', id: 'id' },
}));

let standbyRows: Array<Record<string, unknown>> = [];
const insertReturning = vi.fn(async () => [{ id: 'offer-1' }]);
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => Promise.resolve(standbyRows) }) }),
    insert: () => ({ values: () => ({ returning: () => insertReturning() }) }),
  },
}));

vi.mock('@/lib/students', () => ({
  findStudentByPhone: vi.fn(),
  createStudent: vi.fn(),
  contactPhoneFor: (s: { phone: string }) => s.phone,
}));
vi.mock('@/lib/env', () => ({
  env: () => ({ NEXT_PUBLIC_APP_URL: 'https://app.test', ILANIT_PHONE: '972500000000' }),
}));
const notify = vi.fn((..._a: unknown[]): Promise<{ ok: boolean }> => Promise.resolve({ ok: true }));
vi.mock('@/lib/notifications/dispatch', () => ({ notify: (...a: unknown[]) => notify(...a) }));

import { findMatchingStandbys, offerFreedSlot } from '@/lib/standby';
import { parseILDateTime } from '@/lib/time';

// 2026-07-19 is a Sunday (weekday 0) in Asia/Jerusalem.
const START = parseILDateTime('2026-07-19', '15:00');
const END = parseILDateTime('2026-07-19', '16:00');

function sb(over: Record<string, unknown>): Record<string, unknown> {
  return { id: 'x', name: 'n', phone: 'p', status: 'active', weekdays: '0', startTime: '14:00', endTime: '17:00', ...over };
}

beforeEach(() => {
  standbyRows = [];
  notify.mockReset().mockResolvedValue({ ok: true });
  insertReturning.mockClear();
});

describe('findMatchingStandbys', () => {
  it('matches on weekday + time-in-range, excludes the rest', async () => {
    standbyRows = [
      sb({ id: 'A', weekdays: '0,2', startTime: '14:00', endTime: '17:00' }), // ✓ Sun, 15:00 in range
      sb({ id: 'B', weekdays: '1,3', startTime: '14:00', endTime: '17:00' }), // ✗ not Sunday
      sb({ id: 'C', weekdays: '0', startTime: '15:00', endTime: '16:00' }), // ✓ inclusive start
      sb({ id: 'D', weekdays: '0', startTime: '16:00', endTime: '18:00' }), // ✗ starts after 15:00
      sb({ id: 'E', weekdays: '0', startTime: '13:00', endTime: '15:00' }), // ✗ end is exclusive
    ];
    const matches = await findMatchingStandbys(START, END);
    expect(matches.map((m) => m.id)).toEqual(['A', 'C']);
  });
});

describe('offerFreedSlot', () => {
  it('mints an offer and alerts Ilanit when someone matches', async () => {
    standbyRows = [sb({ id: 'A' })];
    const raw = await offerFreedSlot(START, END);
    expect(raw).toBeTruthy();
    expect(insertReturning).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledTimes(1);
    const [template, to, vars] = notify.mock.calls[0];
    expect(template).toBe('standby_slot_ilanit');
    expect(to).toBe('972500000000');
    expect(vars).toMatchObject({ count: 1 });
    expect(String((vars as { actionUrl: string }).actionUrl)).toContain('/s/');
  });

  it('does nothing when nobody matches', async () => {
    standbyRows = [sb({ id: 'B', weekdays: '3' })]; // Wednesday only
    const raw = await offerFreedSlot(START, END);
    expect(raw).toBeNull();
    expect(insertReturning).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });
});
