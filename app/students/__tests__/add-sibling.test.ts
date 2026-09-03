import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
  Siblings share one parent's phone, and `students.phone` is UNIQUE. So a family
  is modelled with the first child holding the number and the rest carrying it
  as `guardianPhone` — which is how the רשף and בישלה families already sit in
  the roster.

  Before this, typing a sibling's details was a dead end: "כבר קיים תלמיד עם
  מספר טלפון זה", with no way forward. These tests pin the way forward, and the
  guard that keeps it from becoming a hole.
*/

const state = vi.hoisted(() => ({
  byContactPhone: [] as any[],
  byName: [] as any[],
  created: [] as any[],
}));

vi.mock('@/auth', () => ({ auth: async () => ({ user: { email: 'x@y.z' } }) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/db/schema', () => ({ lessons: {} }));
vi.mock('drizzle-orm', () => ({ eq: () => ({}) }));
vi.mock('@/lib/settings', () => ({ getSettings: async () => ({}) }));
vi.mock('@/lib/google-calendar', () => ({ insertEvent: async () => ({}) }));
vi.mock('@/lib/availability', () => ({
  hasSlotConflict: async () => false,
  overlappingLessons: async () => [],
}));
vi.mock('@/lib/recurrence', () => ({ createSeries: async () => ({}) }));
vi.mock('@/lib/notifications/dispatch', () => ({ notifyStudent: async () => ({ ok: true }) }));
vi.mock('@/lib/calendar-link', () => ({ addToCalendarUrl: () => '' }));
vi.mock('@/lib/availability/cancel', () => ({ createCancelUrl: async () => '' }));

vi.mock('@/lib/students', () => ({
  createStudent: async (data: any) => {
    state.created.push(data);
    return { id: 'new-1', ...data };
  },
  updateStudent: async () => ({}),
  findStudentByPhone: async () => null,
  findStudentsByContactPhone: async () => state.byContactPhone,
  findStudentsByNormalizedName: async () => state.byName,
  getStudent: async () => null,
}));

import { createStudentAction } from '@/app/students/actions';

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

beforeEach(() => {
  state.byContactPhone = [];
  state.byName = [];
  state.created = [];
});

describe('adding a sibling', () => {
  it('offers the sibling path instead of a dead end', async () => {
    state.byContactPhone = [
      { id: 'e1', name: 'איתן בישלה', guardianName: 'בת-אל', guardianPhone: '+972524864005' },
    ];

    const res = await createStudentAction(
      form({ name: 'תהל בישלה', phone: '0524864005' }),
    );

    expect(res.ok).toBe(false);
    // The caller gets enough to ASK, not just to refuse.
    expect(res.sameNumberAs?.names).toEqual(['איתן בישלה']);
    expect(res.sameNumberAs?.guardianName).toBe('בת-אל');
    expect(state.created).toHaveLength(0);
  });

  it('files the sibling under the parent phone, leaving `phone` free', async () => {
    // The unique index means only one child can hold the number.
    state.byContactPhone = [
      { id: 'e1', name: 'איתן בישלה', guardianName: 'בת-אל', guardianPhone: '+972524864005' },
    ];

    const res = await createStudentAction(
      form({ name: 'תהל בישלה', phone: '0524864005', addAsSibling: 'on' }),
    );

    expect(res.ok).toBe(true);
    expect(state.created[0]).toMatchObject({
      name: 'תהל בישלה',
      phone: null,
      guardianPhone: '+972524864005',
      guardianName: 'בת-אל',
    });
  });

  it('lets an unrelated new number through untouched', async () => {
    const res = await createStudentAction(form({ name: 'מישהי חדשה', phone: '0501112222' }));

    expect(res.ok).toBe(true);
    expect(state.created[0]).toMatchObject({ phone: '+972501112222', guardianPhone: null });
  });

  it('still refuses the same NAME, sibling flag or not', async () => {
    /*
      The duplicates cleaned up on 17/08 were one child entered twice. "Add as
      sibling" must not become the way past that guard.
    */
    state.byContactPhone = [{ id: 'e1', name: 'איתן בישלה', guardianName: 'בת-אל' }];
    state.byName = [{ id: 'e1', name: 'איתן בישלה' }];

    const res = await createStudentAction(
      form({ name: 'איתן בישלה', phone: '0524864005', addAsSibling: 'on' }),
    );

    expect(res.ok).toBe(false);
    expect(res.error).toContain('איתן בישלה');
    expect(state.created).toHaveLength(0);
  });
});
