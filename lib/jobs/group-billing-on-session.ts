import { db } from '@/lib/db';
import { groups, lessons, groupBilling } from '@/db/schema';
import { and, asc, eq, gte, lt, notInArray } from 'drizzle-orm';
import { generateMonthlyBilling } from '@/lib/groups';
import { nowIL, toILDateStr, parseILDateTime } from '@/lib/time';

/*
  Group billing, triggered by the group's OWN first session of the month.

  It used to fire for every group at once on the 1st. That produced the worst
  bill this system has sent: «מתמטיקה עולות לז'» was charged ₪650 for August and
  again for September, two months in which it did not meet even once, because
  the calendar date knows nothing about whether the group ran.

  Tying the charge to the first session fixes both ends of that. A group that
  meets is billed the moment it meets — which is also when a parent expects to
  be asked — and a group that does not meet is never billed at all, without
  anyone having to remember to switch it off.

  Runs on the hourly tick and is idempotent: `generateMonthlyBilling` skips any
  member who already has a row for that group and month.
*/

export interface GroupBillingOnSessionResult {
  /** Group names billed on this run. */
  billed: string[];
  created: number;
}

/** First-of-month `yyyy-MM-dd` for the IL month containing `at`. */
function monthStartISO(at: Date): string {
  return `${toILDateStr(at).slice(0, 7)}-01`;
}

/** First-of-month `yyyy-MM-dd` for the month AFTER the one containing `at`. */
function nextMonthStartISO(at: Date): string {
  const [y, m] = toILDateStr(at).split('-').map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

export async function runGroupBillingOnFirstSession(): Promise<GroupBillingOnSessionResult> {
  const now = nowIL();
  const month = monthStartISO(now);
  const windowStart = parseILDateTime(month, '00:00');
  const windowEnd = parseILDateTime(nextMonthStartISO(now), '00:00');

  const active = await db.select().from(groups).where(eq(groups.active, true));
  const result: GroupBillingOnSessionResult = { billed: [], created: 0 };

  for (const group of active) {
    // Already billed for this month — nothing to do, and no message to resend.
    const existing = await db
      .select({ id: groupBilling.id })
      .from(groupBilling)
      .where(and(eq(groupBilling.groupId, group.id), eq(groupBilling.month, month)))
      .limit(1);
    if (existing[0]) continue;

    /*
      A cancelled or rejected session is not the group meeting, so it must not
      trigger the charge — otherwise calling off the first session of the month
      would bill everyone for it.
    */
    const first = await db
      .select({ startsAt: lessons.startsAt })
      .from(lessons)
      .where(
        and(
          eq(lessons.groupId, group.id),
          eq(lessons.type, 'group_session'),
          gte(lessons.startsAt, windowStart),
          lt(lessons.startsAt, windowEnd),
          notInArray(lessons.status, ['cancelled', 'rejected']),
        ),
      )
      .orderBy(asc(lessons.startsAt))
      .limit(1);

    const startsAt = first[0]?.startsAt;
    // No session this month yet, or it has not begun — ask again next hour.
    if (!startsAt || startsAt > now) continue;

    const { created } = await generateMonthlyBilling(month, [group.id]);
    if (created > 0) {
      result.billed.push(group.name);
      result.created += created;
    }
  }

  return result;
}
