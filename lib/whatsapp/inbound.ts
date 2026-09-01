import { advanceStatusByProviderMsgId, logMessage, type MessageStatus } from '@/lib/message-log';
import { resolveContactStudent } from '@/lib/messages';

// Processes GreenAPI incoming webhook notifications. Two kinds matter:
//   • outgoingMessageStatus  → advance our message's delivered/read status
//   • incomingMessageReceived → store a customer reply (ONLY for known students)
// Everything else — other projects sharing the instance, unknown numbers — is
// ignored. Matching is by our own idMessage (status) or by a student phone
// (incoming), so no allow-list of numbers is needed.

/** GreenAPI outgoing-status value → our message status. */
function mapGreenStatus(s: string): MessageStatus | null {
  switch (s) {
    case 'sent':
      return 'sent';
    case 'delivered':
      return 'delivered';
    case 'read':
      return 'read';
    case 'failed':
    case 'noAccount':
    case 'notInGroup':
      return 'failed';
    default:
      return null;
  }
}

/** chatId "9725...@c.us" → E.164 "+9725...". */
function chatIdToE164(chatId: string): string | null {
  const digits = (chatId || '').split('@')[0].replace(/\D/g, '');
  return digits ? `+${digits}` : null;
}

export interface GreenNotification {
  typeWebhook?: string;
  idMessage?: string;
  status?: string;
  senderData?: { chatId?: string; sender?: string; senderName?: string };
  messageData?: {
    typeMessage?: string;
    textMessageData?: { textMessage?: string };
    extendedTextMessageData?: { text?: string };
  };
}

/** Who the stored incoming message came from, when we recognised them. */
export interface InboundStudent {
  id: string;
  name: string;
  phone: string;
}

export interface HandleResult {
  handled: boolean;
  note: string;
  /** Set only when an incoming message was stored against a known student. */
  student?: InboundStudent;
  /** The message text, so the caller can quote it without re-parsing. */
  text?: string;
}

/** Processes ONE GreenAPI notification. Safe to receive traffic for other apps. */
export async function handleGreenNotification(n: GreenNotification): Promise<HandleResult> {
  const type = n.typeWebhook;

  if (type === 'outgoingMessageStatus' || type === 'outgoingAPIMessageStatus') {
    const mapped = n.status ? mapGreenStatus(n.status) : null;
    if (!mapped || !n.idMessage) return { handled: false, note: 'status: unmapped/no id' };
    const advanced = await advanceStatusByProviderMsgId(n.idMessage, mapped);
    return {
      handled: advanced,
      note: advanced ? `status→${mapped}` : 'status: not our message',
    };
  }

  if (type === 'incomingMessageReceived') {
    const phone = n.senderData?.chatId ? chatIdToE164(n.senderData.chatId) : null;
    if (!phone) return { handled: false, note: 'incoming: no sender' };

    const student = await resolveContactStudent(phone);
    if (!student) return { handled: false, note: 'incoming: unknown number (ignored)' };

    const body =
      n.messageData?.textMessageData?.textMessage ??
      n.messageData?.extendedTextMessageData?.text ??
      '[מדיה]';

    await logMessage({
      toPhone: phone,
      template: 'inbound',
      body,
      direction: 'in',
      providerMsgId: n.idMessage,
      status: 'read',
    });
    /*
      The caller gets the identified student back. The bot forwards every
      notification here anyway, so answering "who was that?" in the same
      response saves it a second lookup — and it is the bot, not this app, that
      then decides whether to nudge Ilanit on WhatsApp about it.
    */
    return {
      handled: true,
      note: 'incoming stored',
      student: { id: student.id, name: student.name, phone },
      text: body,
    };
  }

  return { handled: false, note: `ignored type: ${type ?? 'unknown'}` };
}
