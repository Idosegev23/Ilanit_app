import { formatShekels } from '@/lib/utils';

// Type-aware Hebrew message templates. Keys cover the full notification surface
// of the system (individual lessons + learning groups). Variables are passed in
// and interpolated; templates never call external services.

export type TemplateKey =
  | 'booking_link_student'
  | 'booking_pending_student'
  | 'booking_pending_ilanit'
  | 'booking_scheduled_ilanit'
  | 'booking_cancelled_ilanit'
  | 'booking_approved_student'
  | 'booking_rejected_student'
  | 'lesson_replaced_student'
  | 'standby_registered_student'
  | 'standby_slot_ilanit'
  | 'reminder_day_before_individual'
  | 'reminder_day_before_group'
  | 'reminder_day_before_ilanit'
  | 'payment_check_ilanit'
  | 'payment_request_individual'
  | 'payment_request_group'
  | 'payment_followup_ilanit'
  | 'assign_student_ilanit'
  | 'group_billing_member'
  | 'group_roster_ilanit'
  | 'pay_request_individual'
  | 'pay_request_group'
  | 'pay_intent_ilanit'
  | 'pay_declared_ilanit'
  | 'pay_confirm_ilanit'
  | 'pay_nudge_student'
  | 'receipts_due_ilanit'
  | 'lesson_moved_student';

type Vars = Record<string, string | number>;

function s(vars: Vars, key: string): string {
  const v = vars[key];
  return v === undefined || v === null ? '' : String(v);
}

/** Money helper that accepts either a number or numeric string from vars. */
function money(vars: Vars, key: string): string {
  const v = vars[key];
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? formatShekels(n) : '';
}

const builders: Record<TemplateKey, (v: Vars) => string> = {
  booking_link_student: (v) =>
    `שלום ${s(v, 'studentName')}! 🌟\n` +
    `הנה לינק אישי לתיאום שיעור עם אילנית:\n` +
    `${s(v, 'bookingUrl')}\n` +
    `פותחים את הקישור, בוחרים מועד פנוי — וזהו. נתראה!`,

  booking_pending_student: (v) =>
    `שלום ${s(v, 'studentName')}! 🌟\n` +
    `בקשתך לשיעור בתאריך ${s(v, 'datetime')} התקבלה וממתינה לאישור של אילנית.\n` +
    `נעדכן אותך ברגע שהשיעור יאושר.` +
    (s(v, 'cancelUrl') ? `\nלשינוי או ביטול הבקשה: ${s(v, 'cancelUrl')}` : ''),

  booking_pending_ilanit: (v) =>
    `בקשת שיעור חדשה 📩\n` +
    `תלמיד/ה: ${s(v, 'studentName')} (${s(v, 'phone')})\n` +
    `מתי: ${s(v, 'datetime')}\n` +
    `מחיר: ${money(v, 'price')}\n` +
    (s(v, 'notes') ? `הערות: ${s(v, 'notes')}\n` : '') +
    `לאישור או דחייה: ${s(v, 'actionUrl')}`,

  booking_scheduled_ilanit: (v) =>
    `נקבע שיעור חדש ✅\n` +
    `תלמיד/ה: ${s(v, 'studentName')} (${s(v, 'phone')})\n` +
    `מתי: ${s(v, 'datetime')}\n` +
    `מחיר: ${money(v, 'price')}\n` +
    (s(v, 'notes') ? `הערות: ${s(v, 'notes')}\n` : '') +
    `השיעור נכנס ליומן והתלמיד/ה קיבל/ה אישור.`,

  booking_cancelled_ilanit: (v) =>
    `שיעור בוטל ❌\n` +
    `תלמיד/ה: ${s(v, 'studentName')}${s(v, 'phone') ? ` (${s(v, 'phone')})` : ''}\n` +
    `מתי: ${s(v, 'datetime')}\n` +
    `הביטול נעשה על ידי התלמיד/ה דרך הקישור, והזמן התפנה ביומן.`,

  /*
    The price is stated here, at the moment the lesson is confirmed, so the
    first time a parent hears a number is not the payment request after the
    lesson has already happened. Omitted when there is none — a 0₪ student is a
    standing exemption, and "עלות: 0 ₪" reads like a mistake.
  */
  booking_approved_student: (v) =>
    `מצוין ${s(v, 'studentName')}! ✅\n` +
    `השיעור שלך אושר ל-${s(v, 'datetime')}.\n` +
    `כתובת: ${s(v, 'location')}\n` +
    (Number(v.price) > 0 ? `עלות השיעור: ${money(v, 'price')}\n` : '') +
    (s(v, 'calendarUrl') ? `הוספה ליומן: ${s(v, 'calendarUrl')}\n` : '') +
    (s(v, 'cancelUrl') ? `לשינוי או ביטול המועד: ${s(v, 'cancelUrl')}\n` : '') +
    `נתראה!`,

  booking_rejected_student: (v) =>
    `שלום ${s(v, 'studentName')}, מצטערים — המועד שביקשת (${s(v, 'datetime')}) לא זמין.\n` +
    `אפשר לקבוע מועד אחר כאן: ${s(v, 'bookingUrl')}`,

  lesson_replaced_student: (v) =>
    `שלום ${s(v, 'studentName')},\n` +
    `השיעור שהיה קבוע ל-${s(v, 'datetime')} בוטל.\n` +
    (s(v, 'bookingUrl')
      ? `לתיאום מועד חדש שמתאים לך: ${s(v, 'bookingUrl')}`
      : 'נשמח לתאם מועד חדש בהמשך.'),

  standby_registered_student: (v) =>
    `נרשמת לרשימת ההמתנה! 📝\n` +
    `${s(v, 'studentName')}, ברגע שיתפנה מקום ב${s(v, 'daysLabel')} בין ${s(v, 'startTime')}–${s(v, 'endTime')} — נעדכן אותך.\n` +
    `תודה!`,

  standby_slot_ilanit: (v) =>
    `התפנה מקום מתאים לרשימת ההמתנה ⏳\n` +
    `מתי: ${s(v, 'datetime')}\n` +
    `בהמתנה שמתאימים: ${s(v, 'count')}\n` +
    `לצפייה ואישור: ${s(v, 'actionUrl')}`,

  /*
    The optional `debt` line rides on the reminder rather than going out as its
    own message: a parent who owes money already hears from us tomorrow, and a
    separate chase would be a second notification for the same conversation.
  */
  reminder_day_before_individual: (v) =>
    `תזכורת 📚 שלום ${s(v, 'studentName')}!\n` +
    `מחר יש לך שיעור ב-${s(v, 'datetime')}.\n` +
    `כתובת: ${s(v, 'location')}\n` +
    (s(v, 'debt') ? `\n${s(v, 'debt')}\n` : '') +
    `נתראה!`,

  reminder_day_before_group: (v) =>
    `תזכורת 👥 שלום ${s(v, 'studentName')}!\n` +
    `מחר יש מפגש של קבוצת "${s(v, 'groupName')}" ב-${s(v, 'datetime')}.\n` +
    `כתובת: ${s(v, 'location')}\n` +
    (s(v, 'debt') ? `\n${s(v, 'debt')}\n` : '') +
    `נתראה!`,

  reminder_day_before_ilanit: (v) =>
    `סיכום שיעורי מחר (${s(v, 'date')}) 🗓️\n${s(v, 'summary')}`,

  payment_check_ilanit: (v) =>
    `השיעור של ${s(v, 'studentName')} ב-${s(v, 'datetime')} הסתיים.\n` +
    `התקבל תשלום של ${money(v, 'amount')}?\n` +
    `לעדכון ולהפקת קבלה: ${s(v, 'actionUrl')}`,

  payment_request_individual: (v) =>
    `שלום ${s(v, 'studentName')} 🙏\n` +
    `תזכורת לתשלום עבור השיעור ב-${s(v, 'datetime')}: ${money(v, 'amount')}.\n` +
    `אפשר לשלם בביט / מזומן / העברה. תודה!`,

  payment_request_group: (v) =>
    `שלום ${s(v, 'studentName')} 🙏\n` +
    `תזכורת לתשלום החודשי עבור קבוצת "${s(v, 'groupName')}" (${s(v, 'month')}): ${money(v, 'amount')}.\n` +
    `אפשר לשלם בביט / מזומן / העברה. תודה!`,

  payment_followup_ilanit: (v) =>
    `תזכורת: יש חובות פתוחים 💰\n${s(v, 'summary')}`,

  assign_student_ilanit: (v) =>
    `נמצא אירוע ביומן שלא זוהה: "${s(v, 'eventTitle')}" ב-${s(v, 'datetime')}.\n` +
    `למי לשייך את השיעור? ${s(v, 'actionUrl')}`,

  group_billing_member: (v) =>
    `שלום ${s(v, 'studentName')}! 🗓️\n` +
    `התשלום החודשי עבור קבוצת "${s(v, 'groupName')}" לחודש ${s(v, 'month')}: ${money(v, 'amount')}.\n` +
    `אפשר לשלם בביט / מזומן / העברה. תודה!`,

  /*
    Parent-facing payment request. The amount is in the TEXT because a Bit "me"
    link cannot carry one — it identifies the payee and nothing else.
  */
  pay_request_individual: (v) =>
    `שלום ${s(v, 'studentName')} 🙏\n` +
    `עבור השיעור ב-${s(v, 'datetime')}: ${money(v, 'amount')}.\n` +
    `לתשלום ולעדכון: ${s(v, 'actionUrl')}`,

  pay_request_group: (v) =>
    `שלום ${s(v, 'studentName')} 🙏\n` +
    `התשלום החודשי לקבוצת "${s(v, 'groupName')}" עבור ${s(v, 'month')}: ${money(v, 'amount')}.\n` +
    `לתשלום ולעדכון: ${s(v, 'actionUrl')}`,

  /** Fires the moment a parent picks a method — Ilanit sees it as it happens. */
  pay_intent_ilanit: (v) =>
    `${s(v, 'studentName')} בחר/ה ${s(v, 'methodLabel')} 💳\n` +
    `סכום: ${money(v, 'amount')}\n` +
    `${s(v, 'context')}`,

  /*
    The parent says it is already settled but not how. Ask Ilanit for the method
    and let her confirm in one step — the link opens her settle screen, where
    bit/cash is chosen.
  */
  pay_declared_ilanit: (v) =>
    `${s(v, 'studentName')} סימן/ה *שילמתי* ✅\n` +
    `עבור ${s(v, 'context')} · ${money(v, 'amount')}\n` +
    `איך שולם — ביט או מזומן? לעדכון ואישור: ${s(v, 'actionUrl')}`,

  /** The loop-closer: nothing comes back from Bit or cash, so we ask. */
  pay_confirm_ilanit: (v) =>
    `בירור תשלום ❓\n` +
    `${s(v, 'studentName')} סימן/ה ${s(v, 'methodLabel')} עבור ${s(v, 'context')}.\n` +
    `סכום: ${money(v, 'amount')}\n` +
    `האם התקבל? ${s(v, 'actionUrl')}`,

  pay_nudge_student: (v) =>
    `שלום ${s(v, 'studentName')} 🙏\n` +
    `תזכורת קטנה — נותר תשלום פתוח של ${money(v, 'amount')} עבור ${s(v, 'context')}.\n` +
    `לתשלום ולעדכון: ${s(v, 'actionUrl')}`,

  /*
    A moved lesson is an UPDATE, not a request. Ilanit settles any objection
    with the parent directly, so an accept/decline round-trip would only add a
    step to a conversation she is already having — and leave a lesson in limbo
    while nobody clicks.
  */
  lesson_moved_student: (v) =>
    `שלום ${s(v, 'studentName')} 🗓️\n` +
    `עדכון: השיעור הוזז\n` +
    `מ-${s(v, 'oldWhen')}\n` +
    `ל-${s(v, 'newWhen')}\n` +
    (s(v, 'note') ? `\n${s(v, 'note')}\n` : '') +
    `\nנתראה!`,

  /** The system never issues a receipt; it only reminds Ilanit to. */
  receipts_due_ilanit: (v) =>
    `קבלות להוצאה 🧾\n${s(v, 'summary')}`,

  group_roster_ilanit: (v) =>
    `חיוב חודשי לקבוצת "${s(v, 'groupName')}" (${s(v, 'month')}) נוצר.\n` +
    `לרוסטר אישור התשלומים: ${s(v, 'rosterUrl')}`,
};

/** Renders a Hebrew message for the given template key + variables. */
export function renderTemplate(key: TemplateKey, vars: Record<string, string | number>): string {
  const builder = builders[key];
  if (!builder) throw new Error(`unknown template key: ${key}`);
  return builder(vars);
}
