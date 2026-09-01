import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
  sendBatch is the resumable core: it claims only PENDING rows and writes each
  to a terminal state, so an interrupted run resumes exactly where it stopped
  and can never message anyone twice.
*/

const state = vi.hoisted(() => ({
  broadcast: { id: 'b1', body: 'שלום {שם}', status: 'sending' } as Record<string, unknown> | undefined,
  pending: [] as Array<{ id: string; nameSnapshot: string; phoneSnapshot: string }>,
  updates: [] as Array<{ id: string; patch: Record<string, unknown> }>,
  broadcastPatch: null as Record<string, unknown> | null,
  counts: [] as Array<{ status: string; n: number }>,
  sendResults: new Map<string, { ok: boolean; messageId?: string; error?: string }>(),
  sentTo: [] as Array<{ phone: string; body: string }>,
}));

const mocks = vi.hoisted(() => ({
  sendText: vi.fn(async (phone: string, body: string) => {
    state.sentTo.push({ phone, body });
    return state.sendResults.get(phone) ?? { ok: true, messageId: `m-${phone}` };
  }),
  logMessage: vi.fn(async () => 'log-1'),
  updateMessageLog: vi.fn(async () => {}),
}));

vi.mock('@/lib/whatsapp/provider', () => ({ sendText: mocks.sendText }));
vi.mock('@/lib/message-log', () => ({
  logMessage: mocks.logMessage,
  updateMessageLog: mocks.updateMessageLog,
}));
vi.mock('@/lib/students', () => ({ contactPhoneFor: () => '' }));
vi.mock('@/lib/time', () => ({ nowIL: () => new Date('2026-08-18T09:00:00Z') }));
vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => a,
  asc: () => ({}),
  desc: () => ({}),
  eq: () => ({}),
  inArray: () => ({}),
  sql: Object.assign(() => ({}), { raw: () => ({}) }),
}));
vi.mock('@/db/schema', () => ({
  broadcasts: {},
  broadcastRecipients: {},
  students: {},
  lessons: {},
  groupMembers: {},
  groups: {},
}));

let selectCall = 0;
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => {
        selectCall++;
        // 1st select = the broadcast row, 2nd = the pending batch,
        // 3rd = the status roll-up.
        if (selectCall === 1) {
          return { where: () => ({ limit: async () => (state.broadcast ? [state.broadcast] : []) }) };
        }
        if (selectCall === 2) {
          return { where: () => ({ limit: async () => state.pending }) };
        }
        return { where: () => ({ groupBy: async () => state.counts }) };
      },
    }),
    update: () => ({
      set: (patch: Record<string, unknown>) => ({
        where: async () => {
          if ('sentCount' in patch || 'status' in patch === false) state.broadcastPatch = patch;
          else state.updates.push({ id: 'row', patch });
        },
      }),
    }),
  },
}));

import { sendBatch } from '@/lib/broadcast';

beforeEach(() => {
  selectCall = 0;
  state.broadcast = { id: 'b1', body: 'שלום {שם}', status: 'sending' };
  state.pending = [];
  state.updates = [];
  state.broadcastPatch = null;
  state.counts = [];
  state.sendResults = new Map();
  state.sentTo = [];
  Object.values(mocks).forEach((m) => m.mockClear());
});

describe('sendBatch', () => {
  it('personalises each message with that recipient’s own name', async () => {
    state.pending = [
      { id: 'r1', nameSnapshot: 'דנה', phoneSnapshot: '+972501111111' },
      { id: 'r2', nameSnapshot: 'יוסי', phoneSnapshot: '+972502222222' },
    ];
    state.counts = [{ status: 'sent', n: 2 }];

    const res = await sendBatch('b1', 5);

    expect(res.sent).toBe(2);
    expect(state.sentTo.map((s) => s.body)).toEqual(['שלום דנה', 'שלום יוסי']);
  });

  it('a failed number does not strand the rest of the batch', async () => {
    state.pending = [
      { id: 'r1', nameSnapshot: 'א', phoneSnapshot: '+972501111111' },
      { id: 'r2', nameSnapshot: 'ב', phoneSnapshot: '+972502222222' },
      { id: 'r3', nameSnapshot: 'ג', phoneSnapshot: '+972503333333' },
    ];
    state.sendResults.set('+972502222222', { ok: false, error: 'invalid number' });
    state.counts = [
      { status: 'sent', n: 2 },
      { status: 'failed', n: 1 },
    ];

    const res = await sendBatch('b1', 5);

    expect(res.sent).toBe(2);
    expect(res.failed).toBe(1);
    // Everyone was still attempted — the bad number did not abort the loop.
    expect(state.sentTo).toHaveLength(3);
  });

  it('reports remaining work so the caller keeps going', async () => {
    state.pending = [{ id: 'r1', nameSnapshot: 'א', phoneSnapshot: '+972501111111' }];
    state.counts = [
      { status: 'sent', n: 1 },
      { status: 'pending', n: 4 },
    ];

    const res = await sendBatch('b1', 1);

    expect(res.remaining).toBe(4);
    expect(res.done).toBe(false);
  });

  it('finishes when nothing is pending', async () => {
    state.pending = [];
    state.counts = [{ status: 'sent', n: 5 }];

    const res = await sendBatch('b1', 5);

    expect(res.done).toBe(true);
    expect(res.remaining).toBe(0);
    expect(mocks.sendText).not.toHaveBeenCalled();
  });

  it('fails cleanly on an unknown broadcast', async () => {
    state.broadcast = undefined;

    const res = await sendBatch('nope', 5);

    expect(res.ok).toBe(false);
    expect(mocks.sendText).not.toHaveBeenCalled();
  });
});
