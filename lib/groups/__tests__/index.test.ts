import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mocks for cross-module libs (mock the wrappers, not the SDKs) ─────────────

const dbMock = vi.hoisted(() => {
  // A tiny in-memory query recorder. Each method on the chain is configurable
  // per-call by queueing results; selects/inserts/updates resolve to arrays.
  return {
    selectResults: [] as unknown[][],
    insertResults: [] as unknown[][],
    updateResults: [] as unknown[][],
    inserted: [] as Array<{ table: string; values: unknown }>,
    updated: [] as Array<{ table: string; set: unknown }>,
    selectCalls: 0,
    reset() {
      this.selectResults = [];
      this.insertResults = [];
      this.updateResults = [];
      this.inserted = [];
      this.updated = [];
      this.selectCalls = 0;
    },
  };
});

vi.mock('@/lib/db', () => {
  function tableName(t: unknown): string {
    // drizzle tables expose a Symbol-keyed name; for the mock the table object
    // identity is enough, so fall back to a stable label.
    return (t as { _?: { name?: string } })?._?.name ?? 'unknown';
  }

  // Chainable thenable that resolves to the next queued select result.
  function makeSelectChain() {
    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of ['from', 'innerJoin', 'leftJoin', 'where', 'orderBy', 'limit']) {
      chain[m] = vi.fn(passthrough);
    }
    chain.then = (resolve: (v: unknown[]) => unknown) => {
      const res = dbMock.selectResults.shift() ?? [];
      dbMock.selectCalls += 1;
      return Promise.resolve(resolve(res));
    };
    return chain;
  }

  const db = {
    select: vi.fn(() => makeSelectChain()),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((values: unknown) => ({
        returning: vi.fn(() => {
          dbMock.inserted.push({ table: tableName(table), values });
          return Promise.resolve(dbMock.insertResults.shift() ?? []);
        }),
      })),
    })),
    update: vi.fn((table: unknown) => ({
      set: vi.fn((set: unknown) => {
        dbMock.updated.push({ table: tableName(table), set });
        const tail = {
          where: vi.fn(() => ({
            returning: vi.fn(() => Promise.resolve(dbMock.updateResults.shift() ?? [])),
            then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolve(undefined)),
          })),
        };
        return tail;
      }),
    })),
  };
  return { db };
});

vi.mock('@/lib/settings', () => ({
  getSettings: vi.fn(async () => ({
    morningDocType: 'receipt',
    businessName: 'אילנית',
    bookingHorizonDays: 14,
  })),
}));

vi.mock('@/lib/students', () => ({
  getStudent: vi.fn(),
  findStudentByPhone: vi.fn(async () => null),
  createStudent: vi.fn(),
  contactPhoneFor: (s: { phone: string; guardianPhone?: string | null }) =>
    s.guardianPhone?.trim() || s.phone,
}));

vi.mock('@/lib/recurrence', () => ({
  createSeries: vi.fn(async () => ({ count: 4 })),
}));

vi.mock('@/lib/morning', () => ({
  createReceipt: vi.fn(),
}));

vi.mock('@/lib/tokens', () => ({
  createGroupBillingToken: async () => 'grp-pay-token',
  createActionToken: async () => 'tok',
  consumeActionToken: async () => null,
  hashToken: (r: string) => `h-${r}`,
}));
vi.mock('@/lib/notifications/dispatch', () => ({
  notify: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@/lib/whatsapp/provider', () => ({
  sendFileByUrl: vi.fn(async () => ({ ok: true, messageId: 'wa-1' })),
}));

const collectionOn = vi.hoisted(() => ({ value: true }));
// markBillingPaid's receipt cases need the flag ON; production default is OFF
// and has its own case.
const receiptsOn = vi.hoisted(() => ({ value: true }));
vi.mock('@/lib/env', () => ({
  env: vi.fn(() => ({
    NEXT_PUBLIC_APP_URL: 'https://ilanit.example.com',
    ILANIT_PHONE: '972545886779',
  })),
  collectionEnabled: () => collectionOn.value,
  receiptsEnabled: () => receiptsOn.value,
}));

import {
  createGroup,
  createGroupWithSchedule,
  groupReceiptLabel,
  updateGroup,
  addMember,
  addChildMember,
  removeMember,
  listMembers,
  generateMonthlyBilling,
  markBillingPaid,
  markBillingUnpaid,
  rosterFor,
  capacityOf,
  getGroupCapacity,
  activeMemberCount,
  DEFAULT_MAX_MEMBERS,
} from '@/lib/groups';
import { getStudent, findStudentByPhone, createStudent } from '@/lib/students';
import { createReceipt } from '@/lib/morning';
import { createSeries } from '@/lib/recurrence';
import { notify } from '@/lib/notifications/dispatch';
import { sendFileByUrl } from '@/lib/whatsapp/provider';

beforeEach(() => {
  dbMock.reset();
  vi.clearAllMocks();
});

describe('createGroup', () => {
  it('creates a group with normalized integer price and trimmed fields', async () => {
    dbMock.insertResults.push([{ id: 'g1', name: 'מתמטיקה', monthlyPrice: 300 }]);
    const g = await createGroup({
      name: '  מתמטיקה  ',
      monthlyPrice: 300,
      location: '  רחוב הרצל 1  ',
      description: '  ',
    });
    expect(g.id).toBe('g1');
    expect(dbMock.inserted[0].values).toMatchObject({
      name: 'מתמטיקה',
      monthlyPrice: 300,
      location: 'רחוב הרצל 1',
      description: null,
    });
  });

  it('rounds a fractional price to whole shekels', async () => {
    dbMock.insertResults.push([{ id: 'g1' }]);
    await createGroup({ name: 'a', monthlyPrice: 299.6, location: 'x' });
    expect(dbMock.inserted[0].values).toMatchObject({ monthlyPrice: 300 });
  });

  it('rejects empty name / negative price', async () => {
    await expect(createGroup({ name: '  ', monthlyPrice: 100, location: 'x' })).rejects.toThrow(
      /name is required/,
    );
    await expect(createGroup({ name: 'a', monthlyPrice: -1, location: 'x' })).rejects.toThrow(
      /non-negative/,
    );
  });

  it('defaults maxMembers to 6 when omitted', async () => {
    dbMock.insertResults.push([{ id: 'g1' }]);
    await createGroup({ name: 'a', monthlyPrice: 100, location: 'x' });
    expect(dbMock.inserted[0].values).toMatchObject({ maxMembers: DEFAULT_MAX_MEMBERS });
    expect(DEFAULT_MAX_MEMBERS).toBe(6);
  });

  it('persists an explicit maxMembers and rejects an invalid one', async () => {
    dbMock.insertResults.push([{ id: 'g1' }]);
    await createGroup({ name: 'a', monthlyPrice: 100, location: 'x', maxMembers: 10 });
    expect(dbMock.inserted[0].values).toMatchObject({ maxMembers: 10 });

    await expect(
      createGroup({ name: 'a', monthlyPrice: 100, location: 'x', maxMembers: 0 }),
    ).rejects.toThrow(/positive integer/);
  });
});

describe('group capacity', () => {
  it('capacityOf computes remaining seats and atCapacity flag', () => {
    expect(capacityOf(2, 6)).toEqual({ count: 2, max: 6, remaining: 4, atCapacity: false });
    // full
    expect(capacityOf(6, 6)).toEqual({ count: 6, max: 6, remaining: 0, atCapacity: true });
    // over capacity (override) — remaining never goes negative
    expect(capacityOf(7, 6)).toEqual({ count: 7, max: 6, remaining: 0, atCapacity: true });
  });

  it('activeMemberCount counts active membership rows', async () => {
    dbMock.selectResults.push([{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }]);
    expect(await activeMemberCount('g1')).toBe(3);
  });

  it('getGroupCapacity joins the group cap with the active count', async () => {
    dbMock.selectResults.push([{ id: 'g1', maxMembers: 6 }]); // getGroup
    dbMock.selectResults.push([{ id: 'm1' }, { id: 'm2' }]); // activeMemberCount
    const cap = await getGroupCapacity('g1');
    expect(cap).toEqual({ count: 2, max: 6, remaining: 4, atCapacity: false });
  });

  it('getGroupCapacity throws when the group is missing', async () => {
    dbMock.selectResults.push([]); // getGroup → none
    await expect(getGroupCapacity('nope')).rejects.toThrow(/not found/);
  });
});

describe('groupReceiptLabel', () => {
  it('builds "חוג {group name}" trimming the name', () => {
    expect(groupReceiptLabel('  מתמטיקה  ')).toBe('חוג מתמטיקה');
  });
});

describe('createGroupWithSchedule', () => {
  it('creates the group only when no schedule is given', async () => {
    dbMock.insertResults.push([{ id: 'g1', name: 'g' }]);
    const res = await createGroupWithSchedule({ name: 'g', monthlyPrice: 100, location: 'x' });
    expect(res.group.id).toBe('g1');
    expect(res.sessionsCreated).toBe(0);
    expect(res.slotsCreated).toBe(0);
    expect(createSeries).not.toHaveBeenCalled();
  });

  it('treats an empty schedule array as "no schedule"', async () => {
    dbMock.insertResults.push([{ id: 'g1', name: 'g' }]);
    const res = await createGroupWithSchedule(
      { name: 'g', monthlyPrice: 100, location: 'x' },
      [],
    );
    expect(res.sessionsCreated).toBe(0);
    expect(res.slotsCreated).toBe(0);
    expect(createSeries).not.toHaveBeenCalled();
  });

  it('creates a kind=group weekly series when a single schedule is given', async () => {
    dbMock.insertResults.push([{ id: 'g1', name: 'g' }]);
    const res = await createGroupWithSchedule(
      { name: 'g', monthlyPrice: 100, location: 'x' },
      { weekday: 2, startTime: '16:00', durationMin: 45 },
    );
    expect(res.sessionsCreated).toBe(4);
    expect(res.slotsCreated).toBe(1);
    expect(createSeries).toHaveBeenCalledTimes(1);
    expect(createSeries).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'group',
        groupId: 'g1',
        weekday: 2,
        startTime: '16:00',
        durationMin: 45,
        horizonDays: 14, // falls back to settings.bookingHorizonDays
      }),
    );
  });

  it('creates ONE kind=group series PER slot for a multi-day weekly schedule', async () => {
    dbMock.insertResults.push([{ id: 'g1', name: 'g' }]);
    // A group meeting twice a week: Monday 17:00 AND Thursday 17:00.
    const res = await createGroupWithSchedule(
      { name: 'g', monthlyPrice: 100, location: 'x' },
      [
        { weekday: 1, startTime: '17:00', durationMin: 60 },
        { weekday: 4, startTime: '17:00', durationMin: 60 },
      ],
    );
    // createSeries mock returns { count: 4 } per call → 2 slots × 4 = 8 sessions.
    expect(res.slotsCreated).toBe(2);
    expect(res.sessionsCreated).toBe(8);
    expect(createSeries).toHaveBeenCalledTimes(2);
    expect(createSeries).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ kind: 'group', groupId: 'g1', weekday: 1, startTime: '17:00' }),
    );
    expect(createSeries).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ kind: 'group', groupId: 'g1', weekday: 4, startTime: '17:00' }),
    );
  });
});

describe('addChildMember', () => {
  it('creates the child student with guardian fields, then enrols them', async () => {
    vi.mocked(findStudentByPhone).mockResolvedValue(null);
    vi.mocked(createStudent).mockResolvedValue({ id: 's-new' } as never);
    // addMember: existing membership lookup → none, then insert
    dbMock.selectResults.push([]);
    dbMock.insertResults.push([{ id: 'm1', groupId: 'g1', studentId: 's-new', active: true }]);

    const m = await addChildMember('g1', {
      childName: '  דנה  ',
      guardianPhone: '+972500000009',
      guardianName: '  רותי  ',
    });

    expect(createStudent).toHaveBeenCalledWith({
      name: 'דנה',
      phone: '+972500000009',
      guardianName: 'רותי',
      guardianPhone: '+972500000009',
    });
    expect(m.id).toBe('m1');
    expect(dbMock.inserted[0].values).toMatchObject({ studentId: 's-new', active: true });
  });

  it('reuses an existing student that already owns the guardian phone', async () => {
    vi.mocked(findStudentByPhone).mockResolvedValue({ id: 's-existing' } as never);
    dbMock.selectResults.push([]); // membership lookup → none
    dbMock.insertResults.push([{ id: 'm2', studentId: 's-existing', active: true }]);

    const m = await addChildMember('g1', {
      childName: 'יואב',
      guardianPhone: '+972500000010',
    });
    expect(createStudent).not.toHaveBeenCalled();
    expect(m.id).toBe('m2');
  });

  it('rejects a missing child name or guardian phone', async () => {
    await expect(
      addChildMember('g1', { childName: '  ', guardianPhone: '+972500000001' }),
    ).rejects.toThrow(/child name is required/);
    await expect(
      addChildMember('g1', { childName: 'דנה', guardianPhone: '  ' }),
    ).rejects.toThrow(/guardian phone is required/);
  });
});

describe('listMembers', () => {
  it('resolves contactPhone to the guardian phone when present', async () => {
    dbMock.selectResults.push([
      {
        membershipId: 'm1',
        studentId: 's1',
        name: 'דנה',
        phone: '+972500000001',
        guardianName: 'רותי',
        guardianPhone: '+972500000099',
        active: true,
        joinedAt: new Date(),
      },
      {
        membershipId: 'm2',
        studentId: 's2',
        name: 'יוסי',
        phone: '+972500000002',
        guardianName: null,
        guardianPhone: null,
        active: true,
        joinedAt: new Date(),
      },
    ]);
    const rows = await listMembers('g1');
    expect(rows[0].contactPhone).toBe('+972500000099'); // guardian wins
    expect(rows[1].contactPhone).toBe('+972500000002'); // falls back to phone
  });
});

describe('updateGroup', () => {
  it('patches only provided fields and normalizes price', async () => {
    dbMock.updateResults.push([{ id: 'g1', monthlyPrice: 350 }]);
    await updateGroup('g1', { monthlyPrice: 349.9, name: ' New ' });
    expect(dbMock.updated[0].set).toMatchObject({ monthlyPrice: 350, name: 'New' });
  });

  it('throws when the group does not exist', async () => {
    dbMock.updateResults.push([]);
    await expect(updateGroup('missing', { active: false })).rejects.toThrow(/not found/);
  });
});

describe('addMember', () => {
  it('inserts a new membership when none exists', async () => {
    dbMock.selectResults.push([]); // existing lookup → none
    dbMock.insertResults.push([{ id: 'm1', groupId: 'g1', studentId: 's1', active: true }]);
    const m = await addMember('g1', 's1');
    expect(m.id).toBe('m1');
    expect(dbMock.inserted[0].values).toMatchObject({ groupId: 'g1', studentId: 's1', active: true });
  });

  it('is idempotent for an already-active member (no insert)', async () => {
    dbMock.selectResults.push([{ id: 'm1', active: true }]);
    const m = await addMember('g1', 's1');
    expect(m.id).toBe('m1');
    expect(dbMock.inserted).toHaveLength(0);
  });

  it('reactivates a previously-removed member', async () => {
    dbMock.selectResults.push([{ id: 'm1', active: false }]);
    dbMock.updateResults.push([{ id: 'm1', active: true }]);
    const m = await addMember('g1', 's1');
    expect(m.active).toBe(true);
    expect(dbMock.updated[0].set).toMatchObject({ active: true });
  });
});

describe('removeMember', () => {
  it('soft-removes (deactivates) and reports success', async () => {
    dbMock.updateResults.push([{ id: 'm1' }]);
    const ok = await removeMember('g1', 's1');
    expect(ok).toBe(true);
    expect(dbMock.updated[0].set).toMatchObject({ active: false });
  });

  it('returns false when no membership matched', async () => {
    dbMock.updateResults.push([]);
    expect(await removeMember('g1', 'nope')).toBe(false);
  });
});

describe('generateMonthlyBilling', () => {
  it('creates one billing row per active member, snapshots price, notifies member + roster, idempotent', async () => {
    // active groups
    dbMock.selectResults.push([{ id: 'g1', name: 'מתמטיקה', monthlyPrice: 300, active: true }]);
    // members of g1
    dbMock.selectResults.push([
      { studentId: 's1', name: 'דנה', phone: '+972500000001' },
      { studentId: 's2', name: 'יוסי', phone: '+972500000002' },
    ]);
    // s1 existing billing lookup → none
    dbMock.selectResults.push([]);
    dbMock.insertResults.push([{ id: 'b1' }]);
    // s2 existing billing lookup → none
    dbMock.selectResults.push([]);
    dbMock.insertResults.push([{ id: 'b2' }]);

    const res = await generateMonthlyBilling('2026-06');
    expect(res.created).toBe(2);

    // amount is the snapshot of the group's monthly price
    expect(dbMock.inserted[0].values).toMatchObject({
      groupId: 'g1',
      studentId: 's1',
      month: '2026-06-01',
      amount: 300,
      status: 'due',
    });

    /*
      The member now gets a payment REQUEST with a link, not a bare statement of
      what is owed: a group charge offers the same two choices as a private
      lesson rather than leaving the parent to work out how to pay.
    */
    expect(notify).toHaveBeenCalledWith(
      'pay_request_group',
      '+972500000001',
      expect.objectContaining({
        groupName: 'מתמטיקה',
        month: '06/2026',
        amount: 300,
        actionUrl: expect.stringContaining('/pay/'),
      }),
      'group_billing:b1',
    );
    expect(notify).toHaveBeenCalledWith(
      'group_roster_ilanit',
      '972545886779',
      expect.objectContaining({
        groupName: 'מתמטיקה',
        rosterUrl: 'https://ilanit.example.com/groups/g1/billing/2026-06',
      }),
      'group_roster:g1:2026-06-01',
    );
  });

  it('writes nothing at all while the collection engine is off', async () => {
    /*
      A debt the parent is never told about is worse than no debt: it surfaces
      weeks later as an argument. ₪3,900 accrued on «מתמטיקה עולות לז'» exactly
      this way — rows written on 01/08 and 01/09 while the engine was off, every
      request dropped in silence. So billing declines to write at all.
    */
    collectionOn.value = false;
    try {
      const res = await generateMonthlyBilling('2026-09-01');
      expect(res.created).toBe(0);
      expect(dbMock.inserted).toHaveLength(0);
    } finally {
      collectionOn.value = true;
    }
  });

  it('skips members already billed for the month (no duplicate insert)', async () => {
    dbMock.selectResults.push([{ id: 'g1', name: 'g', monthlyPrice: 200, active: true }]);
    dbMock.selectResults.push([{ studentId: 's1', name: 'a', phone: '+972500000001' }]);
    dbMock.selectResults.push([{ id: 'existing-b' }]); // already billed
    const res = await generateMonthlyBilling('2026-06');
    expect(res.created).toBe(0);
    expect(dbMock.inserted).toHaveLength(0);
    // no roster link sent when nothing new was created for the group
    expect(notify).not.toHaveBeenCalled();
  });

  it('rejects an invalid month', async () => {
    await expect(generateMonthlyBilling('2026/06')).rejects.toThrow(/invalid month/);
  });
});

describe('markBillingPaid', () => {
  it('settles the charge WITHOUT a receipt when receipts are off', async () => {
    // Production default: confirming the money and issuing a tax document are
    // separate decisions. This also unblocks settling when Morning is down.
    receiptsOn.value = false;
    dbMock.selectResults.push([
      { id: 'b1', groupId: 'g1', studentId: 's1', month: '2026-06-01', amount: 320, status: 'due' },
    ]);
    dbMock.selectResults.push([{ id: 'g1', name: 'אנגלית כיתה ו' }]);
    vi.mocked(getStudent).mockResolvedValue({
      id: 's1',
      name: 'דריה טפר',
      phone: '+972500000001',
    } as never);
    try {
      await markBillingPaid('b1', 'bit');

      expect(createReceipt).not.toHaveBeenCalled();
      expect(dbMock.inserted.find((i) => i.table === 'receipts')).toBeUndefined();
      const paid = dbMock.updated.find((u) => (u.set as any)?.status === 'paid');
      expect(paid).toBeDefined();
      expect((paid!.set as any).receiptId).toBeUndefined();
    } finally {
      receiptsOn.value = true;
    }
  });

  it('creates Morning receipt, persists receipts row, marks paid, sends PDF attachment', async () => {
    // billing lookup
    dbMock.selectResults.push([
      { id: 'b1', groupId: 'g1', studentId: 's1', month: '2026-06-01', amount: 300, status: 'due' },
    ]);
    // getGroup lookup
    dbMock.selectResults.push([{ id: 'g1', name: 'מתמטיקה' }]);
    vi.mocked(getStudent).mockResolvedValue({
      id: 's1',
      name: 'דנה',
      phone: '+972500000001',
    } as never);
    vi.mocked(createReceipt).mockResolvedValue({
      docId: 'doc-9',
      docNumber: '1042',
      pdfUrl: 'https://blob.example.com/receipt-1042.pdf',
    });
    dbMock.insertResults.push([{ id: 'r1' }]); // receipts insert

    await markBillingPaid('b1', 'bit');

    expect(createReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        clientName: 'דנה',
        clientPhone: '+972500000001',
        amount: 300,
        method: 'bit',
      }),
    );
    // receipts row links to group billing, not a payment
    expect(dbMock.inserted[0]).toMatchObject({
      values: expect.objectContaining({
        groupBillingId: 'b1',
        morningDocId: 'doc-9',
        morningDocNumber: '1042',
        amount: 300,
        pdfUrl: 'https://blob.example.com/receipt-1042.pdf',
      }),
    });
    // billing marked paid + linked to receipt
    const paidUpdate = dbMock.updated.find(
      (u) => (u.set as Record<string, unknown>).status === 'paid',
    );
    expect(paidUpdate?.set).toMatchObject({ status: 'paid', method: 'bit', receiptId: 'r1' });
    // attachment sent to the member
    expect(sendFileByUrl).toHaveBeenCalledWith(
      '+972500000001',
      'https://blob.example.com/receipt-1042.pdf',
      'receipt-1042.pdf',
      expect.stringContaining('מתמטיקה'),
    );
    // receipt marked sent
    const sentUpdate = dbMock.updated.find(
      (u) => (u.set as Record<string, unknown>).status === 'sent',
    );
    expect(sentUpdate).toBeTruthy();
  });

  it('defaults the receipt description to "חוג {group name}" when none given', async () => {
    dbMock.selectResults.push([
      { id: 'b1', groupId: 'g1', studentId: 's1', month: '2026-06-01', amount: 300, status: 'due' },
    ]);
    dbMock.selectResults.push([{ id: 'g1', name: 'מתמטיקה' }]);
    vi.mocked(getStudent).mockResolvedValue({
      id: 's1',
      name: 'דנה',
      phone: '+972500000001',
      receiptLabel: null,
    } as never);
    vi.mocked(createReceipt).mockResolvedValue({ docId: 'd', docNumber: '1', pdfUrl: 'https://blob/x.pdf' });
    dbMock.insertResults.push([{ id: 'r1' }]);

    await markBillingPaid('b1', 'bit');
    expect(createReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'חוג מתמטיקה' }),
    );
  });

  it('prefers the student receiptLabel over the group default', async () => {
    dbMock.selectResults.push([
      { id: 'b1', groupId: 'g1', studentId: 's1', month: '2026-06-01', amount: 300, status: 'due' },
    ]);
    dbMock.selectResults.push([{ id: 'g1', name: 'מתמטיקה' }]);
    vi.mocked(getStudent).mockResolvedValue({
      id: 's1',
      name: 'דנה',
      phone: '+972500000001',
      receiptLabel: 'הוראה מתקנת',
    } as never);
    vi.mocked(createReceipt).mockResolvedValue({ docId: 'd', docNumber: '1', pdfUrl: 'https://blob/x.pdf' });
    dbMock.insertResults.push([{ id: 'r1' }]);

    await markBillingPaid('b1', 'bit');
    expect(createReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'הוראה מתקנת' }),
    );
  });

  it('uses an explicit description over both defaults', async () => {
    dbMock.selectResults.push([
      { id: 'b1', groupId: 'g1', studentId: 's1', month: '2026-06-01', amount: 300, status: 'due' },
    ]);
    dbMock.selectResults.push([{ id: 'g1', name: 'מתמטיקה' }]);
    vi.mocked(getStudent).mockResolvedValue({
      id: 's1',
      name: 'דנה',
      phone: '+972500000001',
      receiptLabel: 'הוראה מתקנת',
    } as never);
    vi.mocked(createReceipt).mockResolvedValue({ docId: 'd', docNumber: '1', pdfUrl: 'https://blob/x.pdf' });
    dbMock.insertResults.push([{ id: 'r1' }]);

    await markBillingPaid('b1', 'bit', '  חוג קיץ מיוחד  ');
    expect(createReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'חוג קיץ מיוחד' }),
    );
  });

  it('routes the receipt to the guardian phone when present', async () => {
    dbMock.selectResults.push([
      { id: 'b1', groupId: 'g1', studentId: 's1', month: '2026-06-01', amount: 300, status: 'due' },
    ]);
    dbMock.selectResults.push([{ id: 'g1', name: 'מתמטיקה' }]);
    vi.mocked(getStudent).mockResolvedValue({
      id: 's1',
      name: 'דנה',
      phone: '+972500000001',
      guardianPhone: '+972500000099',
      receiptLabel: null,
    } as never);
    vi.mocked(createReceipt).mockResolvedValue({ docId: 'd', docNumber: '1', pdfUrl: 'https://blob/x.pdf' });
    dbMock.insertResults.push([{ id: 'r1' }]);

    await markBillingPaid('b1', 'bit');
    expect(createReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ clientPhone: '+972500000099' }),
    );
    expect(sendFileByUrl).toHaveBeenCalledWith(
      '+972500000099',
      expect.any(String),
      expect.any(String),
      expect.any(String),
    );
  });

  it('is idempotent: a billing already paid does nothing external', async () => {
    dbMock.selectResults.push([{ id: 'b1', status: 'paid' }]);
    await markBillingPaid('b1');
    expect(createReceipt).not.toHaveBeenCalled();
    expect(sendFileByUrl).not.toHaveBeenCalled();
    expect(dbMock.updated).toHaveLength(0);
  });

  it('marks the receipt failed when the WhatsApp send fails', async () => {
    dbMock.selectResults.push([
      { id: 'b1', groupId: 'g1', studentId: 's1', month: '2026-06-01', amount: 300, status: 'due' },
    ]);
    dbMock.selectResults.push([{ id: 'g1', name: 'g' }]);
    vi.mocked(getStudent).mockResolvedValue({ id: 's1', name: 'a', phone: '+972500000001' } as never);
    vi.mocked(createReceipt).mockResolvedValue({
      docId: 'd',
      docNumber: '1',
      pdfUrl: 'https://blob/x.pdf',
    });
    dbMock.insertResults.push([{ id: 'r1' }]);
    vi.mocked(sendFileByUrl).mockResolvedValue({ ok: false, error: 'boom' });

    await markBillingPaid('b1');
    const failedUpdate = dbMock.updated.find(
      (u) => (u.set as Record<string, unknown>).status === 'failed',
    );
    expect(failedUpdate).toBeTruthy();
  });

  it('throws when the billing row is missing', async () => {
    dbMock.selectResults.push([]);
    await expect(markBillingPaid('nope')).rejects.toThrow(/not found/);
  });
});

describe('markBillingUnpaid', () => {
  it('resets status to due and clears method/paidAt', async () => {
    dbMock.selectResults.push([{ id: 'b1' }]);
    await markBillingUnpaid('b1');
    expect(dbMock.updated[0].set).toMatchObject({ status: 'due', method: null, paidAt: null });
  });

  it('throws when missing', async () => {
    dbMock.selectResults.push([]);
    await expect(markBillingUnpaid('nope')).rejects.toThrow(/not found/);
  });
});

describe('rosterFor', () => {
  it('returns billed members with status + amount + receiptLabel', async () => {
    dbMock.selectResults.push([
      { billingId: 'b1', studentId: 's1', name: 'דנה', status: 'paid', amount: 300, receiptLabel: 'חוג מתמטיקה' },
      { billingId: 'b2', studentId: 's2', name: 'יוסי', status: 'due', amount: 300, receiptLabel: null },
    ]);
    const roster = await rosterFor('g1', '2026-06');
    expect(roster).toHaveLength(2);
    expect(roster[0]).toMatchObject({
      studentId: 's1',
      status: 'paid',
      amount: 300,
      receiptLabel: 'חוג מתמטיקה',
    });
  });
});
