import { db } from '@/lib/db';
import { lessons, payments, receipts, students, type Student } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { put } from '@vercel/blob';
import { env } from '@/lib/env';
import { getSettings } from '@/lib/settings';
import { sendFileByUrl } from '@/lib/whatsapp/provider';
import { notify } from '@/lib/notifications/dispatch';
import { formatShekels } from '@/lib/utils';
import { formatILDateTime } from '@/lib/time';
import { createReceipt, type ReceiptInput } from '@/lib/morning';
import { contactPhoneFor } from '@/lib/students';

// Orchestrates the "payment received → official receipt" flow for an individual
// lesson:
//   1. mark payment paid (amount + method, integer shekels)
//   2. create the official Morning document (PDF)
//   3. mirror the PDF to Vercel Blob (durable copy for the client file)
//   4. send the PDF to the student as a WhatsApp attachment (not a link)
//   5. persist a receipts row linked to the payment (client-file archive)
// Each external call is wrapped; failures degrade gracefully and are recorded.

export type PaymentMethod = 'bit' | 'cash' | 'transfer' | 'other';

export interface MarkPaidInput {
  lessonId: string;
  amount: number; // ₪ integer
  method: PaymentMethod;
}

export interface MarkPaidResult {
  ok: boolean;
  receiptId?: string;
  docNumber?: string;
  pdfUrl?: string;
  sent?: boolean;
  error?: string;
}

/** Downloads a PDF from a URL and mirrors it to Vercel Blob, returning the Blob URL. */
async function mirrorPdfToBlob(sourceUrl: string, pathname: string): Promise<string> {
  const res = await fetch(sourceUrl);
  if (!res.ok) {
    throw new Error(`failed to download receipt PDF (${res.status})`);
  }
  const data = Buffer.from(await res.arrayBuffer());
  const blob = await put(pathname, data, {
    access: 'public',
    contentType: 'application/pdf',
    token: env().BLOB_READ_WRITE_TOKEN,
    addRandomSuffix: true,
  });
  return blob.url;
}

/**
 * Marks an individual lesson's payment as paid, issues a Morning receipt,
 * stores the PDF in Blob, sends it to the student via WhatsApp as an
 * attachment, and saves a receipts row. Returns a typed result.
 */
export async function markLessonPaidAndIssueReceipt(
  input: MarkPaidInput,
): Promise<MarkPaidResult> {
  const { lessonId } = input;
  const amount = Math.round(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'amount must be a positive integer (shekels)' };
  }

  // Load lesson + student.
  const lessonRows = await db.select().from(lessons).where(eq(lessons.id, lessonId)).limit(1);
  const lesson = lessonRows[0];
  if (!lesson) return { ok: false, error: 'lesson not found' };

  let student: Student | null = null;
  if (lesson.studentId) {
    const sRows = await db.select().from(students).where(eq(students.id, lesson.studentId)).limit(1);
    student = sRows[0] ?? null;
  }

  const clientName = student?.name ?? lesson.bookedByName ?? 'תלמיד/ה';
  // Route to the guardian (parent) phone when the student has one.
  const clientPhone = student
    ? contactPhoneFor(student)
    : (lesson.bookedByPhone ?? undefined);

  // Upsert the payment row to paid.
  const now = new Date();
  const existing = await db.select().from(payments).where(eq(payments.lessonId, lessonId)).limit(1);
  let paymentId: string;
  if (existing[0]) {
    paymentId = existing[0].id;
    await db
      .update(payments)
      .set({ status: 'paid', amount, method: input.method, paidAt: now })
      .where(eq(payments.id, paymentId));
  } else {
    const inserted = await db
      .insert(payments)
      .values({ lessonId, status: 'paid', amount, method: input.method, paidAt: now })
      .returning({ id: payments.id });
    paymentId = inserted[0].id;
  }

  // Mark the lesson completed (a paid lesson is, by definition, done).
  if (lesson.status !== 'completed') {
    await db.update(lessons).set({ status: 'completed' }).where(eq(lessons.id, lessonId));
  }

  // Issue the official Morning receipt.
  const description = `שיעור פרטי – ${formatILDateTime(lesson.startsAt)}`;
  const receiptInput: ReceiptInput = {
    clientName,
    clientPhone,
    amount,
    description,
    method: input.method,
  };

  let docId: string;
  let docNumber: string;
  let morningPdfUrl: string;
  try {
    const doc = await createReceipt(receiptInput);
    docId = doc.docId;
    docNumber = doc.docNumber;
    morningPdfUrl = doc.pdfUrl;
  } catch (err) {
    return {
      ok: false,
      error: `Morning receipt failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const settings = await getSettings();
  const docType = settings.morningDocType ?? env().MORNING_DOC_TYPE ?? '400';

  // Mirror to Blob (durable copy for the client file). If mirroring fails, fall
  // back to the Morning URL so we still have a usable link in the archive.
  let pdfUrl = morningPdfUrl;
  try {
    if (morningPdfUrl) {
      pdfUrl = await mirrorPdfToBlob(morningPdfUrl, `receipts/${docNumber || docId}.pdf`);
    }
  } catch {
    pdfUrl = morningPdfUrl;
  }

  // Persist the receipts row (status starts at 'created').
  const receiptRow = await db
    .insert(receipts)
    .values({
      paymentId,
      morningDocId: docId,
      morningDocNumber: docNumber,
      docType: String(docType),
      amount,
      pdfUrl,
      status: 'created',
    })
    .returning({ id: receipts.id });
  const receiptId = receiptRow[0].id;

  // Send the PDF to the student as a WhatsApp attachment.
  let sent = false;
  if (clientPhone && pdfUrl) {
    const caption =
      `שלום ${clientName}! מצורפת הקבלה על סך ${formatShekels(amount)} עבור השיעור.\n` +
      `מספר קבלה: ${docNumber}. תודה!`;
    const fileName = `קבלה-${docNumber || docId}.pdf`;
    const result = await sendFileByUrl(clientPhone, pdfUrl, fileName, caption);
    sent = result.ok;
    await db
      .update(receipts)
      .set(sent ? { status: 'sent', sentAt: new Date() } : { status: 'failed' })
      .where(eq(receipts.id, receiptId));
  }

  return { ok: true, receiptId, docNumber, pdfUrl, sent };
}

/**
 * Sends a payment request (no receipt) to the student for an unpaid lesson.
 * Idempotent via message-log keyed on the lesson id.
 */
export async function sendPaymentRequest(lessonId: string): Promise<{ ok: boolean; error?: string }> {
  const lessonRows = await db.select().from(lessons).where(eq(lessons.id, lessonId)).limit(1);
  const lesson = lessonRows[0];
  if (!lesson) return { ok: false, error: 'lesson not found' };

  let studentName = lesson.bookedByName ?? 'תלמיד/ה';
  let phone = lesson.bookedByPhone ?? undefined;
  if (lesson.studentId) {
    const sRows = await db.select().from(students).where(eq(students.id, lesson.studentId)).limit(1);
    if (sRows[0]) {
      studentName = sRows[0].name;
      phone = contactPhoneFor(sRows[0]); // guardian phone when present
    }
  }
  if (!phone) return { ok: false, error: 'no phone for student' };

  // Resolve the amount from an existing payment row or the lesson price snapshot.
  const payRows = await db.select().from(payments).where(eq(payments.lessonId, lessonId)).limit(1);
  const amount = payRows[0]?.amount ?? lesson.price ?? 0;

  const result = await notify(
    'payment_request_individual',
    phone,
    { studentName, datetime: formatILDateTime(lesson.startsAt), amount },
    `payment_request:${lessonId}`,
    lessonId,
  );
  return { ok: result.ok, error: result.error };
}
