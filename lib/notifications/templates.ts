import { formatShekels } from '@/lib/utils';

// Type-aware Hebrew message templates. Keys cover the full notification surface
// of the system (individual lessons + learning groups). Variables are passed in
// and interpolated; templates never call external services.

export type TemplateKey =
  | 'booking_link_student'
  | 'booking_pending_student'
  | 'booking_pending_ilanit'
  | 'booking_approved_student'
  | 'booking_rejected_student'
  | 'reminder_day_before_individual'
  | 'reminder_day_before_group'
  | 'reminder_day_before_ilanit'
  | 'payment_check_ilanit'
  | 'payment_request_individual'
  | 'payment_request_group'
  | 'payment_followup_ilanit'
  | 'assign_student_ilanit'
  | 'group_billing_member'
  | 'group_roster_ilanit';

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
    `נעדכן אותך ברגע שהשיעור יאושר.`,

  booking_pending_ilanit: (v) =>
    `בקשת שיעור חדשה 📩\n` +
    `תלמיד/ה: ${s(v, 'studentName')} (${s(v, 'phone')})\n` +
    `מתי: ${s(v, 'datetime')}\n` +
    `מחיר: ${money(v, 'price')}\n` +
    (s(v, 'notes') ? `הערות: ${s(v, 'notes')}\n` : '') +
    `לאישור או דחייה: ${s(v, 'actionUrl')}`,

  booking_approved_student: (v) =>
    `מצוין ${s(v, 'studentName')}! ✅\n` +
    `השיעור שלך אושר ל-${s(v, 'datetime')}.\n` +
    `כתובת: ${s(v, 'location')}\n` +
    (s(v, 'calendarUrl') ? `הוספה ליומן: ${s(v, 'calendarUrl')}\n` : '') +
    `נתראה!`,

  booking_rejected_student: (v) =>
    `שלום ${s(v, 'studentName')}, מצטערים — המועד שביקשת (${s(v, 'datetime')}) לא זמין.\n` +
    `אפשר לקבוע מועד אחר כאן: ${s(v, 'bookingUrl')}`,

  reminder_day_before_individual: (v) =>
    `תזכורת 📚 שלום ${s(v, 'studentName')}!\n` +
    `מחר יש לך שיעור ב-${s(v, 'datetime')}.\n` +
    `כתובת: ${s(v, 'location')}\n` +
    `נתראה!`,

  reminder_day_before_group: (v) =>
    `תזכורת 👥 שלום ${s(v, 'studentName')}!\n` +
    `מחר יש מפגש של קבוצת "${s(v, 'groupName')}" ב-${s(v, 'datetime')}.\n` +
    `כתובת: ${s(v, 'location')}\n` +
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
