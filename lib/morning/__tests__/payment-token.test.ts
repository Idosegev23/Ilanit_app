import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';

const state = {
  token: null as Record<string, unknown> | null,
  lesson: null as Record<string, unknown> | null,
  student: null as Record<string, unknown> | null,
};

vi.mock('@/db/schema', () => ({
  actionTokens: { __name: 'action_tokens' },
  lessons: { __name: 'lessons' },
  students: { __name: 'students' },
}));

vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => ({ and: a }),
  eq: (col: unknown, val: unknown) => ({ col, val }),
  gt: (col: unknown, val: unknown) => ({ gt: [col, val] }),
  isNull: (col: unknown) => ({ isNull: col }),
}));

vi.mock('@/lib/db', () => {
  const db = {
    select: () => ({
      from: (t: unknown) => ({
        where: () => ({
          limit: async () => {
            const name = (t as { __name?: string }).__name;
            if (name === 'action_tokens') return state.token ? [state.token] : [];
            if (name === 'lessons') return state.lesson ? [state.lesson] : [];
            if (name === 'students') return state.student ? [state.student] : [];
            return [];
          },
        }),
      }),
    }),
  };
  return { db };
});

import { peekPaymentToken } from '@/lib/morning/payment-token';

const RAW = 'raw-token-value';
const HASH = createHash('sha256').update(RAW).digest('hex');

beforeEach(() => {
  state.token = { tokenHash: HASH, type: 'payment', lessonId: 'lesson-1' };
  state.lesson = {
    id: 'lesson-1',
    studentId: 'student-1',
    status: 'confirmed',
    price: 120,
    startsAt: new Date('2026-06-02T15:00:00Z'),
    location: 'רחוב הרצל 1',
    bookedByName: 'Booked',
  };
  state.student = { name: 'דנה כהן', defaultPrice: 130 };
});

describe('peekPaymentToken', () => {
  it('returns the lesson view with suggested amount + student name without consuming', async () => {
    const view = await peekPaymentToken(RAW);
    expect(view).not.toBeNull();
    expect(view!.lessonId).toBe('lesson-1');
    expect(view!.studentName).toBe('דנה כהן');
    expect(view!.amount).toBe(120);
    expect(view!.location).toBe('רחוב הרצל 1');
    expect(view!.alreadyPaid).toBe(false);
  });

  it('returns null for an empty token', async () => {
    expect(await peekPaymentToken('')).toBeNull();
  });

  it('returns null when no matching valid token row', async () => {
    state.token = null;
    expect(await peekPaymentToken(RAW)).toBeNull();
  });

  it('returns null when the lesson is gone', async () => {
    state.lesson = null;
    expect(await peekPaymentToken(RAW)).toBeNull();
  });

  it('falls back to bookedByName when no student linked', async () => {
    state.lesson = { ...state.lesson, studentId: null };
    state.student = null;
    const view = await peekPaymentToken(RAW);
    expect(view!.studentName).toBe('Booked');
  });

  it('marks alreadyPaid when lesson is completed', async () => {
    state.lesson = { ...state.lesson, status: 'completed' };
    const view = await peekPaymentToken(RAW);
    expect(view!.alreadyPaid).toBe(true);
  });
});
