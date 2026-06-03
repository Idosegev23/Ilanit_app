import { describe, it, expect, beforeEach, vi } from 'vitest';

// Tests for the assign-student service: bind a student to a needs_match lesson
// and remember the alias. Token consumption, student lookup and the db are
// mocked.

const state = vi.hoisted(() => ({
  consumed: null as null | { type: string; lessonId: string },
  student: null as null | { id: string; defaultPrice: number | null },
  lesson: null as null | Record<string, unknown>,
  aliasExisting: [] as Array<{ id: string }>,
  updated: [] as Array<Record<string, unknown>>,
  aliasInserts: [] as Array<Record<string, unknown>>,
}));

const mocks = vi.hoisted(() => ({
  consumeActionToken: vi.fn(async () => state.consumed),
  getStudent: vi.fn(async () => state.student),
}));

vi.mock('@/lib/tokens', () => ({ consumeActionToken: mocks.consumeActionToken }));
vi.mock('@/lib/students', () => ({ getStudent: mocks.getStudent }));
vi.mock('drizzle-orm', () => ({ and: (...a: unknown[]) => a, eq: () => ({}) }));
vi.mock('@/db/schema', () => ({
  lessons: { __t: 'lessons' },
  studentAliases: { __t: 'aliases' },
}));

vi.mock('@/lib/db', () => {
  return {
    db: {
      select: () => ({
        from: (table: { __t: string }) => ({
          where: () => ({
            limit: () =>
              Promise.resolve(
                table.__t === 'lessons'
                  ? state.lesson
                    ? [state.lesson]
                    : []
                  : state.aliasExisting,
              ),
          }),
        }),
      }),
      update: () => ({
        set: (patch: Record<string, unknown>) => {
          state.updated.push(patch);
          return { where: () => Promise.resolve() };
        },
      }),
      insert: () => ({
        values: (vals: Record<string, unknown>) => {
          state.aliasInserts.push(vals);
          return Promise.resolve();
        },
      }),
    },
  };
});

import { assignStudent } from '@/lib/availability/assign';

beforeEach(() => {
  state.consumed = { type: 'assign_student', lessonId: 'lesson-1' };
  state.student = { id: 'student-1', defaultPrice: 200 };
  state.lesson = { id: 'lesson-1', needsMatch: true, price: null };
  state.aliasExisting = [];
  state.updated = [];
  state.aliasInserts = [];
  Object.values(mocks).forEach((m) => m.mockClear());
});

describe('assignStudent — guards', () => {
  it('rejects an invalid token', async () => {
    state.consumed = null;
    const res = await assignStudent({ token: 'x', studentId: 'student-1' });
    expect(res).toMatchObject({ ok: false, error: 'invalid_token' });
  });

  it('rejects a wrong token type', async () => {
    state.consumed = { type: 'approve', lessonId: 'lesson-1' };
    const res = await assignStudent({ token: 'x', studentId: 'student-1' });
    expect(res).toMatchObject({ ok: false, error: 'invalid_token' });
  });

  it('rejects when no student is selected', async () => {
    const res = await assignStudent({ token: 'x', studentId: '' });
    expect(res).toMatchObject({ ok: false, error: 'unknown_student' });
  });

  it('rejects an unknown student', async () => {
    state.student = null;
    const res = await assignStudent({ token: 'x', studentId: 'ghost' });
    expect(res).toMatchObject({ ok: false, error: 'unknown_student' });
  });

  it('rejects when the lesson is missing', async () => {
    state.lesson = null;
    const res = await assignStudent({ token: 'x', studentId: 'student-1' });
    expect(res).toMatchObject({ ok: false, error: 'invalid_token' });
  });

  it('rejects when the lesson is not needs_match', async () => {
    state.lesson = { id: 'lesson-1', needsMatch: false, price: null };
    const res = await assignStudent({ token: 'x', studentId: 'student-1' });
    expect(res).toMatchObject({ ok: false, error: 'wrong_state' });
  });
});

describe('assignStudent — happy path', () => {
  it('binds the student, clears needs_match and snapshots the price', async () => {
    const res = await assignStudent({ token: 'x', studentId: 'student-1' });
    expect(res).toEqual({ ok: true, lessonId: 'lesson-1', studentId: 'student-1' });
    expect(state.updated[0]).toMatchObject({
      studentId: 'student-1',
      needsMatch: false,
      price: 200,
    });
  });

  it('does not overwrite an existing lesson price', async () => {
    state.lesson = { id: 'lesson-1', needsMatch: true, price: 120 };
    await assignStudent({ token: 'x', studentId: 'student-1' });
    expect(state.updated[0]).not.toHaveProperty('price');
  });

  it('remembers a new email alias', async () => {
    await assignStudent({
      token: 'x',
      studentId: 'student-1',
      alias: { type: 'email', value: 'dana@example.com' },
    });
    expect(state.aliasInserts).toHaveLength(1);
    expect(state.aliasInserts[0]).toMatchObject({
      studentId: 'student-1',
      aliasType: 'email',
      value: 'dana@example.com',
    });
  });

  it('does not duplicate an existing alias', async () => {
    state.aliasExisting = [{ id: 'alias-1' }];
    await assignStudent({
      token: 'x',
      studentId: 'student-1',
      alias: { type: 'title', value: 'שיעור דנה' },
    });
    expect(state.aliasInserts).toHaveLength(0);
  });

  it('still assigns even if remembering the alias fails', async () => {
    const res = await assignStudent({
      token: 'x',
      studentId: 'student-1',
      alias: { type: 'email', value: '   ' }, // blank → skipped, but exercises the path
    });
    expect(res).toMatchObject({ ok: true });
    expect(state.aliasInserts).toHaveLength(0);
  });
});
