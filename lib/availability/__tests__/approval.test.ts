import { describe, it, expect, beforeEach, vi } from 'vitest';

// Tests for the approve/reject service. Token consumption, the calendar client,
// notifications, settings, slot re-check, env and the db are all mocked.

const state = vi.hoisted(() => ({
  consumed: null as null | { type: string; lessonId: string },
  lessonRow: null as null | {
    lesson: Record<string, unknown>;
    sName: string | null;
    sPhone: string | null;
    sEmail: string | null;
  },
  conflict: false,
  updated: [] as Array<Record<string, unknown>>,
}));

const mocks = vi.hoisted(() => ({
  consumeActionToken: vi.fn(async () => state.consumed),
  insertEvent: vi.fn(async (_e: Record<string, unknown>) => ({
    id: 'gcal-1',
    htmlLink: 'https://cal/evt' as string | undefined,
  })),
  notify: vi.fn(
    async (
      _template: string,
      _to: string,
      _vars: Record<string, string | number>,
      _relatedId?: string,
      _relatedLessonId?: string,
    ) => ({ ok: true }),
  ),
  hasSlotConflict: vi.fn(async () => state.conflict),
  getSettings: vi.fn(async () => ({ locationAddress: 'רחוב הדקל 1' })),
  createBookingLink: vi.fn(async (studentId: string) => ({
    token: 'rebook-token',
    url: `https://ilanit.test/book/rebook-token`,
    studentId,
  })),
}));

vi.mock('@/lib/tokens', () => ({ consumeActionToken: mocks.consumeActionToken }));
vi.mock('@/lib/booking-links', () => ({ createBookingLink: mocks.createBookingLink }));
vi.mock('@/lib/google-calendar', () => ({ insertEvent: mocks.insertEvent }));
vi.mock('@/lib/notifications/dispatch', () => ({ notify: mocks.notify }));
vi.mock('@/lib/settings', () => ({ getSettings: mocks.getSettings }));
vi.mock('@/lib/availability', () => ({ hasSlotConflict: mocks.hasSlotConflict }));
vi.mock('@/lib/env', () => ({ env: () => ({ NEXT_PUBLIC_APP_URL: 'https://ilanit.test' }) }));

vi.mock('drizzle-orm', () => ({ eq: () => ({}) }));
vi.mock('@/db/schema', () => ({ lessons: { __t: 'lessons' }, students: { __t: 'students' } }));
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: () => ({
            limit: () => Promise.resolve(state.lessonRow ? [state.lessonRow] : []),
          }),
        }),
      }),
    }),
    update: () => ({
      set: (patch: Record<string, unknown>) => {
        state.updated.push(patch);
        return { where: () => Promise.resolve() };
      },
    }),
  },
}));

import { decideLesson } from '@/lib/availability/approval';

const START = new Date('2026-06-08T07:00:00.000Z');
const END = new Date('2026-06-08T08:00:00.000Z');

function pendingLesson(overrides: Record<string, unknown> = {}) {
  return {
    lesson: {
      id: 'lesson-1',
      status: 'pending',
      startsAt: START,
      endsAt: END,
      location: 'רחוב הדקל 1',
      studentId: 'student-1',
      notes: 'הערה',
      bookedByName: 'דנה',
      bookedByPhone: '+972501234567',
      ...overrides,
    },
    sName: 'דנה לוי',
    sPhone: '+972501234567',
    sEmail: 'dana@example.com',
  };
}

beforeEach(() => {
  state.consumed = { type: 'approve', lessonId: 'lesson-1' };
  state.lessonRow = pendingLesson();
  state.conflict = false;
  state.updated = [];
  Object.values(mocks).forEach((m) => m.mockClear());
  mocks.insertEvent.mockResolvedValue({ id: 'gcal-1', htmlLink: 'https://cal/evt' });
});

describe('decideLesson — token guards', () => {
  it('rejects an invalid/used token', async () => {
    state.consumed = null;
    const res = await decideLesson('bad', 'approve');
    expect(res).toMatchObject({ ok: false, error: 'invalid_token' });
  });

  it('rejects a token of the wrong type', async () => {
    state.consumed = { type: 'payment', lessonId: 'lesson-1' };
    const res = await decideLesson('x', 'approve');
    expect(res).toMatchObject({ ok: false, error: 'invalid_token' });
  });

  it('rejects when the lesson is missing', async () => {
    state.lessonRow = null;
    const res = await decideLesson('x', 'approve');
    expect(res).toMatchObject({ ok: false, error: 'invalid_token' });
  });

  it('rejects when the lesson is not pending', async () => {
    state.lessonRow = pendingLesson({ status: 'confirmed' });
    const res = await decideLesson('x', 'approve');
    expect(res).toMatchObject({ ok: false, error: 'wrong_state' });
  });
});

describe('decideLesson — approve', () => {
  it('inserts a calendar event, confirms the lesson and notifies the student', async () => {
    const res = await decideLesson('tok', 'approve');
    expect(res).toEqual({ ok: true, action: 'approved' });

    // calendar event with Hebrew summary + attendee email + group marker
    expect(mocks.insertEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: 'שיעור – דנה לוי',
        attendeeEmail: 'dana@example.com',
        location: 'רחוב הדקל 1',
        extendedPrivate: expect.objectContaining({ type: 'individual', student_id: 'student-1' }),
      }),
    );

    // lesson flipped to confirmed with the google event id
    const confirm = state.updated.find((u) => u.status === 'confirmed');
    expect(confirm).toMatchObject({ status: 'confirmed', googleEventId: 'gcal-1' });
    expect(confirm?.confirmedAt).toBeInstanceOf(Date);

    // student notified with an "add to calendar" Google Calendar template link
    const approved = mocks.notify.mock.calls.find((c) => c[0] === 'booking_approved_student');
    expect(approved?.[2]).toMatchObject({ location: 'רחוב הדקל 1' });
    expect(String(approved?.[2]?.calendarUrl)).toContain('calendar.google.com/calendar/render');
  });

  it('refuses approval when the slot is no longer free', async () => {
    state.conflict = true;
    const res = await decideLesson('tok', 'approve');
    expect(res).toMatchObject({ ok: false, error: 'slot_taken' });
    expect(mocks.insertEvent).not.toHaveBeenCalled();
  });

  it('does not confirm when the calendar insert fails', async () => {
    mocks.insertEvent.mockRejectedValueOnce(new Error('gcal down'));
    const res = await decideLesson('tok', 'approve');
    expect(res).toMatchObject({ ok: false, error: 'internal' });
    expect(state.updated.find((u) => u.status === 'confirmed')).toBeUndefined();
  });

  it('omits the attendee when the student has no email', async () => {
    state.lessonRow = { ...pendingLesson(), sEmail: null };
    await decideLesson('tok', 'approve');
    const arg = mocks.insertEvent.mock.calls[0][0];
    expect(arg.attendeeEmail).toBeUndefined();
  });
});

describe('decideLesson — reject', () => {
  it('marks the lesson rejected, frees the slot and sends a personal re-book link', async () => {
    const res = await decideLesson('tok', 'reject');
    expect(res).toEqual({ ok: true, action: 'rejected' });
    expect(mocks.insertEvent).not.toHaveBeenCalled();

    const rej = state.updated.find((u) => u.status === 'rejected');
    expect(rej).toMatchObject({ status: 'rejected' });

    // A fresh PERSONAL booking link is minted for the student and sent.
    expect(mocks.createBookingLink).toHaveBeenCalledWith('student-1');
    const note = mocks.notify.mock.calls.find((c) => c[0] === 'booking_rejected_student');
    expect(note?.[2]).toMatchObject({ bookingUrl: 'https://ilanit.test/book/rebook-token' });
  });

  it('falls back to the bare /book page when the lesson has no student', async () => {
    state.lessonRow = pendingLesson({ studentId: null });
    // when there is no studentId we still need a phone to notify
    const res = await decideLesson('tok', 'reject');
    expect(res).toEqual({ ok: true, action: 'rejected' });
    expect(mocks.createBookingLink).not.toHaveBeenCalled();
    const note = mocks.notify.mock.calls.find((c) => c[0] === 'booking_rejected_student');
    expect(note?.[2]).toMatchObject({ bookingUrl: 'https://ilanit.test/book' });
  });
});
