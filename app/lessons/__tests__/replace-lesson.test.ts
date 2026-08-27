import { describe, it, expect, vi, beforeEach } from 'vitest';

// replaceLesson orchestration + the critical safety property: the replacement is
// scheduled FIRST, and the original is cancelled ONLY after that succeeds — so a
// failed replacement never empties the slot.

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/auth', () => ({ auth: vi.fn(async () => ({ user: { email: 'owner' } })) }));

vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => a,
  eq: () => ({}),
  isNull: () => ({}),
  isNotNull: () => ({}),
}));
vi.mock('@/db/schema', () => ({ lessons: { __t: 'lessons' } }));

interface LessonRow {
  id: string;
  status: string;
  studentId: string | null;
  startsAt: Date;
  endsAt: Date;
  bookedByName: string | null;
  bookedByPhone: string | null;
}
let originalRow: LessonRow | null = null;
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve(originalRow ? [originalRow] : []) }) }),
    }),
  },
}));

const getStudent = vi.fn(async (_id: string): Promise<unknown> => null);
// Replacement resolution now goes through the duplicate guards: everyone
// reachable at the phone, and anyone with the same normalised name.
const findStudentsByContactPhone = vi.fn(async (_p: string): Promise<unknown[]> => []);
const findStudentsByNormalizedName = vi.fn(async (_n: string): Promise<unknown[]> => []);
const createStudent = vi.fn(async (v: { name: string; phone: string }) => ({ id: 'new-1', ...v }));
vi.mock('@/lib/students', () => ({
  getStudent: (id: string) => getStudent(id),
  findStudentsByContactPhone: (p: string) => findStudentsByContactPhone(p),
  findStudentsByNormalizedName: (n: string) => findStudentsByNormalizedName(n),
  createStudent: (v: { name: string; phone: string }) => createStudent(v),
  findOrCreateStudentByName: vi.fn(),
}));

vi.mock('@/lib/settings', () => ({ getSettings: vi.fn(async () => ({})) }));
vi.mock('@/lib/env', () => ({ env: () => ({ NEXT_PUBLIC_APP_URL: 'https://app.test' }) }));
vi.mock('@/lib/google-calendar', () => ({ insertEvent: vi.fn(), getEvent: vi.fn() }));

const cancelOne = vi.fn((..._a: unknown[]): Promise<void> => Promise.resolve());
vi.mock('@/lib/recurrence', () => ({ cancelOne: (...a: unknown[]) => cancelOne(...a), createSeries: vi.fn() }));

vi.mock('@/lib/ai/parse-lesson', () => ({ parseLessonTitle: vi.fn() }));

const notify = vi.fn((..._a: unknown[]): Promise<{ ok: boolean }> => Promise.resolve({ ok: true }));
const notifyStudent = vi.fn((..._a: unknown[]): Promise<{ ok: boolean }> => Promise.resolve({ ok: true }));
vi.mock('@/lib/notifications/dispatch', () => ({
  notify: (...a: unknown[]) => notify(...a),
  notifyStudent: (...a: unknown[]) => notifyStudent(...a),
}));

const scheduleStudentLesson = vi.fn(
  (..._a: unknown[]): Promise<{ ok: boolean; error?: string }> => Promise.resolve({ ok: true }),
);
vi.mock('@/app/students/actions', () => ({
  scheduleStudentLesson: (...a: unknown[]) => scheduleStudentLesson(...a),
}));

vi.mock('@/lib/calendar-link', () => ({ addToCalendarUrl: vi.fn(() => 'cal') }));
vi.mock('@/lib/availability/cancel', () => ({ createCancelUrl: vi.fn(async () => 'c') }));

import { replaceLesson } from '@/app/lessons/actions';

function orig(over: Partial<LessonRow> = {}): LessonRow {
  return {
    id: 'orig-1',
    status: 'confirmed',
    studentId: 'stud-orig',
    startsAt: new Date('2026-07-20T07:00:00.000Z'),
    endsAt: new Date('2026-07-20T08:00:00.000Z'),
    bookedByName: 'לינוי',
    bookedByPhone: '+972500000000',
    ...over,
  };
}

beforeEach(() => {
  originalRow = orig();
  getStudent.mockReset().mockImplementation(async (id: string) =>
    id === 'stud-orig' ? { id: 'stud-orig', name: 'לינוי', phone: '+972500000000' } : { id, name: 'דנה', phone: '+972511111111' },
  );
  findStudentsByContactPhone.mockReset().mockResolvedValue([]);
  findStudentsByNormalizedName.mockReset().mockResolvedValue([]);
  createStudent.mockClear();
  cancelOne.mockReset().mockResolvedValue(undefined);
  notify.mockReset().mockResolvedValue({ ok: true });
  notifyStudent.mockReset().mockResolvedValue({ ok: true });
  scheduleStudentLesson.mockReset().mockResolvedValue({ ok: true });
});

describe('replaceLesson', () => {
  it('SAFETY: if scheduling the replacement fails, the original is NOT cancelled', async () => {
    scheduleStudentLesson.mockResolvedValue({ ok: false, error: 'boom' });
    const res = await replaceLesson({ originalLessonId: 'orig-1', studentId: 'stud-new' });
    expect(res.ok).toBe(false);
    expect(scheduleStudentLesson).toHaveBeenCalledTimes(1);
    expect(cancelOne).not.toHaveBeenCalled();
  });

  it('happy path: schedules new, then cancels original and notifies its student', async () => {
    const res = await replaceLesson({ originalLessonId: 'orig-1', studentId: 'stud-new' });
    expect(res.ok).toBe(true);
    expect(scheduleStudentLesson).toHaveBeenCalledTimes(1);
    expect(cancelOne).toHaveBeenCalledWith('orig-1');
    expect(notifyStudent).toHaveBeenCalledTimes(1);
    expect(notifyStudent.mock.calls[0][1]).toBe('lesson_replaced_student');
  });

  it('passes the original slot start + duration to the scheduler', async () => {
    await replaceLesson({ originalLessonId: 'orig-1', studentId: 'stud-new' });
    const fd = scheduleStudentLesson.mock.calls[0][0] as FormData;
    expect(fd.get('studentId')).toBe('stud-new');
    expect(fd.get('durationMin')).toBe('60');
    expect(fd.get('time')).toBe('10:00'); // 07:00Z == 10:00 Asia/Jerusalem (summer)
  });

  it('creates a new student when name+phone given instead of an id', async () => {
    const res = await replaceLesson({
      originalLessonId: 'orig-1',
      newStudentName: 'תלמיד חדש',
      newStudentPhone: '0501234567',
    });
    expect(res.ok).toBe(true);
    expect(createStudent).toHaveBeenCalledTimes(1);
    expect(scheduleStudentLesson).toHaveBeenCalledTimes(1);
  });

  it('rejects replacing with the same student', async () => {
    const res = await replaceLesson({ originalLessonId: 'orig-1', studentId: 'stud-orig' });
    expect(res.ok).toBe(false);
    expect(scheduleStudentLesson).not.toHaveBeenCalled();
  });

  it('rejects an inactive original lesson', async () => {
    originalRow = orig({ status: 'cancelled' });
    const res = await replaceLesson({ originalLessonId: 'orig-1', studentId: 'stud-new' });
    expect(res.ok).toBe(false);
    expect(scheduleStudentLesson).not.toHaveBeenCalled();
  });
});
