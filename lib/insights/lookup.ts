import { db } from '@/lib/db';
import { students, lessons, payments } from '@/db/schema';
import { and, asc, eq, gte, lt } from 'drizzle-orm';
import { formatILDateTime } from '@/lib/time';
import { openDebts } from '@/lib/payments';

/*
  Read-only lookups for the assistant.

  Ilanit asks questions in WhatsApp, not in the app, so the bot needs to answer
  "how many lessons did Imri have in August" and "how much does he owe" without
  her opening anything. Deliberately read-only: the assistant can report, never
  bill, settle or cancel.
*/

/** Case- and space-insensitive, so a half-typed name still matches. */
function norm(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, ' ');
}

export interface StudentSummary {
  studentId: string;
  name: string;
  phone: string | null;
  defaultPrice: number | null;
  lessons: Array<{ when: string; status: string; price: number | null }>;
  lessonCount: number;
  paidTotal: number;
  dueTotal: number;
  dueCount: number;
}

/**
 * One student's activity, optionally narrowed to a month (`YYYY-MM`).
 *
 * Matches on a name fragment because Ilanit types how she speaks — "אימרי",
 * not the full record name. Several matches are returned to the caller rather
 * than resolved here, so the assistant can ask instead of guessing.
 */
export async function studentSummary(
  nameQuery: string,
  month?: string,
): Promise<{ matches: string[]; summary?: StudentSummary }> {
  const q = norm(nameQuery);
  if (!q) return { matches: [] };

  const all = await db.select().from(students).where(eq(students.archived, false));
  const hits = all.filter((s) => norm(s.name).includes(q));
  if (hits.length === 0) return { matches: [] };
  if (hits.length > 1) return { matches: hits.map((s) => s.name) };

  const student = hits[0];

  let from: Date | undefined;
  let to: Date | undefined;
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split('-').map(Number);
    from = new Date(y, m - 1, 1);
    to = new Date(y, m, 1);
  }

  const rows = await db
    .select({ lesson: lessons, pay: payments })
    .from(lessons)
    .leftJoin(payments, eq(payments.lessonId, lessons.id))
    .where(
      from && to
        ? and(eq(lessons.studentId, student.id), gte(lessons.startsAt, from), lt(lessons.startsAt, to))
        : eq(lessons.studentId, student.id),
    )
    .orderBy(asc(lessons.startsAt));

  let paidTotal = 0;
  let dueTotal = 0;
  let dueCount = 0;
  for (const { pay } of rows) {
    if (!pay) continue;
    if (pay.status === 'paid') paidTotal += pay.amount;
    else if (pay.status === 'due') {
      dueTotal += pay.amount;
      dueCount++;
    }
  }

  return {
    matches: [student.name],
    summary: {
      studentId: student.id,
      name: student.name,
      phone: student.phone,
      defaultPrice: student.defaultPrice,
      lessons: rows.map(({ lesson }) => ({
        when: formatILDateTime(lesson.startsAt),
        status: lesson.status,
        price: lesson.price,
      })),
      lessonCount: rows.length,
      paidTotal,
      dueTotal,
      dueCount,
    },
  };
}

export interface DebtsOverview {
  totalAmount: number;
  students: Array<{ name: string; amount: number; count: number }>;
}

/** Everyone who currently owes, biggest first. */
export async function debtsOverview(): Promise<DebtsOverview> {
  const debts = await openDebts();
  return {
    totalAmount: debts.reduce((n, d) => n + d.amount, 0),
    students: debts.map((d) => ({ name: d.studentName, amount: d.amount, count: d.count })),
  };
}
