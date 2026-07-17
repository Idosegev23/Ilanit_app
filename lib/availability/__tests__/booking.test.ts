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
  isSlotForceOpen: vi.fn(async () => false),
  overlappingLessons: vi.fn(async () =>
    state.conflictRows.map((r) => ({
      id: r.id,
      timeLabel: '09:00–10:00',
      name: 'x',
      isGroup: false,
    })),
  ),
  getStudent: vi.fn(async () => state.student),
  updateStudent: vi.fn(async (_id: string, patch: Record<string, unknown>) => ({
    ...state.student,
    ...patch,
  })),
  createActionToken: vi.fn(async () => 'raw-token-xyz'),
  insertEvent: vi.fn(async () => ({ id: 'gcal-1' })),
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
  unforceOpenSlot: vi.fn(async (..._a: unknown[]) => {}),
}));

vi.mock('@/lib/availability/blocks', () => ({ unforceOpenSlot: mocks.unforceOpenSlot }));
vi.mock('@/lib/booking-links', () => ({ resolveBookingLink: mocks.resolveBookingLink }));
vi.mock('@/lib/availability', () => ({
  isSlotBookable: mocks.isSlotBookable,
  isSlotForceOpen: mocks.isSlotForceOpen,
  overlappingLessons: mocks.overlappingLessons,
}));
vi.mock('@/lib/students', () => ({
  getStudent: mocks.getStudent,
  updateStudent: mocks.updateStudent,
}));
vi.mock('@/lib/tokens', () => ({ createActionToken: mocks.createActionToken }));
vi.mock('@/lib/google-calendar', () => ({
  insertEvent: mocks.insertEvent,
  cancelEvent: vi.fn(async () => {}),
}));
vi.mock('@/lib/availability/cancel', () => ({
  createCancelUrl: vi.fn(async () => 'https://ilanit.test/c/tok'),
}));
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

// Force-open is a ONE-SHOT override: Ilanit opens an already-taken slot for
// exactly one extra booking. Once that booking lands the override is consumed,
// so the slot re-locks instead of accepting unlimited pile-on bookings.
describe('bookLesson — force-open is one-shot', () => {
  it('books onto a force-opened taken slot AND consumes the override', async () => {
    state.conflictRows = [{ id: 'existing-lesson' }]; // slot really is taken
    mocks.isSlotForceOpen.mockResolvedValueOnce(true);

    const res = await bookLesson({ token: 'tok', startISO: FUTURE_START, endISO: FUTURE_END });

    expect(res.ok).toBe(true);
    expect(mocks.unforceOpenSlot).toHaveBeenCalledWith('2026-06-08', '10:00', '11:00');
  });

  it('does NOT touch force-open on an ordinary (non-forced) booking', async () => {
    const res = await bookLesson({ token: 'tok', startISO: FUTURE_START, endISO: FUTURE_END });

    expect(res.ok).toBe(true);
    expect(mocks.unforceOpenSlot).not.toHaveBeenCalled();
  });

  it('still books when consuming the override fails', async () => {
    state.conflictRows = [{ id: 'existing-lesson' }];
    mocks.isSlotForceOpen.mockResolvedValueOnce(true);
    mocks.unforceOpenSlot.mockRejectedValueOnce(new Error('db down'));

    const res = await bookLesson({ token: 'tok', startISO: FUTURE_START, endISO: FUTURE_END });

    expect(res.ok).toBe(true);
  });
});

describe('bookLesson — happy path (student from token)', () => {
  it('creates a CONFIRMED lesson with a calendar event and notifies Ilanit + the student', async () => {
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

    // Google Calendar event inserted (before the lesson)
    expect(mocks.insertEvent).toHaveBeenCalledTimes(1);

    // confirmed lesson snapshot with the google event id — no approval step
    expect(state.insertedValues).toMatchObject({
      type: 'individual',
      source: 'booking',
      status: 'confirmed',
      needsMatch: false,
      studentId: 'student-1',
      price: 150,
      location: 'רחוב הדקל 1, חיפה',
      googleEventId: 'gcal-1',
      bookedByName: 'דנה לוי',
      bookedByPhone: '+972501234567',
      notes: 'מבחן מחר',
    });

    // notifications: "scheduled" → Ilanit, confirmation → student
    const templates = mocks.notify.mock.calls.map((c) => c[0]);
    expect(templates).toContain('booking_scheduled_ilanit');
    expect(templates).toContain('booking_approved_student');
    const ilanitCall = mocks.notify.mock.calls.find((c) => c[0] === 'booking_scheduled_ilanit');
    expect(ilanitCall?.[1]).toBe('972545886779');
  });

  it('fails the booking when the calendar insert fails (no confirmed lesson off-calendar)', async () => {
    mocks.insertEvent.mockRejectedValueOnce(new Error('gcal down'));
    const res = await bookLesson({ token: 'tok', startISO: FUTURE_START, endISO: FUTURE_END });
    expect(res).toMatchObject({ ok: false, error: 'internal' });
    expect(state.insertedValues).toBeNull();
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
