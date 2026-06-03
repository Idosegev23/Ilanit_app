import { env } from '@/lib/env';
import { phoneToChatId, normalizePhoneIL } from '@/lib/utils';

// Outbound-only GreenAPI client (ported from world-cup pattern). No inbound
// webhook in this system — every interaction is a WhatsApp link → web action.

interface GreenApiResp {
  idMessage?: string;
}

export interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

function opUrl(op: string): string {
  const e = env();
  return `${e.GREEN_API_BASE_URL}/waInstance${e.GREEN_API_ID_INSTANCE}/${op}/${e.GREEN_API_TOKEN}`;
}

async function callGreen<T = GreenApiResp>(op: string, body: unknown): Promise<T> {
  const res = await fetch(opUrl(op), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GreenAPI ${op} failed (${res.status}): ${text}`);
  }
  return (await res.json()) as T;
}

function toChatId(toPhone: string): string {
  // accept raw IL phone, E.164, or an already-built chatId
  if (toPhone.includes('@')) return toPhone;
  const e164 = toPhone.startsWith('+') || toPhone.startsWith('972')
    ? (toPhone.startsWith('+') ? toPhone : `+${toPhone}`)
    : normalizePhoneIL(toPhone);
  return phoneToChatId(e164);
}

/** Sends a plain text WhatsApp message. */
export async function sendText(toPhone: string, text: string): Promise<SendResult> {
  try {
    const chatId = toChatId(toPhone);
    const resp = await callGreen('sendMessage', { chatId, message: text });
    return { ok: true, messageId: resp.idMessage };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Sends a file (e.g. a receipt PDF) by public URL, as a real attachment in the
 * message (not a link). Optional caption.
 */
export async function sendFileByUrl(
  toPhone: string,
  url: string,
  filename: string,
  caption?: string,
): Promise<SendResult> {
  try {
    const chatId = toChatId(toPhone);
    const resp = await callGreen('sendFileByUrl', {
      chatId,
      urlFile: url,
      fileName: filename,
      ...(caption ? { caption } : {}),
    });
    return { ok: true, messageId: resp.idMessage };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
