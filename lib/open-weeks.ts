import { db } from '@/lib/db';
import { openWeeks, type OpenWeek } from '@/db/schema';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { ilWeekday, toILDateStr, parseILDateTime } from '@/lib/time';

// Open-weeks: a week (Sunday→Saturday, Asia/Jerusalem) is bookable via personal
// links ONLY if a row exists for its Sunday `weekStart`. Weeks start CLOSED;
// Ilanit opens them manually. Recurring lessons & group sessions are NOT gated
// by this — they're auto-scheduled.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The Sunday (`yyyy-MM-dd`, Asia/Jerusalem) that starts the week containing the
 * given instant. Weeks run Sunday(0)→Saturday(6).
 */
export function weekStartOf(date: Date): string {
  const weekday = ilWeekday(date); // 0=Sun … 6=Sat
  // Anchor to 00:00 IL of the same calendar day, then step back `weekday` days.
  const dayStart = parseILDateTime(toILDateStr(date), '00:00');
  const sunday = new Date(dayStart.getTime() - weekday * MS_PER_DAY);
  return toILDateStr(sunday);
}

/** True if the week containing `date` is open for booking. */
export async function isWeekOpen(date: Date): Promise<boolean> {
  const weekStart = weekStartOf(date);
  const rows = await db
    .select({ id: openWeeks.id })
    .from(openWeeks)
    .where(eq(openWeeks.weekStart, weekStart))
    .limit(1);
  return rows.length > 0;
}

/**
 * Opens a week for booking (idempotent). `weekStartISO` must be a Sunday
 * `yyyy-MM-dd`; it is normalized to the week's Sunday defensively.
 */
export async function openWeek(weekStartISO: string): Promise<OpenWeek> {
  const weekStart = weekStartOf(parseILDateTime(weekStartISO, '00:00'));
  const existing = await db
    .select()
    .from(openWeeks)
    .where(eq(openWeeks.weekStart, weekStart))
    .limit(1);
  if (existing[0]) return existing[0];
  const inserted = await db
    .insert(openWeeks)
    .values({ weekStart })
    .onConflictDoNothing({ target: openWeeks.weekStart })
    .returning();
  if (inserted[0]) return inserted[0];
  // Lost a race: read back the row that won.
  const rows = await db
    .select()
    .from(openWeeks)
    .where(eq(openWeeks.weekStart, weekStart))
    .limit(1);
  return rows[0];
}

/** Closes a week for booking (idempotent — deleting a missing row is a no-op). */
export async function closeWeek(weekStartISO: string): Promise<void> {
  const weekStart = weekStartOf(parseILDateTime(weekStartISO, '00:00'));
  await db.delete(openWeeks).where(eq(openWeeks.weekStart, weekStart));
}

/**
 * The Sunday `weekStart` strings that are open within [fromISO, toISO]
 * (inclusive `yyyy-MM-dd` dates), ordered ascending.
 */
export async function listOpenWeeks(fromISO: string, toISO: string): Promise<string[]> {
  const fromWeek = weekStartOf(parseILDateTime(fromISO, '00:00'));
  const toWeek = weekStartOf(parseILDateTime(toISO, '00:00'));
  const rows = await db
    .select({ weekStart: openWeeks.weekStart })
    .from(openWeeks)
    .where(and(gte(openWeeks.weekStart, fromWeek), lte(openWeeks.weekStart, toWeek)))
    .orderBy(asc(openWeeks.weekStart));
  return rows.map((r) => r.weekStart);
}
