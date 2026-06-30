// Recurrence engine (module B7). createSeries persists a recurrences template,
// generates the forward lessons (individual) or group_session lessons within the
// horizon, and registers a single Google recurring event. cancelSeries tears
// down a whole series; cancelOne cancels a single occurrence.

import { db } from '@/lib/db';
import {
  recurrences,
  lessons,
  groups,
  type Group,
} from '@/db/schema';
import { getStudent } from '@/lib/students';
import { getSettings } from '@/lib/settings';
import { nowIL, toILDateStr, parseILDateTime } from '@/lib/time';
import {
  insertRecurringEvent,
  cancelEvent,
  type EventInput,
} from '@/lib/google-calendar';
import { and, eq, gte, inArray } from 'drizzle-orm';
import { addDays } from 'date-fns';

export interface CreateSeriesInput {
  kind: 'individual' | 'group';
  studentId?: string;
  groupId?: string;
  weekday: number; // 0 = Sunday … 6 = Saturday
  startTime: string; // HH:mm (Asia/Jerusalem wall clock)
  durationMin: number;
  price?: number; // ₪ snapshot override
  horizonDays: number; // generate occurrences this many days forward
}

// Google RRULE weekday codes indexed by JS weekday (0 = Sunday).
const RRULE_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

/** Weekday (0=Sunday … 6=Saturday) of a calendar `yyyy-MM-dd` string. */
function weekdayOfDateStr(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  // Date.UTC avoids any host-timezone interpretation of the calendar date.
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Adds `days` calendar days to a `yyyy-MM-dd` string, returning a new one. */
function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const next = addDays(new Date(Date.UTC(y, m - 1, d)), days);
  const yy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(next.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Validates a HH:mm wall-clock string. */
function assertTime(startTime: string): void {
  if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(startTime)) {
    throw new Error(`invalid startTime (expected HH:mm): ${startTime}`);
  }
}

/**
 * Computes the UTC instants for every occurrence of `weekday`@`startTime`
 * (Asia/Jerusalem) from today through `horizonDays` forward, inclusive of the
 * horizon edge. Occurrences already started (e.g. earlier today) are skipped.
 *
 * The day cursor is stepped via calendar-date arithmetic (`yyyy-MM-dd` strings),
 * NOT by adding a fixed 24h to a midnight instant. Across an Asia/Jerusalem DST
 * transition a fixed-24h step drifts off the wall-clock day boundary, which can
 * enumerate the same calendar date twice (duplicate lessons + inflated RRULE
 * COUNT at fall-back) or skip a matching weekday entirely (dropped occurrence at
 * spring-forward). Each calendar date is then re-zoned to its wall-clock start
 * instant, so the day boundary stays correct on both sides of any transition.
 */
function occurrenceStarts(
  weekday: number,
  startTime: string,
  horizonDays: number,
): Date[] {
  const now = nowIL();
  const startDateStr = toILDateStr(now);
  const out: Date[] = [];
  const seen = new Set<string>();
  for (let offset = 0; offset <= horizonDays; offset++) {
    const dateStr = addDaysToDateStr(startDateStr, offset);
    if (weekdayOfDateStr(dateStr) !== weekday) continue;
    // De-dupe defensively: never enumerate the same calendar date twice.
    if (seen.has(dateStr)) continue;
    seen.add(dateStr);
    const startsAt = parseILDateTime(dateStr, startTime);
    // Skip occurrences that have already started (e.g. earlier today).
    if (startsAt.getTime() <= now.getTime()) continue;
    out.push(startsAt);
  }
  return out;
}

/**
 * Creates a recurring series: persists the recurrences template row, generates
 * the forward confirmed lessons, and registers one Google recurring event.
 * Returns the number of generated lessons.
 */
export async function createSeries(
  input: CreateSeriesInput,
): Promise<{ count: number; firstStartsAt?: Date }> {
  const { kind, weekday, startTime, durationMin, horizonDays } = input;

  if (weekday < 0 || weekday > 6 || !Number.isInteger(weekday)) {
    throw new Error(`invalid weekday (expected 0-6): ${weekday}`);
  }
  assertTime(startTime);
  if (!Number.isInteger(durationMin) || durationMin <= 0) {
    throw new Error(`invalid durationMin: ${durationMin}`);
  }
  if (!Number.isInteger(horizonDays) || horizonDays <= 0) {
    throw new Error(`invalid horizonDays: ${horizonDays}`);
  }
  // Money = integer shekels (no agorot/decimals). Guard the optional override
  // here too so any caller (server action / API) cannot persist a fractional ₪.
  if (input.price !== undefined && (!Number.isInteger(input.price) || input.price < 0)) {
    throw new Error(`invalid price (expected non-negative integer shekels): ${input.price}`);
  }

  const settings = await getSettings();

  let studentName: string | undefined;
  let attendeeEmail: string | undefined;
  let group: Group | undefined;
  let price: number | null = null;
  let location: string | null = settings.locationAddress || null;
  let summary: string;

  if (kind === 'individual') {
    if (!input.studentId) throw new Error('studentId is required for an individual series');
    const student = await getStudent(input.studentId);
    if (!student) throw new Error(`student not found: ${input.studentId}`);
    studentName = student.name;
    attendeeEmail = student.email ?? undefined;
    price = input.price ?? student.defaultPrice ?? null;
    summary = `שיעור – ${student.name}`;
  } else {
    if (!input.groupId) throw new Error('groupId is required for a group series');
    const groupRows = await db
      .select()
      .from(groups)
      .where(eq(groups.id, input.groupId))
      .limit(1);
    group = groupRows[0];
    if (!group) throw new Error(`group not found: ${input.groupId}`);
    // Monthly group billing handles money; the lesson price snapshot is not used.
    price = input.price ?? null;
    location = group.location || location;
    summary = `קבוצה – ${group.name}`;
  }

  // Persist the recurrence template.
  const insertedRecurrence = await db
    .insert(recurrences)
    .values({
      kind,
      studentId: kind === 'individual' ? input.studentId : null,
      groupId: kind === 'group' ? input.groupId : null,
      weekday,
      startTime,
      durationMin,
      price,
      active: true,
    })
    .returning();
  const recurrence = insertedRecurrence[0];

  const starts = occurrenceStarts(weekday, startTime, horizonDays);

  // Register a single Google recurring event anchored on the first occurrence.
  let googleEventId: string | null = null;
  if (starts.length > 0) {
    const firstStart = starts[0];
    const firstEnd = new Date(firstStart.getTime() + durationMin * 60 * 1000);
    const eventInput: EventInput = {
      summary,
      startISO: firstStart.toISOString(),
      endISO: firstEnd.toISOString(),
      location: location ?? undefined,
      attendeeEmail,
      extendedPrivate: {
        type: kind === 'group' ? 'group' : 'individual',
        recurrenceId: recurrence.id,
        ...(kind === 'individual' && input.studentId ? { studentId: input.studentId } : {}),
        ...(kind === 'group' && input.groupId ? { groupId: input.groupId } : {}),
      },
    };
    const rrule = `RRULE:FREQ=WEEKLY;BYDAY=${RRULE_DAYS[weekday]};COUNT=${starts.length}`;
    const evt = await insertRecurringEvent(eventInput, rrule);
    googleEventId = evt.id;
  }

  // Generate the forward lessons. Group sessions never trigger payment checks
  // (billing is monthly), individual lessons carry a price snapshot.
  const lessonRows = starts.map((startsAt) => ({
    type: (kind === 'group' ? 'group_session' : 'individual') as
      | 'individual'
      | 'group_session',
    source: 'recurrence' as const,
    studentId: kind === 'individual' ? (input.studentId ?? null) : null,
    groupId: kind === 'group' ? (input.groupId ?? null) : null,
    startsAt,
    endsAt: new Date(startsAt.getTime() + durationMin * 60 * 1000),
    status: 'confirmed' as const,
    needsMatch: false,
    price,
    location,
    googleEventId,
    recurrenceId: recurrence.id,
    confirmedAt: nowIL(),
  }));

  if (lessonRows.length > 0) {
    await db.insert(lessons).values(lessonRows);
  }

  return { count: lessonRows.length, firstStartsAt: lessonRows[0]?.startsAt };
}

/**
 * Cancels an entire series: deactivates the recurrence template, cancels every
 * future (pending/confirmed) lesson in the series, and removes the Google
 * recurring event. Past/completed lessons are left untouched.
 */
export async function cancelSeries(recurrenceId: string): Promise<void> {
  const now = nowIL();

  const future = await db
    .select()
    .from(lessons)
    .where(
      and(
        eq(lessons.recurrenceId, recurrenceId),
        gte(lessons.startsAt, now),
        inArray(lessons.status, ['pending', 'confirmed']),
      ),
    );

  const googleEventIds = Array.from(
    new Set(future.map((l) => l.googleEventId).filter((x): x is string => !!x)),
  );

  if (future.length > 0) {
    await db
      .update(lessons)
      .set({ status: 'cancelled', cancelledAt: now, cancelReason: 'series_cancelled' })
      .where(
        and(
          eq(lessons.recurrenceId, recurrenceId),
          gte(lessons.startsAt, now),
          inArray(lessons.status, ['pending', 'confirmed']),
        ),
      );
  }

  await db.update(recurrences).set({ active: false }).where(eq(recurrences.id, recurrenceId));

  for (const eventId of googleEventIds) {
    await cancelEvent(eventId);
  }
}

/**
 * Cancels a single lesson occurrence and removes its Google event. Used both
 * for one-off lessons and for a single instance of a recurring series.
 */
export async function cancelOne(lessonId: string): Promise<void> {
  const now = nowIL();
  const rows = await db.select().from(lessons).where(eq(lessons.id, lessonId)).limit(1);
  const lesson = rows[0];
  if (!lesson) throw new Error(`lesson not found: ${lessonId}`);

  await db
    .update(lessons)
    .set({ status: 'cancelled', cancelledAt: now, cancelReason: 'cancelled' })
    .where(eq(lessons.id, lessonId));

  // Only remove the Google event for standalone lessons. A recurring-series
  // instance shares the master recurring event with its siblings, so deleting
  // it would wipe the whole series — cancelSeries handles that case instead.
  //
  // KNOWN LIMITATION (spec §5.6 single-instance cancel): when this lesson
  // belongs to a series (recurrenceId set), the system row is marked cancelled
  // but the matching occurrence is NOT removed from Google Calendar, because the
  // lib/google-calendar contract only exposes cancelEvent(eventId) for the whole
  // event — there is no instance-level (EXDATE / per-occurrence) cancel. The
  // cancelled occurrence therefore still shows in Google Calendar, diverging
  // from system state. Closing this gap requires adding instance cancellation to
  // the lib/google-calendar contract (foundation/B1); see REPORT blockers.
  if (lesson.googleEventId && !lesson.recurrenceId) {
    await cancelEvent(lesson.googleEventId);
  }
}
