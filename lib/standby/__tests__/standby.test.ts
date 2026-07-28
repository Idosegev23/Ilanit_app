import { describe, it, expect, vi, beforeEach } from 'vitest';

// createStandbyRequest: validate → find/create student → store → confirm.

vi.mock('@/db/schema', () => ({ standbyRequests: { __t: 'standby' } }));

const inserted: Record<string, unknown>[] = [];
vi.mock('@/lib/db', () => ({
  db: { insert: () => ({ values: (v: Record<string, unknown>) => { inserted.push(v); return Promise.resolve(); } }) },
}));

const findStudentByPhone = vi.fn(async (_p: string): Promise<unknown> => null);
const createStudent = vi.fn(async (v: { name: string; phone: string }) => ({ id: 'stud-new', ...v, guardianPhone: null }));
vi.mock('@/lib/students', () => ({
  findStudentByPhone: (p: string) => findStudentByPhone(p),
  createStudent: (v: { name: string; phone: string }) => createStudent(v),
  contactPhoneFor: (s: { phone: string; guardianPhone?: string | null }) => s.guardianPhone || s.phone,
}));

const notify = vi.fn((..._a: unknown[]): Promise<{ ok: boolean }> => Promise.resolve({ ok: true }));
vi.mock('@/lib/notifications/dispatch', () => ({ notify: (...a: unknown[]) => notify(...a) }));

import { createStandbyRequest, weekdaysLabel, normalizeWeekdays } from '@/lib/standby';

beforeEach(() => {
  inserted.length = 0;
  findStudentByPhone.mockReset().mockResolvedValue(null);
  createStudent.mockClear();
  notify.mockReset().mockResolvedValue({ ok: true });
});

const valid = {
  name: 'דנה',
  phone: '0541234567',
  weekdays: [0, 2, 4],
  startTime: '14:00',
  endTime: '17:00',
};

describe('weekdaysLabel / normalizeWeekdays', () => {
  it('sorts, de-dupes, drops invalid, and labels in Hebrew', () => {
    expect(normalizeWeekdays([4, 0, 4, 9, -1, 2])).toEqual([0, 2, 4]);
    expect(weekdaysLabel([2, 0])).toBe('ראשון, שלישי');
  });
});

describe('createStandbyRequest', () => {
  it('stores the request and confirms to the visitor', async () => {
    const res = await createStandbyRequest(valid);
    expect(res.ok).toBe(true);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ weekdays: '0,2,4', startTime: '14:00', endTime: '17:00', status: 'active' });
    expect(createStudent).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toBe('standby_registered_student');
  });

  it('reuses an existing student by phone (no create)', async () => {
    findStudentByPhone.mockResolvedValue({ id: 'stud-1', phone: '+972541234567', guardianPhone: null });
    const res = await createStandbyRequest(valid);
    expect(res.ok).toBe(true);
    expect(createStudent).not.toHaveBeenCalled();
    expect(inserted[0]).toMatchObject({ studentId: 'stud-1' });
  });

  it('rejects when no weekday is chosen', async () => {
    const res = await createStandbyRequest({ ...valid, weekdays: [] });
    expect(res.ok).toBe(false);
    expect(inserted).toHaveLength(0);
  });

  it('rejects an inverted time range', async () => {
    const res = await createStandbyRequest({ ...valid, startTime: '17:00', endTime: '14:00' });
    expect(res.ok).toBe(false);
    expect(inserted).toHaveLength(0);
  });

  it('rejects a missing name/phone', async () => {
    expect((await createStandbyRequest({ ...valid, name: '  ' })).ok).toBe(false);
    expect((await createStandbyRequest({ ...valid, phone: '' })).ok).toBe(false);
    expect(inserted).toHaveLength(0);
  });

  it('still succeeds when the confirmation message fails', async () => {
    notify.mockRejectedValue(new Error('whatsapp down'));
    const res = await createStandbyRequest(valid);
    expect(res.ok).toBe(true);
    expect(inserted).toHaveLength(1);
  });
});
