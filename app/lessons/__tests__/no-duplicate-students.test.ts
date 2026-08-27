import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
  The point of these tests is that scheduling can never invent a student who
  already exists. createManualLesson used to do

      findStudentByPhone(phone) ?? createStudent({ name, phone })

  so one mistyped digit produced a second record for the same child — which is
  where the duplicates cleaned up on 17/08 came from.
*/

const state = vi.hoisted(() => ({
  byPhone: [] as Array<{ id: string; name: string }>,
  byName: [] as Array<{ id: string; name: string }>,
  created: null as Record<string, unknown> | null,
}));

const mocks = vi.hoisted(() => ({
  findStudentsByContactPhone: vi.fn(async () => state.byPhone),
  findStudentsByNormalizedName: vi.fn(async () => state.byName),
  createStudent: vi.fn(async (data: Record<string, unknown>) => {
    state.created = data;
    return { id: 'brand-new', defaultPrice: null, ...data };
  }),
  getStudent: vi.fn(async (id: string) =>
    id === 'student-1'
      ? { id: 'student-1', name: 'מיתר', phone: '+972501234567', defaultPrice: 120 }
      : null,
  ),
}));

vi.mock('@/auth', () => ({ auth: vi.fn(async () => ({ user: { email: 'owner' } })) }));
vi.mock('@/lib/students', () => ({
  findStudentsByContactPhone: mocks.findStudentsByContactPhone,
  findStudentsByNormalizedName: mocks.findStudentsByNormalizedName,
  createStudent: mocks.createStudent,
  getStudent: mocks.getStudent,
  findOrCreateStudentByName: vi.fn(),
}));
vi.mock('@/lib/settings', () => ({
  getSettings: vi.fn(async () => ({
    defaultDurationMin: 60,
    locationAddress: 'צבי סגל 20',
    defaultPrivatePrice: 100,
  })),
}));
vi.mock('@/lib/google-calendar', () => ({
  insertEvent: vi.fn(async () => ({ id: 'gcal-1' })),
  getEvent: vi.fn(),
  cancelEvent: vi.fn(),
  patchEvent: vi.fn(),
}));
vi.mock('@/lib/notifications/dispatch', () => ({
  notify: vi.fn(async () => ({ ok: true })),
  notifyStudent: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/lib/availability', () => ({ hasSlotConflict: vi.fn(async () => false) }));
vi.mock('@/lib/availability/cancel', () => ({ createCancelUrl: vi.fn(async () => 'u') }));
vi.mock('@/lib/recurrence', () => ({ cancelOne: vi.fn(), createSeries: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/db', () => ({
  db: {
    insert: () => ({
      values: (v: Record<string, unknown>) => ({
        returning: async () => [{ id: 'lesson-1', ...v }],
      }),
    }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
  },
}));

import { createManualLesson } from '@/app/lessons/actions';

function base(extra: Record<string, string> = {}): FormData {
  const f = new FormData();
  f.set('date', '2026-09-10');
  f.set('time', '10:00');
  for (const [k, v] of Object.entries(extra)) f.set(k, v);
  return f;
}

beforeEach(() => {
  state.byPhone = [];
  state.byName = [];
  state.created = null;
  Object.values(mocks).forEach((m) => m.mockClear());
});

describe('createManualLesson — duplicates are unreachable', () => {
  it('schedules under a student picked from the roster, creating nobody', async () => {
    const res = await createManualLesson(base({ studentId: 'student-1' }));

    expect(res.ok).toBe(true);
    expect(mocks.createStudent).not.toHaveBeenCalled();
  });

  it('refuses free-text identity without an explicit create', async () => {
    // The old shape of the form. It must no longer schedule anything.
    const res = await createManualLesson(base({ name: 'מיתר', phone: '0501234567' }));

    expect(res.ok).toBe(false);
    expect(mocks.createStudent).not.toHaveBeenCalled();
  });

  it('blocks an explicit create when the PHONE already belongs to someone', async () => {
    state.byPhone = [{ id: 'kid-linoy', name: 'לינוי רשף' }];

    const res = await createManualLesson(
      base({ createNew: '1', name: 'לינוי', phone: '0528773140' }),
    );

    expect(res.ok).toBe(false);
    expect(String(res.error)).toContain('לינוי רשף');
    expect(mocks.createStudent).not.toHaveBeenCalled();
  });

  it('blocks an explicit create when the NAME already exists, even on a fresh phone', async () => {
    // The case a phone check alone waves through: same child, typo'd number.
    state.byPhone = [];
    state.byName = [{ id: 'kid-linoy', name: 'לינוי רשף' }];

    const res = await createManualLesson(
      base({ createNew: '1', name: 'לינוי רשף', phone: '0500000000' }),
    );

    expect(res.ok).toBe(false);
    expect(String(res.error)).toContain('לינוי רשף');
    expect(mocks.createStudent).not.toHaveBeenCalled();
  });

  it('lists every sibling when a shared parent number is reused', async () => {
    state.byPhone = [
      { id: 'a', name: 'לינוי רשף' },
      { id: 'b', name: 'מתן רשף' },
    ];

    const res = await createManualLesson(
      base({ createNew: '1', name: 'נטע', phone: '0528773140' }),
    );

    expect(res.ok).toBe(false);
    expect(String(res.error)).toContain('לינוי רשף');
    expect(String(res.error)).toContain('מתן רשף');
  });

  it('creates only when the person is genuinely new', async () => {
    const res = await createManualLesson(
      base({ createNew: '1', name: 'תלמידה חדשה', phone: '0521112222' }),
    );

    expect(res.ok).toBe(true);
    expect(mocks.createStudent).toHaveBeenCalledOnce();
    expect(state.created).toMatchObject({ name: 'תלמידה חדשה' });
  });
});
