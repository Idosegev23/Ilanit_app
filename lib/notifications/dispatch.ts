import { renderTemplate, type TemplateKey } from '@/lib/notifications/templates';
import { sendText } from '@/lib/whatsapp/provider';
import { alreadySent, logMessage, updateMessageLog } from '@/lib/message-log';
import { contactPhoneFor } from '@/lib/students';
import type { Student } from '@/db/schema';

// Idempotent notification dispatch: render → check message-log → send via
// WhatsApp → record result. When relatedId is given, a previously-sent message
// with the same (template, relatedId) is skipped (safe for cron re-runs).

export interface NotifyResult {
  ok: boolean;
  skipped?: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Sends a templated WhatsApp message. If relatedId is provided and an
 * identical (template, relatedId) message was already sent, this is a no-op.
 */
export async function notify(
  template: TemplateKey,
  to: string,
  vars: Record<string, string | number>,
  relatedId?: string,
  relatedLessonId?: string,
): Promise<NotifyResult> {
  if (relatedId && (await alreadySent(template, relatedId))) {
    return { ok: true, skipped: true };
  }

  const body = renderTemplate(template, vars);
  const logId = await logMessage({
    toPhone: to,
    template,
    body,
    relatedId,
    relatedLessonId,
    status: 'pending',
  });

  const result = await sendText(to, body);

  if (result.ok) {
    await updateMessageLog(logId, { status: 'sent', providerMsgId: result.messageId });
    return { ok: true, messageId: result.messageId };
  }

  await updateMessageLog(logId, { status: 'failed', error: result.error });
  return { ok: false, error: result.error };
}

/**
 * Sends a templated WhatsApp message to a STUDENT, routing to the guardian
 * (parent) phone when one is set (`contactPhoneFor`). Use this anywhere we
 * message a student so a child's messages reach their parent. All other
 * semantics (idempotency, logging) match `notify`.
 */
export async function notifyStudent(
  student: Pick<Student, 'phone' | 'guardianPhone'>,
  template: TemplateKey,
  vars: Record<string, string | number>,
  relatedId?: string,
  relatedLessonId?: string,
): Promise<NotifyResult> {
  return notify(template, contactPhoneFor(student), vars, relatedId, relatedLessonId);
}
