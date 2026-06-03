import { describe, it, expect, beforeEach, vi } from 'vitest';

// Unit tests for the booking service. All cross-module deps are mocked: the
// slot re-check, student CRUD, token minting, notifications, settings, env and
// the db (lessons insert + the conflict guard query).

const state = vi.hoisted(() => ({
  bookable: true,
  conflictRows: [] as Array<{ id: string }>,
  student: null as null | { id: string; name: string; phone: string; email: string | null; defaultPrice: number | null; defaultDurationMin: number },
  insertedValues: null as Record<string, unknown> | null,
}));

const mocks = vi.hoisted(() => ({
  isSlotBookable: vi.fn(async () => state.bookable),
  findStudentByPhone: vi.fn(async () => state.student),
  createStudent: vi.fn(async (data: Record<string, unknown>) => ({
    id: 'new-student',
    name: data.name,
    phone: data.phone,
    email: data.email ?? null,
    defaultPrice: null,
    defaultDurationMin: data.defaultDurationMin ?? 60,
  })),
  updateStudent: vi.fn(async (_id: string, patch: Record<string, unknown>) => ({
    ...state.student,
    ...patch,
  })),
  createActionToken: vi.fn(async () => 'raw-token-xyz'),
  notify: vi.fn(
    async (
      _template: string,
      _to: string,
      _vars: Record<string, string | number>,
      _relatedId?: string,
      _relatedLessonId?: string,
    ) => ({ ok: true }),
  ),
  getSettings: vi.fn(async () => ({
    defaultDurationMin: 60,
    bufferMin: 0,
    leadTimeMin: 0,
    locationAddress: 'רחוב הדקל 1, חיפה',
  })),
}));

vi.mock('@/lib/availability', () => ({
  isSlotBookable: mocks.isSlotBookable,
}));
vi.mock('@/lib/students', () => ({
  findStudentByPhone: mocks.findStudentByPhone,
  createStudent: mocks.createStudent,
  updateStudent: mocks.updateStudent,
}));
vi.mock('@/lib/tokens', () => ({ createActionToken: mocks.createActionToken }));
vi.mock('@/lib/notifications/dispatch', () => ({ notify: mocks.notify }));
vi.mock('@/lib/settings', () => ({ getSettings: mocks.getSettings }));
vi.mock('@/lib/env', () => ({
  env: () => ({ NEXT_PUBLIC_APP_URL: 'https://ilanit.test/', ILANIT_PHONE: '972545886779' }),
}));

vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => a,
  eq: () => ({}),
  lt: () => ({}),
  gt: () => ({}),
  inArray: () => ({}),
}));
vi.mock('@/db/schema', () => ({ lessons: { __t: 'lessons' } }));
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve(state.conflictRows) }),
      }),
    }),
    insert: () => ({
      values: (vals: Record<string, unknown>) => {
        state.insertedValues = vals;
        return { returning: () => Promise.resolve([{ id: 'lesson-1', ...vals }]) };
      },
    }),
  },
}));

import { bookLesson } from '@/lib/availability/booking';

const FUTURE_START = '2026-06-08T07:00:00.000Z'; // 10:00 IL
const FUTURE_END = '2026-06-08T08:00:00.000Z'; // 11:00 IL

beforeEach(() => {
  state.bookable = true;
  state.conflictRows = [];
  state.student = null;
  state.insertedValues = null;
  Object.values(mocks).forEach((m) => m.mockClear());
});

describe('bookLesson — validation', () => {
  it('rejects a missing name', async () => {
    const res = await bookLesson({ name: '  ', phone: '0501234567', startISO: FUTURE_START, endISO: FUTURE_END });
    expect(res).toMatchObject({ ok: false, error: 'invalid_input' });
  });

  it('rejects a missing phone', async () => {
    const res = await bookLesson({ name: 'דנה', phone: '', startISO: FUTURE_START, endISO: FUTURE_END });
    expect(res).toMatchObject({ ok: false, error: 'invalid_input' });
  });

  it('rejects an invalid phone', async () => {
    const res = await bookLesson({ name: 'דנה', phone: 'abc', startISO: FUTURE_START, endISO: FUTURE_END });
    expect(res).toMatchObject({ ok: false, error: 'invalid_input' });
  });

  it('rejects end <= start', async () => {
    const res = await bookLesson({ name: 'דנה', phone: '0501234567', startISO: FUTURE_END, endISO: FUTURE_START });
    expect(res).toMatchObject({ ok: false, error: 'invalid_input' });
  });
});

describe('bookLesson — slot guards', () => {
  it('refuses when the slot is no longer bookable', async () => {
    state.bookable = false;
    const res = await bookLesson({ name: 'דנה', phone: '0501234567', startISO: FUTURE_START, endISO: FUTURE_END });
    expect(res).toMatchObject({ ok: false, error: 'slot_taken' });
    expect(state.insertedValues).toBeNull();
  });

  it('refuses on a concurrent-booking conflict', async () => {
    state.conflictRows = [{ id: 'other' }];
    const res = await bookLesson({ name: 'דנה', phone: '0501234567', startISO: FUTURE_START, endISO: FUTURE_END });
    expect(res).toMatchObject({ ok: false, error: 'slot_taken' });
    expect(state.insertedValues).toBeNull();
  });
});

describe('bookLesson — happy path (new student)', () => {
  it('creates a pending lesson with price+location snapshot, token and notifications', async () => {
    const res = await bookLesson({
      name: 'דנה לוי',
      phone: '050-123-4567',
      email: 'dana@example.com',
      startISO: FUTURE_START,
      endISO: FUTURE_END,
      notes: 'מבחן מחר',
    });

    expect(res).toEqual({ ok: true, lessonId: 'lesson-1' });

    // new student created (phone normalized to E.164)
    expect(mocks.createStudent).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'דנה לוי', phone: '+972501234567', email: 'dana@example.com' }),
    );

    // pending lesson snapshot
    expect(state.insertedValues).toMatchObject({
      type: 'individual',
      source: 'booking',
      status: 'pending',
      needsMatch: false,
      location: 'רחוב הדקל 1, חיפה',
      bookedByName: 'דנה לוי',
      bookedByPhone: '+972501234567',
      notes: 'מבחן מחר',
    });

    // approve token + both notifications
    expect(mocks.createActionToken).toHaveBeenCalledWith('approve', 'lesson-1', expect.any(Number));
    const templates = mocks.notify.mock.calls.map((c) => c[0]);
    expect(templates).toContain('booking_pending_ilanit');
    expect(templates).toContain('booking_pending_student');

    // the Ilanit notification carries the approval link with the raw token
    const ilanitCall = mocks.notify.mock.calls.find((c) => c[0] === 'booking_pending_ilanit');
    expect(ilanitCall?.[2]).toMatchObject({ actionUrl: 'https://ilanit.test/a/raw-token-xyz' });
  });
});

describe('bookLesson — existing student', () => {
  it('reuses the existing student and snapshots their default price', async () => {
    state.student = {
      id: 'student-9',
      name: 'יוסי',
      phone: '+972521112233',
      email: 'yossi@example.com',
      defaultPrice: 150,
      defaultDurationMin: 60,
    };
    const res = await bookLesson({
      name: 'יוסי',
      phone: '0521112233',
      startISO: FUTURE_START,
      endISO: FUTURE_END,
    });
    expect(res).toEqual({ ok: true, lessonId: 'lesson-1' });
    expect(mocks.createStudent).not.toHaveBeenCalled();
    expect(state.insertedValues).toMatchObject({ studentId: 'student-9', price: 150 });
  });

  it('records a newly-supplied email on an existing student missing one', async () => {
    state.student = {
      id: 'student-10',
      name: 'מיכל',
      phone: '+972524445566',
      email: null,
      defaultPrice: null,
      defaultDurationMin: 60,
    };
    await bookLesson({
      name: 'מיכל',
      phone: '0524445566',
      email: 'michal@example.com',
      startISO: FUTURE_START,
      endISO: FUTURE_END,
    });
    expect(mocks.updateStudent).toHaveBeenCalledWith('student-10', { email: 'michal@example.com' });
  });

  it('still succeeds when notifications fail', async () => {
    mocks.notify.mockRejectedValueOnce(new Error('green api down'));
    const res = await bookLesson({
      name: 'דנה',
      phone: '0501234567',
      startISO: FUTURE_START,
      endISO: FUTURE_END,
    });
    expect(res).toEqual({ ok: true, lessonId: 'lesson-1' });
  });
});
