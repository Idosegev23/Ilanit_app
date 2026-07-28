import { db } from '@/lib/db';
import { lessons } from '@/db/schema';
import { and, eq, gte, inArray, isNotNull, isNull, lte } from 'drizzle-orm';
import { getEvent } from '@/lib/google-calendar';
import { offerFreedSlot } from '@/lib/standby';
import { nowIL } from '@/lib/time';

// Reconcile lessons Ilanit cancelled DIRECTLY in Google Calendar. The DB is the
// authority for "busy", so a confirmed lesson keeps blocking its slot until
// something writes it back. This forward-looking pass checks each FUTURE
// standalone lesson's Google event; when the event is gone (deleted → 404/410),
// the lesson is marked 'cancelled' so its slot frees for new bookings.
//
// Scoped to STANDALONE lessons (recurrenceId IS NULL): recurring-series
// occurrences all share one master googleEventId, so getEvent(master) can't
// reveal a single deleted occurrence — those are intentionally left to the
// in-app cancel path. Transient Google errors (getEvent throws) are IGNORED —
// we only ever cancel on a definitive 404/410, never on an error.

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const HORIZON_DAYS = 60;
const MAX_PER_RUN = 200;

export interface ReconcileResult {
  checked: number;
  cancelled: number;
}

export async function reconcileCancellations(): Promise<ReconcileResult> {
  const now = nowIL();
  const horizon = new Date(now.getTime() + HORIZON_DAYS * MS_PER_DAY);

  const rows = await db
    .select({
      id: lessons.id,
      googleEventId: lessons.googleEventId,
      startsAt: lessons.startsAt,
      endsAt: lessons.endsAt,
    })
    .from(lessons)
    .where(
      and(
        inArray(lessons.status, ['pending', 'confirmed']),
        isNotNull(lessons.googleEventId),
        isNull(lessons.recurrenceId),
        gte(lessons.startsAt, now),
        lte(lessons.startsAt, horizon),
      ),
    )
    .limit(MAX_PER_RUN);

  let cancelled = 0;
  for (const row of rows) {
    if (!row.googleEventId) continue;
    let gone = false;
    try {
      gone = (await getEvent(row.googleEventId)) === null; // null = 404/410 (deleted)
    } catch {
      // Transient Google error — never treat as deleted.
      continue;
    }
    if (!gone) continue;
    await db
      .update(lessons)
      .set({ status: 'cancelled', cancelledAt: nowIL(), cancelReason: 'google_deleted' })
      .where(eq(lessons.id, row.id));
    cancelled += 1;
    // The slot is now free — alert the waitlist if anyone matches it.
    await offerFreedSlot(row.startsAt, row.endsAt);
  }

  return { checked: rows.length, cancelled };
}
