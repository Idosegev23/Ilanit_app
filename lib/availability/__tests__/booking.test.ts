import { describe, it, expect, beforeEach, vi } from 'vitest';

// Unit tests for the token-based booking service. The student is identified from
// a personal booking-link token (no name/phone form). All cross-module deps are
// mocked: link resolution, student lookup/update, slot re-check, token minting,
// notifications, settings, env and the db (lessons insert + the conflict guard).

const state = vi.hoisted(() => ({
  bookable: true,
  conflictRows: [] as Array<{ id: string }>,
  resolved: { studentId: 'student-1' } as null | { studentId: string },
  student: {
    id: 'student-1',
    name: 'דנה לוי',
    phone: '+972501234567',
    email: 'dana@example.com' as string | null,
    defaultPrice: 150 as number | null,
    defaultDurationMin: 60,
  } as null | {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    defaultPrice: number | null;
    defaultDurationMin: number;
  },
  insertedValues: null as Record<string, unknown> | null,
}));

const mocks = vi.hoisted(() => ({
  resolveBookingLink: vi.fn(async () => state.resolved),
  isSlotBookable: vi.fn(async () => state.bookable),
  getStudent: vi.fn(async () => state.student),
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

vi.mock('@/lib/booking-links', () => ({ resolveBookingLink: mocks.resolveBookingLink }));
vi.mock('@/lib/availability', () => ({ isSlotBookable: mocks.isSlotBookable }));
vi.mock('@/lib/students', () => ({
  getStudent: mocks.getStudent,
  updateStudent: mocks.updateStudent,
}));
vi.mock('@/lib/tokens', () => ({ createActionToken: mocks.createActionToken }));
vi.mock('@/lib/notifications/dispatch', () => ({
  notify: mocks.notify,
  // notifyStudent routes to the guardian phone when present, else the student's
  // own phone, then delegates to the same notify spy.
  notifyStudent: (
    student: { phone: string; guardianPhone?: string | null },
    template: string,
    vars: Record<string, string | number>,
    relatedId?: string,
    relatedLessonId?: string,
  ) =>
    mocks.notify(
      template,
      student.guardianPhone?.trim() || student.phone,
      vars,
      relatedId,
      relatedLessonId,
    ),
}));
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
  state.resolved = { studentId: 'student-1' };
  state.student = {
    id: 'student-1',
    name: 'דנה לוי',
    phone: '+972501234567',
    email: 'dana@example.com',
    defaultPrice: 150,
    defaultDurationMin: 60,
  };
  state.insertedValues = null;
  Object.values(mocks).forEach((m) => m.mockClear());
});

describe('bookLesson — token guards', () => {
  it('rejects a missing token', async () => {
    const res = await bookLesson({ token: '  ', startISO: FUTURE_START, endISO: FUTURE_END });
    expect(res).toMatchObject({ ok: false, error: 'invalid_token' });
    expect(state.insertedValues).toBeNull();
  });

  it('rejects an unknown/expired token', async () => {
    state.resolved = null;
    const res = await bookLesson({ token: 'bad', startISO: FUTURE_START, endISO: FUTURE_END });
    expect(res).toMatchObject({ ok: false, error: 'invalid_token' });
    expect(state.insertedValues).toBeNull();
  });

  it('rejects when the student no longer exists', async () => {
    state.student = null;
    const res = await bookLesson({ token: 'tok', startISO: FUTURE_START, endISO: FUTURE_END });
    expect(res).toMatchObject({ ok: false, error: 'invalid_token' });
  });

  it('rejects end <= start', async () => {
    const res = await bookLesson({ token: 'tok', startISO: FUTURE_END, endISO: FUTURE_START });
    expect(res).toMatchObject({ ok: false, error: 'invalid_input' });
  });
});

describe('bookLesson — slot guards', () => {
  it('refuses when the slot is no longer bookable', async () => {
    state.bookable = false;
    const res = await bookLesson({ token: 'tok', startISO: FUTURE_START, endISO: FUTURE_END });
    expect(res).toMatchObject({ ok: false, error: 'slot_taken' });
    expect(state.insertedValues).toBeNull();
  });

  it('refuses on a concurrent-booking conflict', async () => {
    state.conflictRows = [{ id: 'other' }];
    const res = await bookLesson({ token: 'tok', startISO: FUTURE_START, endISO: FUTURE_END });
    expect(res).toMatchObject({ ok: false, error: 'slot_taken' });
    expect(state.insertedValues).toBeNull();
  });
});

describe('bookLesson — happy path (student from token)', () => {
  it('creates a pending lesson with price+location snapshot, token and notifications', async () => {
    const res = await bookLesson({
      token: 'tok',
      startISO: FUTURE_START,
      endISO: FUTURE_END,
      notes: 'מבחן מחר',
    });

    expect(res).toEqual({ ok: true, lessonId: 'lesson-1' });

    // student resolved from the token (no createStudent in this flow)
    expect(mocks.resolveBookingLink).toHaveBeenCalledWith('tok');
    expect(mocks.getStudent).toHaveBeenCalledWith('student-1');

    // pending lesson snapshot — booked-by fields come from the known student
    expect(state.insertedValues).toMatchObject({
      type: 'individual',
      source: 'booking',
      status: 'pending',
      needsMatch: false,
      studentId: 'student-1',
      price: 150,
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

  it('records a newly-supplied email on a student missing one', async () => {
    state.student = {
      id: 'student-10',
      name: 'מיכל',
      phone: '+972524445566',
      email: null,
      defaultPrice: null,
      defaultDurationMin: 60,
    };
    state.resolved = { studentId: 'student-10' };
    await bookLesson({
      token: 'tok',
      email: 'michal@example.com',
      startISO: FUTURE_START,
      endISO: FUTURE_END,
    });
    expect(mocks.updateStudent).toHaveBeenCalledWith('student-10', { email: 'michal@example.com' });
  });

  it('does not overwrite an existing student email', async () => {
    await bookLesson({
      token: 'tok',
      email: 'other@example.com',
      startISO: FUTURE_START,
      endISO: FUTURE_END,
    });
    expect(mocks.updateStudent).not.toHaveBeenCalled();
  });

  it('still succeeds when notifications fail', async () => {
    mocks.notify.mockRejectedValueOnce(new Error('green api down'));
    const res = await bookLesson({ token: 'tok', startISO: FUTURE_START, endISO: FUTURE_END });
    expect(res).toEqual({ ok: true, lessonId: 'lesson-1' });
  });
});
