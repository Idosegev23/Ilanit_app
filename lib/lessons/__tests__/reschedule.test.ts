import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
  Two rules carry the weight here:
    • a move must not collide with the lesson's OWN slot, or nothing can ever
      be moved;
    • a parent declining must not silently move the lesson back, because Ilanit
      is the one who knows what else can give — and two people believing
      different things about when a lesson is, is worse than a clash she can see.
*/

const state = vi.hoisted(() => ({
  lesson: null as Record<string, unknown> | null,
  student: { id: 's1', name: 'דנה', phone: '+972501111111' } as Record<string, unknown> | null,
  conflict: false,
  conflictArgs: null as unknown[] | null,
  updates: [] as Record<string, unknown>[],
  notified: [] as Array<{ template: string; vars: Record<string, unknown> }>,
  patched: [] as unknown[],
  consumed: null as null | { type: string; lessonId: string | null; groupBillingId: string | null },
}));

const mocks = vi.hoisted(() => ({
  hasSlotConflict: vi.fn(async (...a: unknown[]) => {
    state.conflictArgs = a;
    return state.conflict;
  }),
  patchEvent: vi.fn(async (...a: unknown[]) => {
    state.patched.push(a);
    return true;
  }),
  notify: vi.fn(async (template: string, _to: string, vars: Record<string, unknown>) => {
    state.notified.push({ template, vars });
    return { ok: true };
  }),
  notifyStudent: vi.fn(
    async (_s: unknown, template: string, vars: Record<string, unknown>) => {
      state.notified.push({ template, vars });
      return { ok: true };
    },
  ),
  createActionToken: vi.fn(async () => 'raw-tok'),
  consumeActionToken: vi.fn(async () => state.consumed),
}));

vi.mock('@/lib/availability', () => ({ hasSlotConflict: mocks.hasSlotConflict }));
vi.mock('@/lib/google-calendar', () => ({ patchEvent: mocks.patchEvent }));
vi.mock('@/lib/notifications/dispatch', () => ({
  notify: mocks.notify,
  notifyStudent: mocks.notifyStudent,
}));
vi.mock('@/lib/tokens', () => ({
  createActionToken: mocks.createActionToken,
  consumeActionToken: mocks.consumeActionToken,
  hashToken: (r: string) => `h-${r}`,
}));
vi.mock('@/lib/env', () => ({
  env: () => ({ NEXT_PUBLIC_APP_URL: 'https://app.test', ILANIT_PHONE: '972545886779' }),
}));
vi.mock('drizzle-orm', () => ({ and: (...a: unknown[]) => a, eq: () => ({}) }));
vi.mock('@/db/schema', () => ({
  lessons: { __t: 'lessons' },
  students: { __t: 'students' },
  actionTokens: { __t: 'actionTokens' },
}));
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: (t: { __t?: string }) => {
        const rows = t?.__t === 'students' ? [state.student] : [state.lesson];
        const chain: Record<string, unknown> = {
          innerJoin: () => chain,
          leftJoin: () => chain,
          where: () => chain,
          limit: async () => rows.filter(Boolean),
        };
        return chain;
      },
    }),
    update: () => ({
      set: (patch: Record<string, unknown>) => ({
        where: async () => {
          state.updates.push(patch);
        },
      }),
    }),
  },
}));

import { rescheduleLesson, answerReschedule } from '@/lib/lessons/reschedule';

const NEW_START = new Date('2026-09-02T12:15:00.000Z');

beforeEach(() => {
  state.lesson = {
    id: 'l1',
    status: 'confirmed',
    studentId: 's1',
    googleEventId: 'gcal-1',
    startsAt: new Date('2026-09-02T12:30:00.000Z'),
    endsAt: new Date('2026-09-02T13:30:00.000Z'),
    bookedByName: 'דנה',
    location: 'צבי סגל 20',
    type: 'individual',
  };
  state.conflict = false;
  state.conflictArgs = null;
  state.updates = [];
  state.notified = [];
  state.patched = [];
  state.consumed = { type: 'reschedule', lessonId: 'l1', groupBillingId: null };
  Object.values(mocks).forEach((m) => m.mockClear());
});

describe('rescheduleLesson', () => {
  it('excludes the lesson from its own conflict check', async () => {
    // Otherwise the lesson always collides with itself and no move is possible.
    await rescheduleLesson({
      lessonId: 'l1',
      startsAt: NEW_START,
      durationMin: 60,
      notifyParent: false,
    });
    expect(state.conflictArgs?.[2]).toBe('l1');
  });

  it('moves the lesson and patches the existing calendar event', async () => {
    // Patch, not delete-and-recreate: the parent's own calendar entry shifts
    // instead of becoming a cancellation plus a new invitation.
    const res = await rescheduleLesson({
      lessonId: 'l1',
      startsAt: NEW_START,
      durationMin: 60,
      notifyParent: false,
    });
    expect(res.ok).toBe(true);
    expect(state.updates[0].startsAt).toEqual(NEW_START);
    expect(state.patched).toHaveLength(1);
  });

  it('refuses a slot that is genuinely taken', async () => {
    state.conflict = true;
    const res = await rescheduleLesson({
      lessonId: 'l1',
      startsAt: NEW_START,
      durationMin: 60,
      notifyParent: false,
    });
    expect(res.ok).toBe(false);
    expect(state.updates).toHaveLength(0);
  });

  it('sends nothing when Ilanit chose not to notify', async () => {
    const res = await rescheduleLesson({
      lessonId: 'l1',
      startsAt: NEW_START,
      durationMin: 60,
      notifyParent: false,
    });
    expect(res.notified).toBe(false);
    expect(state.notified).toHaveLength(0);
  });

  it('asks the parent with both the old and the new time', async () => {
    const res = await rescheduleLesson({
      lessonId: 'l1',
      startsAt: NEW_START,
      durationMin: 60,
      notifyParent: true,
    });
    expect(res.notified).toBe(true);
    const msg = state.notified.find((n) => n.template === 'lesson_moved_student');
    expect(msg?.vars.oldWhen).toBeTruthy();
    expect(msg?.vars.newWhen).toBeTruthy();
    expect(msg?.vars.oldWhen).not.toEqual(msg?.vars.newWhen);
    expect(String(msg?.vars.actionUrl)).toContain('/r/');
  });

  it('still reports success when the calendar patch fails', async () => {
    // The lesson has already moved in the diary; a lagging calendar is the
    // smaller problem.
    mocks.patchEvent.mockRejectedValueOnce(new Error('gcal down'));
    const res = await rescheduleLesson({
      lessonId: 'l1',
      startsAt: NEW_START,
      durationMin: 60,
      notifyParent: false,
    });
    expect(res.ok).toBe(true);
  });

  it('will not move a cancelled lesson', async () => {
    state.lesson = { ...state.lesson, status: 'cancelled' };
    const res = await rescheduleLesson({
      lessonId: 'l1',
      startsAt: NEW_START,
      durationMin: 60,
      notifyParent: false,
    });
    expect(res.ok).toBe(false);
  });
});

describe('answerReschedule', () => {
  it('tells Ilanit when the parent accepts', async () => {
    const res = await answerReschedule('tok', true);
    expect(res.ok).toBe(true);
    const msg = state.notified.find((n) => n.template === 'lesson_move_reply_ilanit');
    expect(String(msg?.vars.decision)).toContain('אישר');
  });

  it('does NOT move the lesson back when the parent declines', async () => {
    // She is the one who knows what else can give; undoing behind her back
    // would leave the two of them believing different things.
    const res = await answerReschedule('tok', false);
    expect(res.ok).toBe(true);
    expect(state.updates).toHaveLength(0);
    const msg = state.notified.find((n) => n.template === 'lesson_move_reply_ilanit');
    expect(String(msg?.vars.decision)).toContain('לא');
  });

  it('rejects a token of another kind', async () => {
    state.consumed = { type: 'cancel', lessonId: 'l1', groupBillingId: null };
    const res = await answerReschedule('tok', true);
    expect(res.ok).toBe(false);
    expect(state.notified).toHaveLength(0);
  });
});
