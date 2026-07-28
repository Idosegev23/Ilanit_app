import { describe, it, expect, vi, beforeEach } from 'vitest';

// approveStandby: an OPEN offer + an ACTIVE standby → place the student on the
// slot, then mark filled. If placement fails, nothing is marked filled.

const findOpenOffer = vi.fn((..._a: unknown[]): Promise<unknown> => Promise.resolve(null));
const getActiveStandby = vi.fn((..._a: unknown[]): Promise<unknown> => Promise.resolve(null));
const markStandbyFilled = vi.fn((..._a: unknown[]): Promise<void> => Promise.resolve());
vi.mock('@/lib/standby', () => ({
  findOpenOffer: (...a: unknown[]) => findOpenOffer(...a),
  getActiveStandby: (...a: unknown[]) => getActiveStandby(...a),
  markStandbyFilled: (...a: unknown[]) => markStandbyFilled(...a),
}));

const placeConfirmedLesson = vi.fn(
  (..._a: unknown[]): Promise<{ ok: boolean; error?: string; lessonId?: string }> =>
    Promise.resolve({ ok: true, lessonId: 'l1' }),
);
vi.mock('@/lib/scheduling', () => ({ placeConfirmedLesson: (...a: unknown[]) => placeConfirmedLesson(...a) }));

const getStudent = vi.fn(async (_id: string) => ({ id: 'stud-1', name: 'דנה', phone: '+972500000000', email: null }));
vi.mock('@/lib/students', () => ({
  getStudent: (id: string) => getStudent(id),
  findStudentByPhone: vi.fn(async () => null),
  createStudent: vi.fn(async (v: Record<string, unknown>) => ({ id: 'stud-new', ...v })),
}));

import { approveStandby } from '@/app/s/[token]/actions';

const OFFER = { id: 'offer-1', startsAt: new Date('2026-07-19T12:00:00Z'), endsAt: new Date('2026-07-19T13:00:00Z') };
const STANDBY = { id: 'sb-1', studentId: 'stud-1', name: 'דנה', phone: '+972500000000', email: null };

beforeEach(() => {
  findOpenOffer.mockReset().mockResolvedValue(OFFER);
  getActiveStandby.mockReset().mockResolvedValue(STANDBY);
  markStandbyFilled.mockReset().mockResolvedValue(undefined);
  placeConfirmedLesson.mockReset().mockResolvedValue({ ok: true, lessonId: 'l1' });
  getStudent.mockClear();
});

describe('approveStandby', () => {
  it('places the student and marks filled', async () => {
    const res = await approveStandby('tok', 'sb-1');
    expect(res.ok).toBe(true);
    expect(placeConfirmedLesson).toHaveBeenCalledTimes(1);
    expect(placeConfirmedLesson.mock.calls[0][0]).toMatchObject({ source: 'standby' });
    expect(markStandbyFilled).toHaveBeenCalledWith('offer-1', 'sb-1');
  });

  it('rejects when the offer is not open', async () => {
    findOpenOffer.mockResolvedValue(null);
    const res = await approveStandby('tok', 'sb-1');
    expect(res.ok).toBe(false);
    expect(placeConfirmedLesson).not.toHaveBeenCalled();
    expect(markStandbyFilled).not.toHaveBeenCalled();
  });

  it('rejects when the standby is no longer active', async () => {
    getActiveStandby.mockResolvedValue(null);
    const res = await approveStandby('tok', 'sb-1');
    expect(res.ok).toBe(false);
    expect(placeConfirmedLesson).not.toHaveBeenCalled();
  });

  it('does NOT mark filled when scheduling fails', async () => {
    placeConfirmedLesson.mockResolvedValue({ ok: false, error: 'boom' });
    const res = await approveStandby('tok', 'sb-1');
    expect(res.ok).toBe(false);
    expect(markStandbyFilled).not.toHaveBeenCalled();
  });
});
