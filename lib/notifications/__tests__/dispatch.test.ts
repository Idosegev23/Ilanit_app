import { describe, it, expect, vi, beforeEach } from 'vitest';

// Verifies notifyStudent routes to the guardian phone via contactPhoneFor and
// otherwise delegates to notify(). The renderer, whatsapp provider and
// message-log are stubbed.

const sendText = vi.hoisted(() =>
  vi.fn(async (_to: string, _body: string) => ({ ok: true, messageId: 'm1' })),
);
vi.mock('@/lib/whatsapp/provider', () => ({
  sendText: (to: string, body: string) => sendText(to, body),
}));

vi.mock('@/lib/notifications/templates', () => ({
  renderTemplate: (_t: string, _v: Record<string, unknown>) => 'BODY',
}));

vi.mock('@/lib/message-log', () => ({
  alreadySent: async () => false,
  logMessage: async () => 'log-1',
  updateMessageLog: async () => {},
}));

// contactPhoneFor is pulled in via '@/lib/students'; stub db/schema so the
// module loads, and provide the real-ish helper behavior.
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/db/schema', () => ({
  students: {},
  lessons: {},
  payments: {},
  receipts: {},
  groupMembers: {},
  groups: {},
  groupBilling: {},
}));
vi.mock('drizzle-orm', () => ({
  and: () => ({}),
  desc: () => ({}),
  eq: () => ({}),
  inArray: () => ({}),
}));

import { notifyStudent, notify } from '@/lib/notifications/dispatch';

beforeEach(() => sendText.mockClear());

describe('notifyStudent', () => {
  it('routes to the guardian phone when present', async () => {
    await notifyStudent(
      { phone: '+972500000001', guardianPhone: '+972500000002' },
      'booking_pending_student',
      { studentName: 'דנה', datetime: 'x' },
    );
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText.mock.calls[0][0]).toBe('+972500000002');
  });

  it('routes to the student phone when no guardian is set', async () => {
    await notifyStudent(
      { phone: '+972500000001', guardianPhone: null },
      'booking_pending_student',
      { studentName: 'דנה', datetime: 'x' },
    );
    expect(sendText.mock.calls[0][0]).toBe('+972500000001');
  });
});

describe('notify', () => {
  it('sends to the literal phone given', async () => {
    await notify('booking_pending_student', '+972512345678', { studentName: 'x', datetime: 'y' });
    expect(sendText.mock.calls[0][0]).toBe('+972512345678');
  });
});
