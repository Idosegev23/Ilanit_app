import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks for all cross-module + external deps (mock BEFORE importing SUT) ──

// These cases exercise the receipt-issuing path, so the flag is ON here; the
// production default is OFF and is covered by its own case below.
const receiptsOn = vi.hoisted(() => ({ value: true }));
vi.mock('@/lib/env', () => ({
  env: () => ({ BLOB_READ_WRITE_TOKEN: 'blob-token', MORNING_DOC_TYPE: undefined }),
  receiptsEnabled: () => receiptsOn.value,
}));

vi.mock('@/lib/settings', () => ({
  getSettings: vi.fn(async () => ({ morningDocType: '400' })),
}));

vi.mock('@/lib/morning', () => ({
  createReceipt: vi.fn(),
}));

vi.mock('@vercel/blob', () => ({
  put: vi.fn(),
}));

vi.mock('@/lib/whatsapp/provider', () => ({
  sendFileByUrl: vi.fn(),
}));

vi.mock('@/lib/notifications/dispatch', () => ({
  notify: vi.fn(),
}));

// In-memory fake DB capturing inserts/updates and serving selects.
const state = {
  lesson: null as Record<string, unknown> | null,
  student: null as Record<string, unknown> | null,
  payment: null as Record<string, unknown> | null,
  inserts: [] as Array<{ table: string; values: unknown }>,
  updates: [] as Array<{ table: string; set: unknown }>,
};

function tableName(t: unknown): string {
  // Drizzle table object → use the mocked schema marker.
  return (t as { __name?: string }).__name ?? 'unknown';
}

vi.mock('@/db/schema', () => ({
  lessons: { __name: 'lessons' },
  payments: { __name: 'payments' },
  receipts: { __name: 'receipts' },
  students: { __name: 'students' },
}));

vi.mock('drizzle-orm', () => ({
  eq: (col: unknown, val: unknown) => ({ col, val }),
}));

vi.mock('@/lib/db', () => {
  const db = {
    select: () => ({
      from: (t: unknown) => ({
        where: () => ({
          limit: async () => {
            const name = tableName(t);
            if (name === 'lessons') return state.lesson ? [state.lesson] : [];
            if (name === 'students') return state.student ? [state.student] : [];
            if (name === 'payments') return state.payment ? [state.payment] : [];
            return [];
          },
        }),
      }),
    }),
    insert: (t: unknown) => ({
      values: (values: unknown) => {
        state.inserts.push({ table: tableName(t), values });
        return {
          returning: async () => [{ id: `${tableName(t)}-new-id` }],
        };
      },
    }),
    update: (t: unknown) => ({
      set: (set: unknown) => {
        state.updates.push({ table: tableName(t), set });
        return { where: async () => undefined };
      },
    }),
  };
  return { db };
});

import { markLessonPaidAndIssueReceipt, sendPaymentRequest } from '@/lib/morning/receipt-service';
import { createReceipt } from '@/lib/morning';
import { put } from '@vercel/blob';
import { sendFileByUrl } from '@/lib/whatsapp/provider';
import { notify } from '@/lib/notifications/dispatch';

const LESSON = {
  id: 'lesson-1',
  studentId: 'student-1',
  status: 'confirmed',
  price: 120,
  startsAt: new Date('2026-06-02T15:00:00Z'),
  bookedByName: 'Booked Name',
  bookedByPhone: '+972500000000',
};
const STUDENT = {
  id: 'student-1',
  name: 'דנה כהן',
  phone: '+972501234567',
  receiptLabel: null as string | null,
};

beforeEach(() => {
  state.lesson = { ...LESSON };
  state.student = { ...STUDENT };
  state.payment = null;
  state.inserts = [];
  state.updates = [];
  vi.clearAllMocks();
  vi.mocked(createReceipt).mockResolvedValue({
    docId: 'DOC1',
    docNumber: '1042',
    pdfUrl: 'https://morning/he.pdf',
  });
  vi.mocked(put).mockResolvedValue({
    url: 'https://blob.vercel/receipts/1042.pdf',
    downloadUrl: 'https://blob.vercel/receipts/1042.pdf?download=1',
    pathname: 'receipts/1042.pdf',
    contentType: 'application/pdf',
    contentDisposition: 'inline',
  } as never);
  vi.mocked(sendFileByUrl).mockResolvedValue({ ok: true, messageId: 'wa-1' });
  vi.mocked(notify).mockResolvedValue({ ok: true });
  // global fetch used by mirrorPdfToBlob
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(8),
    })) as unknown as typeof fetch,
  );
});

describe('markLessonPaidAndIssueReceipt', () => {
  it('settles the payment WITHOUT a receipt when receipts are off', async () => {
    /*
      The production default. Ilanit confirms money arrived far more often than
      she is ready to put a numbered tax document behind it, and a receipt
      cannot be un-issued — so the two are separate decisions.

      This also removes an old trap: the payment was marked paid BEFORE Morning
      was called, so a Morning outage returned ok:false from a screen whose
      money had already been recorded as settled.
    */
    receiptsOn.value = false;
    try {
      const res = await markLessonPaidAndIssueReceipt({
        lessonId: 'lesson-1',
        amount: 140,
        method: 'bit',
      });

      expect(res.ok).toBe(true);
      expect(res.docNumber).toBeUndefined();
      expect(createReceipt).not.toHaveBeenCalled();
      // The money is still recorded — only the document is skipped.
      const settled =
        state.inserts.find((i) => (i.values as any)?.status === 'paid') ??
        state.updates.find((u) => (u.set as any)?.status === 'paid');
      expect(settled).toBeDefined();
      // …and no receipts row was written.
      expect(state.inserts.find((i) => i.table === 'receipts')).toBeUndefined();
    } finally {
      receiptsOn.value = true;
    }
  });

  it('marks paid, creates Morning receipt, mirrors to Blob, sends attachment, saves receipt row', async () => {
    const res = await markLessonPaidAndIssueReceipt({
      lessonId: 'lesson-1',
      amount: 120,
      method: 'bit',
    });

    expect(res.ok).toBe(true);
    expect(res.docNumber).toBe('1042');
    expect(res.pdfUrl).toBe('https://blob.vercel/receipts/1042.pdf');
    expect(res.sent).toBe(true);

    // Morning called with integer shekels + student name
    expect(createReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ clientName: 'דנה כהן', amount: 120, method: 'bit' }),
    );

    // Blob upload with public access + pdf content type + token
    expect(put).toHaveBeenCalledWith(
      expect.stringContaining('receipts/'),
      expect.any(Buffer),
      expect.objectContaining({ access: 'public', contentType: 'application/pdf', token: 'blob-token' }),
    );

    // WhatsApp attachment sent to the STUDENT phone, with the Blob URL
    expect(sendFileByUrl).toHaveBeenCalledWith(
      '+972501234567',
      'https://blob.vercel/receipts/1042.pdf',
      expect.stringContaining('1042'),
      expect.stringContaining('1042'),
    );

    // payment inserted as paid (no prior row) + lesson set completed
    const paymentInsert = state.inserts.find((i) => i.table === 'payments');
    expect(paymentInsert?.values).toMatchObject({ status: 'paid', amount: 120, method: 'bit' });
    expect(state.updates.some((u) => u.table === 'lessons' && (u.set as { status?: string }).status === 'completed')).toBe(true);

    // receipts row inserted then marked sent
    const receiptInsert = state.inserts.find((i) => i.table === 'receipts');
    expect(receiptInsert?.values).toMatchObject({
      morningDocId: 'DOC1',
      morningDocNumber: '1042',
      amount: 120,
      status: 'created',
    });
    expect(state.updates.some((u) => u.table === 'receipts' && (u.set as { status?: string }).status === 'sent')).toBe(true);
  });

  it('uses the chosen description for the Morning receipt (with the lesson date appended)', async () => {
    await markLessonPaidAndIssueReceipt({
      lessonId: 'lesson-1',
      amount: 120,
      method: 'bit',
      description: 'הוראה מתקנת',
    });
    expect(createReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ description: expect.stringContaining('הוראה מתקנת') }),
    );
  });

  it("falls back to the student's receiptLabel when no description is provided", async () => {
    state.student = { ...STUDENT, receiptLabel: 'חוג מתמטיקה' };
    await markLessonPaidAndIssueReceipt({ lessonId: 'lesson-1', amount: 120, method: 'bit' });
    expect(createReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ description: expect.stringContaining('חוג מתמטיקה') }),
    );
  });

  it('falls back to the default description when neither description nor receiptLabel exist', async () => {
    await markLessonPaidAndIssueReceipt({ lessonId: 'lesson-1', amount: 120, method: 'bit' });
    expect(createReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ description: expect.stringContaining('שיעור פרטי') }),
    );
  });

  it('updates an existing payment row instead of inserting a new one', async () => {
    state.payment = { id: 'pay-existing', lessonId: 'lesson-1', status: 'due', amount: 120 };
    await markLessonPaidAndIssueReceipt({ lessonId: 'lesson-1', amount: 150, method: 'cash' });

    expect(state.inserts.find((i) => i.table === 'payments')).toBeUndefined();
    const payUpdate = state.updates.find((u) => u.table === 'payments');
    expect(payUpdate?.set).toMatchObject({ status: 'paid', amount: 150, method: 'cash' });
  });

  it('rejects a non-positive amount without calling Morning', async () => {
    const res = await markLessonPaidAndIssueReceipt({ lessonId: 'lesson-1', amount: 0, method: 'cash' });
    expect(res.ok).toBe(false);
    expect(createReceipt).not.toHaveBeenCalled();
  });

  it('returns an error when the lesson is missing', async () => {
    state.lesson = null;
    const res = await markLessonPaidAndIssueReceipt({ lessonId: 'nope', amount: 120, method: 'bit' });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/lesson not found/);
  });

  it('surfaces a Morning failure as ok:false and does not save a receipt', async () => {
    vi.mocked(createReceipt).mockRejectedValueOnce(new Error('morning down'));
    const res = await markLessonPaidAndIssueReceipt({ lessonId: 'lesson-1', amount: 120, method: 'bit' });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Morning receipt failed/);
    expect(state.inserts.find((i) => i.table === 'receipts')).toBeUndefined();
  });

  it('falls back to the Morning URL when Blob mirroring fails', async () => {
    vi.mocked(put).mockRejectedValueOnce(new Error('blob down'));
    const res = await markLessonPaidAndIssueReceipt({ lessonId: 'lesson-1', amount: 120, method: 'bit' });
    expect(res.ok).toBe(true);
    expect(res.pdfUrl).toBe('https://morning/he.pdf');
    const receiptInsert = state.inserts.find((i) => i.table === 'receipts');
    expect(receiptInsert?.values).toMatchObject({ pdfUrl: 'https://morning/he.pdf' });
  });

  it('marks the receipt failed when the WhatsApp attachment fails to send', async () => {
    vi.mocked(sendFileByUrl).mockResolvedValueOnce({ ok: false, error: 'green down' });
    const res = await markLessonPaidAndIssueReceipt({ lessonId: 'lesson-1', amount: 120, method: 'bit' });
    expect(res.ok).toBe(true);
    expect(res.sent).toBe(false);
    expect(state.updates.some((u) => u.table === 'receipts' && (u.set as { status?: string }).status === 'failed')).toBe(true);
  });
});

describe('sendPaymentRequest', () => {
  it('sends a type-aware individual payment request via notify (idempotent key)', async () => {
    const res = await sendPaymentRequest('lesson-1');
    expect(res.ok).toBe(true);
    expect(notify).toHaveBeenCalledWith(
      'payment_request_individual',
      '+972501234567',
      expect.objectContaining({ studentName: 'דנה כהן', amount: 120 }),
      'payment_request:lesson-1',
      'lesson-1',
    );
  });

  it('returns an error when the lesson is missing', async () => {
    state.lesson = null;
    const res = await sendPaymentRequest('nope');
    expect(res.ok).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });
});
