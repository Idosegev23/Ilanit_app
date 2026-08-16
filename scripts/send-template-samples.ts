import { renderTemplate, type TemplateKey } from '@/lib/notifications/templates';
import { sendText } from '@/lib/whatsapp/provider';
import { env } from '@/lib/env';

/*
  One-off: WhatsApp Ilanit a sample of every LIVE notification template so she
  can review the wording in situ.

  Two deliberate choices:

  1. It calls sendText directly rather than notify(). notify() writes every send
     to the message log against a relatedId, and these are demos — they would
     show up as real correspondence in the app's history and could suppress a
     genuine message later via the idempotency check.

  2. Every sample is prefixed with a DEMO banner. Unprefixed, "נקבע שיעור חדש ✅
     תלמיד/ה: נועה לוי" is indistinguishable from a real booking, and the whole
     point of the app is that Ilanit acts on these.

  Collection templates (payment_*, group_billing_member, group_roster_ilanit)
  are excluded: COLLECTION_ENABLED is unset, so notify() silences them in
  production and they are not part of the live surface.

  Run: npx tsx scripts/send-template-samples.ts [--dry]
*/

const BANNER = '🧪 דוגמה בלבד — לא לפעולה';

interface Sample {
  key: TemplateKey;
  /** Who receives this in real life — shown in the demo banner. */
  audience: 'תלמיד/ה' | 'אילנית';
  when: string;
  vars: Record<string, string | number>;
}

const BOOKING_URL = 'https://ilanit-app.vercel.app/book';
const ACTION_URL = 'https://ilanit-app.vercel.app/a/demo-token';

const SAMPLES: Sample[] = [
  {
    key: 'booking_link_student',
    audience: 'תלמיד/ה',
    when: 'כששולחים לינק אישי לתיאום',
    vars: { studentName: 'נועה', bookingUrl: `${BOOKING_URL}/demo-token` },
  },
  {
    key: 'booking_approved_student',
    audience: 'תלמיד/ה',
    when: 'מיד אחרי שנקבע שיעור — זו ההודעה שתוקנה',
    vars: {
      studentName: 'נועה',
      datetime: 'יום ג׳, 5 באוגוסט 2026, 17:00',
      location: 'הרצל 12, רעננה',
      calendarUrl: 'https://calendar.google.com/…',
      cancelUrl: 'https://ilanit-app.vercel.app/c/demo-token',
    },
  },
  {
    key: 'booking_scheduled_ilanit',
    audience: 'אילנית',
    when: 'מיד אחרי שתלמיד/ה קובע/ת שיעור',
    vars: {
      studentName: 'נועה לוי',
      phone: '050-1234567',
      datetime: 'יום ג׳, 5 באוגוסט 2026, 17:00',
      price: 180,
      notes: 'מתקשה בשברים',
    },
  },
  {
    key: 'booking_cancelled_ilanit',
    audience: 'אילנית',
    when: 'כשתלמיד/ה מבטל/ת מועד',
    vars: {
      studentName: 'נועה לוי',
      phone: '050-1234567',
      datetime: 'יום ג׳, 5 באוגוסט 2026, 17:00',
    },
  },
  {
    key: 'booking_rejected_student',
    audience: 'תלמיד/ה',
    when: 'כשהמועד שהתבקש כבר לא זמין',
    vars: {
      studentName: 'נועה',
      datetime: 'יום ג׳, 5 באוגוסט 2026, 17:00',
      bookingUrl: BOOKING_URL,
    },
  },
  {
    key: 'lesson_replaced_student',
    audience: 'תלמיד/ה',
    when: 'כשמבטלים לתלמיד/ה שיעור קיים',
    vars: {
      studentName: 'נועה',
      datetime: 'יום ג׳, 5 באוגוסט 2026, 17:00',
      bookingUrl: BOOKING_URL,
    },
  },
  {
    key: 'standby_registered_student',
    audience: 'תלמיד/ה',
    when: 'כשנרשמים לרשימת המתנה',
    vars: {
      studentName: 'נועה',
      daysLabel: 'ימים ב׳ ו-ד׳',
      startTime: '16:00',
      endTime: '19:00',
    },
  },
  {
    key: 'standby_slot_ilanit',
    audience: 'אילנית',
    when: 'כשמתפנה מקום שמתאים למישהו ברשימת ההמתנה',
    vars: {
      datetime: 'יום ד׳, 6 באוגוסט 2026, 16:00',
      count: 3,
      actionUrl: 'https://ilanit-app.vercel.app/s/demo-token',
    },
  },
  {
    key: 'reminder_day_before_individual',
    audience: 'תלמיד/ה',
    when: 'יום לפני שיעור פרטי',
    vars: {
      studentName: 'נועה',
      datetime: 'יום ג׳, 5 באוגוסט 2026, 17:00',
      location: 'הרצל 12, רעננה',
    },
  },
  {
    key: 'reminder_day_before_group',
    audience: 'תלמיד/ה',
    when: 'יום לפני מפגש קבוצה',
    vars: {
      studentName: 'נועה',
      groupName: 'מתמטיקה ז׳',
      datetime: 'יום ד׳, 6 באוגוסט 2026, 18:00',
      location: 'הרצל 12, רעננה',
    },
  },
  {
    key: 'reminder_day_before_ilanit',
    audience: 'אילנית',
    when: 'כל ערב — סיכום שיעורי מחר',
    vars: {
      date: '5 באוגוסט 2026',
      summary:
        '17:00 — נועה לוי (פרטי)\n18:00 — מתמטיקה ז׳ (קבוצה, 6 תלמידים)\n19:30 — יובל כהן (פרטי)',
    },
  },
  {
    key: 'assign_student_ilanit',
    audience: 'אילנית',
    when: 'כשנמצא אירוע ביומן שלא זוהה',
    vars: {
      eventTitle: 'שיעור פרטי',
      datetime: 'יום ה׳, 7 באוגוסט 2026, 16:30',
      actionUrl: ACTION_URL,
    },
  },
];

function frame(sample: Sample, index: number, total: number): string {
  return (
    `${BANNER}  (${index}/${total})\n` +
    `נשלח אל: ${sample.audience}  ·  ${sample.when}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    renderTemplate(sample.key, sample.vars)
  );
}

async function main() {
  const dry = process.argv.includes('--dry');
  const to = env().ILANIT_PHONE;
  const total = SAMPLES.length;

  const intro =
    `${BANNER}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `שלחתי לך ${total} דוגמאות של ההודעות שהמערכת שולחת — כדי שתראי את הנוסח.\n` +
    `כל אחת מסומנת "דוגמה בלבד" בראש ההודעה. אין צורך לעשות איתן כלום, והלינקים בהן אינם אמיתיים.\n` +
    `ההודעה השנייה (שיעור מאושר) היא זו שעודכנה — קודם היא הבטיחה "ממתין לאישור", ועכשיו היא אומרת שהשיעור נקבע ואושר.`;

  const queue = [intro, ...SAMPLES.map((s, i) => frame(s, i + 1, total))];

  if (dry) {
    queue.forEach((body, i) => {
      console.log(`\n──────── [${i}] ────────\n${body}`);
    });
    console.log(`\n[dry] ${queue.length} messages would be sent to ${to}`);
    return;
  }

  let sent = 0;
  for (const [i, body] of queue.entries()) {
    const res = await sendText(to, body);
    if (res.ok) {
      sent++;
      console.log(`[${i}] sent  ${res.messageId ?? ''}`);
    } else {
      console.error(`[${i}] FAILED  ${res.error}`);
    }
    // GreenAPI throttles bursts; also keeps WhatsApp ordering stable.
    await new Promise((r) => setTimeout(r, 1200));
  }
  console.log(`\ndone: ${sent}/${queue.length} delivered to ${to}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[samples] failed:', err);
    process.exit(1);
  });
