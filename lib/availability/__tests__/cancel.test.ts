import { describe, it, expect, vi, beforeEach } from 'vitest';

// cancelByToken: consuming a valid cancel token cancels the lesson AND notifies
// Ilanit — so a student self-cancel never silently vanishes from her calendar.
// A notify failure must NOT flip a successful cancel into an error.

const consumeActionToken = vi.fn((..._a: unknown[]): Promise<unknown> => Promise.resolve(null));
vi.mock('@/lib/tokens', () => ({
  consumeActionToken: (...a: unknown[]) => consumeActionToken(...a),
  createActionToken: vi.fn(async () => 'raw-token'),
}));

const cancelOne = vi.fn((..._a: unknown[]): Promise<void> => Promise.resolve());
vi.mock('@/lib/recurrence', () => ({ cancelOne: (...a: unknown[]) => cancelOne(...a) }));

const notify = vi.fn((..._a: unknown[]): Promise<{ ok: boolean }> => Promise.resolve({ ok: true }));
vi.mock('@/lib/notifications/dispatch', () => ({ notify: (...a: unknown[]) => notify(...a) }));

vi.mock('@/lib/env', () => ({
  env: () => ({ ILANIT_PHONE: '972500000000', NEXT_PUBLIC_APP_URL: 'https://app.test' }),
}));

vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => a,
  eq: () => ({}),
  gt: () => ({}),
  isNull: () => ({}),
}));

vi.mock('@/db/schema', () => ({
  lessons: { __t: 'lessons' },
  actionTokens: { __t: 'tokens' },
  students: { __t: 'students' },
}));

interface LessonRow {
  id: string;
  status: string;
  startsAt: Date;
  bookedByName: string | null;
  bookedByPhone: string | null;
  studentId: string | null;
}
let lessonRow: LessonRow | null = null;
let studentRows: Array<{ name: string }> = [];

vi.mock('@/lib/db', () => ({
  db: {
    select: (_cols?: unknown) => ({
      from: (table: { __t: string }) => ({
        where: () => ({
          limit: () =>
            Promise.resolve(
              table.__t === 'students' ? studentRows : lessonRow ? [lessonRow] : [],
            ),
        }),
      }),
    }),
  },
}));

import { cancelByToken } from '@/lib/availability/cancel';

function baseLesson(over: Partial<LessonRow> = {}): LessonRow {
  return {
    id: 'l1',
    status: 'confirmed',
    startsAt: new Date('2026-07-06T07:00:00.000Z'),
    bookedByName: 'לינוי רשף',
    bookedByPhone: '+972528773140',
    studentId: null,
    ...over,
  };
}

beforeEach(() => {
  consumeActionToken.mockReset();
  cancelOne.mockReset().mockResolvedValue(undefined);
  notify.mockReset().mockResolvedValue({ ok: true });
  lessonRow = baseLesson();
  studentRows = [];
});

describe('cancelByToken → notifies Ilanit', () => {
  it('cancels and notifies Ilanit with the booking name + phone', async () => {
    consumeActionToken.mockResolvedValue({ type: 'cancel', lessonId: 'l1' });

    const res = await cancelByToken('raw');

    expect(res.ok).toBe(true);
    expect(cancelOne).toHaveBeenCalledWith('l1');
    expect(notify).toHaveBeenCalledTimes(1);
    const [template, to, vars, relatedId, relatedLessonId] = notify.mock.calls[0];
    expect(template).toBe('booking_cancelled_ilanit');
    expect(to).toBe('972500000000');
    expect(vars).toMatchObject({ studentName: 'לינוי רשף', phone: '+972528773140' });
    expect(relatedId).toBe('cancelled-ilanit:l1');
    expect(relatedLessonId).toBe('l1');
  });

  it('prefers the linked student name over the booking name', async () => {
    lessonRow = baseLesson({ studentId: 's1', bookedByName: 'שם מהזמנה' });
    studentRows = [{ name: 'דנה כהן' }];
    consumeActionToken.mockResolvedValue({ type: 'cancel', lessonId: 'l1' });

    await cancelByToken('raw');

    expect(notify.mock.calls[0][2]).toMatchObject({ studentName: 'דנה כהן' });
  });

  it('still succeeds when the notification fails (best-effort)', async () => {
    consumeActionToken.mockResolvedValue({ type: 'cancel', lessonId: 'l1' });
    notify.mockRejectedValue(new Error('whatsapp down'));

    const res = await cancelByToken('raw');

    expect(res.ok).toBe(true);
    expect(cancelOne).toHaveBeenCalledWith('l1');
  });

  it('does NOT notify on an invalid/consumed token', async () => {
    consumeActionToken.mockResolvedValue(null);

    const res = await cancelByToken('raw');

    expect(res.ok).toBe(false);
    expect(cancelOne).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('does NOT notify when the lesson is already cancelled', async () => {
    lessonRow = baseLesson({ status: 'cancelled' });
    consumeActionToken.mockResolvedValue({ type: 'cancel', lessonId: 'l1' });

    const res = await cancelByToken('raw');

    expect(res.ok).toBe(false);
    expect(cancelOne).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });
});
