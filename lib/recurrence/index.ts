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
import { nowIL, startOfDayIL, ilWeekday, toILDateStr, parseILDateTime } from '@/lib/time';
import {
  insertRecurringEvent,
  cancelEvent,
  type EventInput,
} from '@/lib/google-calendar';
import { and, eq, gte, inArray } from 'drizzle-orm';

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

const DAY_MS = 24 * 60 * 60 * 1000;

// Google RRULE weekday codes indexed by JS weekday (0 = Sunday).
const RRULE_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

/** Validates a HH:mm wall-clock string. */
function assertTime(startTime: string): void {
  if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(startTime)) {
    throw new Error(`invalid startTime (expected HH:mm): ${startTime}`);
  }
}

/**
 * Computes the UTC instants for every occurrence of `weekday`@`startTime`
 * (Asia/Jerusalem) from tomorrow through `horizonDays` forward, inclusive of
 * the horizon edge. Today is skipped so we never create a same-day recurring
 * lesson behind the current time.
 */
function occurrenceStarts(
  weekday: number,
  startTime: string,
  horizonDays: number,
): Date[] {
  const now = nowIL();
  const todayStart = startOfDayIL(now);
  const out: Date[] = [];
  for (let offset = 0; offset <= horizonDays; offset++) {
    const dayInstant = new Date(todayStart.getTime() + offset * DAY_MS);
    if (ilWeekday(dayInstant) !== weekday) continue;
    const dateStr = toILDateStr(dayInstant);
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
): Promise<{ count: number }> {
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

  return { count: lessonRows.length };
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
  if (lesson.googleEventId && !lesson.recurrenceId) {
    await cancelEvent(lesson.googleEventId);
  }
}
