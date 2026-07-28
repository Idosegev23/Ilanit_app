import { describe, it, expect, vi, beforeEach } from 'vitest';

// createManualLesson must confirm a FUTURE lesson to the student (message), while
// a retro walk-in (past date) stays silent — it is a record, not an invite. The
// day-before reminder cron covers the reminder for future lessons.

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/auth', () => ({ auth: vi.fn(async () => ({ user: { email: 'owner' } })) }));
vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => a,
  eq: () => ({}),
  isNull: () => ({}),
  isNotNull: () => ({}),
}));
vi.mock('@/db/schema', () => ({ lessons: { __t: 'lessons' } }));

vi.mock('@/lib/db', () => ({
  db: {
    insert: () => ({
      values: (v: Record<string, unknown>) => ({
        returning: () => Promise.resolve([{ id: 'lesson-1', ...v }]),
      }),
    }),
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }),
  },
}));

const student = { id: 'stud-1', name: 'מיתר', phone: '+972501234567', email: null, defaultPrice: 120, guardianPhone: null };
vi.mock('@/lib/students', () => ({
  findStudentByPhone: vi.fn(async () => student),
  createStudent: vi.fn(async () => student),
  getStudent: vi.fn(async () => student),
  findOrCreateStudentByName: vi.fn(),
}));

vi.mock('@/lib/settings', () => ({
  getSettings: vi.fn(async () => ({ defaultDurationMin: 60, locationAddress: 'צבי סגל 20', defaultPrivatePrice: 100 })),
}));

// Real time helpers, but freeze "now" to 2026-07-01 so future/past is deterministic.
vi.mock('@/lib/time', async () => {
  const actual = await vi.importActual<typeof import('@/lib/time')>('@/lib/time');
  return { ...actual, nowIL: () => new Date('2026-07-01T00:00:00.000Z') };
});

vi.mock('@/lib/env', () => ({ env: () => ({ NEXT_PUBLIC_APP_URL: 'https://app.test' }) }));
vi.mock('@/lib/google-calendar', () => ({ insertEvent: vi.fn(async () => ({ id: 'gcal-1' })), getEvent: vi.fn() }));
vi.mock('@/lib/recurrence', () => ({ cancelOne: vi.fn(), createSeries: vi.fn() }));
vi.mock('@/lib/ai/parse-lesson', () => ({ parseLessonTitle: vi.fn() }));

const notifyStudent = vi.fn((..._a: unknown[]): Promise<{ ok: boolean }> => Promise.resolve({ ok: true }));
vi.mock('@/lib/notifications/dispatch', () => ({
  notify: vi.fn(async () => ({ ok: true })),
  notifyStudent: (...a: unknown[]) => notifyStudent(...a),
}));
vi.mock('@/app/students/actions', () => ({ scheduleStudentLesson: vi.fn() }));
vi.mock('@/lib/calendar-link', () => ({ addToCalendarUrl: vi.fn(() => 'cal-url') }));
vi.mock('@/lib/availability/cancel', () => ({ createCancelUrl: vi.fn(async () => 'cancel-url') }));

import { createManualLesson } from '@/app/lessons/actions';

function form(date: string): FormData {
  const f = new FormData();
  f.set('name', 'מיתר');
  f.set('phone', '0501234567');
  f.set('date', date);
  f.set('time', '10:00');
  return f;
}

beforeEach(() => notifyStudent.mockClear());

describe('createManualLesson — student confirmation', () => {
  it('sends a confirmation for a FUTURE lesson', async () => {
    const res = await createManualLesson(form('2026-07-10'));
    expect(res.ok).toBe(true);
    expect(notifyStudent).toHaveBeenCalledTimes(1);
    expect(notifyStudent.mock.calls[0][1]).toBe('booking_approved_student');
  });

  it('stays SILENT for a past (retro walk-in) lesson', async () => {
    const res = await createManualLesson(form('2026-06-15'));
    expect(res.ok).toBe(true);
    expect(notifyStudent).not.toHaveBeenCalled();
  });
});
