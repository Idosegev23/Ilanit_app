import { describe, it, expect, vi, beforeEach } from 'vitest';

// Reconciliation frees slots for lessons Ilanit deleted in Google Calendar. The
// critical safety property: a lesson is cancelled ONLY on a definitive
// getEvent→null (404/410), NEVER on a transient error (getEvent throws).

const getEvent = vi.fn(async (_id: string) => null as unknown);
vi.mock('@/lib/google-calendar', () => ({ getEvent: (id: string) => getEvent(id) }));

vi.mock('@/lib/time', () => ({ nowIL: () => new Date('2026-07-01T00:00:00.000Z') }));

vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => a,
  eq: () => ({}),
  gte: () => ({}),
  lte: () => ({}),
  inArray: () => ({}),
  isNotNull: () => ({}),
  isNull: () => ({}),
}));
vi.mock('@/db/schema', () => ({
  lessons: {
    __t: 'lessons',
    id: {},
    googleEventId: {},
    status: {},
    startsAt: {},
    recurrenceId: {},
  },
}));

let selectResult: Array<{ id: string; googleEventId: string | null }> = [];
const updates: Array<{ patch: Record<string, unknown> }> = [];

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve(selectResult) }) }),
    }),
    update: () => ({
      set: (patch: Record<string, unknown>) => ({
        where: () => {
          updates.push({ patch });
          return Promise.resolve();
        },
      }),
    }),
  },
}));

import { reconcileCancellations } from '@/lib/jobs/reconcile-cancellations';

beforeEach(() => {
  getEvent.mockReset();
  getEvent.mockResolvedValue(null);
  selectResult = [];
  updates.length = 0;
});

describe('reconcileCancellations', () => {
  it('cancels a lesson whose Google event is gone (deleted)', async () => {
    selectResult = [{ id: 'l1', googleEventId: 'g1' }];
    getEvent.mockResolvedValue(null);
    const res = await reconcileCancellations();
    expect(res).toEqual({ checked: 1, cancelled: 1 });
    expect(updates).toHaveLength(1);
    expect(updates[0].patch).toMatchObject({
      status: 'cancelled',
      cancelReason: 'google_deleted',
    });
  });

  it('keeps a lesson whose event still exists', async () => {
    selectResult = [{ id: 'l1', googleEventId: 'g1' }];
    getEvent.mockResolvedValue({ id: 'g1', summary: 'שיעור' });
    const res = await reconcileCancellations();
    expect(res).toEqual({ checked: 1, cancelled: 0 });
    expect(updates).toHaveLength(0);
  });

  it('NEVER cancels on a transient Google error', async () => {
    selectResult = [{ id: 'l1', googleEventId: 'g1' }];
    getEvent.mockRejectedValue(new Error('rate limited'));
    const res = await reconcileCancellations();
    expect(res).toEqual({ checked: 1, cancelled: 0 });
    expect(updates).toHaveLength(0);
  });

  it('no candidate lessons → no work', async () => {
    selectResult = [];
    const res = await reconcileCancellations();
    expect(res).toEqual({ checked: 0, cancelled: 0 });
    expect(getEvent).not.toHaveBeenCalled();
  });
});
