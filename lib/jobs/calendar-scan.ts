import { db } from '@/lib/db';
import { lessons, payments, students, type Lesson } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { env } from '@/lib/env';
import { getSettings } from '@/lib/settings';
import { notify } from '@/lib/notifications/dispatch';
import { createActionToken } from '@/lib/tokens';
import { listEndedSince, type EndedEvent } from '@/lib/google-calendar';
import { nowIL, formatILDateTime } from '@/lib/time';

// (ב) Calendar scan. The Google Calendar is the source of truth for what
// actually happened. For every event that ENDED inside the scan window:
//   - Individual lesson → mark the matching lesson `completed`, open a
//     `payment(due)`, mint a payment action token, and ask Ilanit "paid?".
//   - Unmatched event → create a `needs_match` lesson and ask Ilanit to assign
//     a student (assign token).
//   - Group session → skipped entirely (billing is monthly, not per-session).
//
// Idempotent: events already represented by a lesson row with the same
// google_event_id are not re-processed (matched lessons are not re-completed,
// and we never create a second needs_match lesson for the same event).

/** Token TTLs (minutes). */
const PAYMENT_TOKEN_TTL_MIN = 60 * 24 * 14; // 14 days
const ASSIGN_TOKEN_TTL_MIN = 60 * 24 * 14;

export interface CalendarScanResult {
  completed: number;
  paymentPrompts: number;
  needsMatchCreated: number;
  groupSkipped: number;
  /** Non-teaching events skipped (Preply / all-day markers / personal). */
  nonTeachingSkipped: number;
}

function actionBase(): string {
  return env().NEXT_PUBLIC_APP_URL.replace(/\/+$/, '');
}

/**
 * True for an event that is NOT one of Ilanit's teaching lessons and must never
 * be imported:
 *   - anything mentioning "Preply" (the family's OWN online lessons), OR
 *   - an all-day event / marker (graduation parties, errands, day-markers).
 * The Preply check is case-insensitive across summary/description/location.
 */
/*
  Ilanit's own family appear in the same calendar: "גאי כדורסל", "פסנתר לביא".
  Every week the scan found them, could not attribute them to a student, and
  asked her who they belonged to. They are her children, so the answer never
  changes and the question is pure noise.

  Names are configurable (PERSONAL_EVENT_NAMES) and matched as WHOLE WORDS, not
  substrings: a filter that swallowed a real lesson would be a far worse fault
  than the prompt it removes, and it would fail silently.
*/
const DEFAULT_PERSONAL_NAMES = ['לביא', 'גאי'];

function personalNames(): string[] {
  const raw = process.env.PERSONAL_EVENT_NAMES;
  const list = raw ? raw.split(',') : DEFAULT_PERSONAL_NAMES;
  return list.map((n) => n.trim()).filter(Boolean);
}

/**
 * True when `name` appears in `text` as its own word.
 *
 * Hebrew has no \b, so a word edge is "not a Hebrew letter" — except that the
 * one-letter prefixes ו/ב/ל/ה/מ/ש/כ attach directly to a word, so "ולביא" is
 * still לביא. Allowing exactly one of those keeps "עידו ולביא" matching while
 * "לביאה" stays a different name.
 */
function mentionsName(text: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const notHebrew = '[^\\u0590-\\u05FF]';
  const start = `(^|${notHebrew})[\\u05D5\\u05D1\\u05DC\\u05D4\\u05DE\\u05E9\\u05DB]?`;
  return new RegExp(`${start}${escaped}($|${notHebrew})`).test(text);
}

export function isNonTeachingEvent(event: EndedEvent): boolean {
  if (event.allDay) return true;
  const haystack = `${event.summary ?? ''} ${event.description ?? ''} ${event.location ?? ''}`.toLowerCase();
  if (haystack.includes('preply')) return true;

  /*
    An event the app itself created carries its student in extendedPrivate, so
    it is a lesson whatever it is called — checked first, so a family name in a
    real lesson's title can never drop it.
  */
  if (event.studentId || event.groupId) return false;

  const title = `${event.summary ?? ''} ${event.description ?? ''}`;
  return personalNames().some((n) => mentionsName(title, n));
}

/**
 * Scans the calendar for events that ended in [sinceISO, untilISO) and drives
 * the post-lesson payment flow. `until` defaults to now.
 */
export async function runCalendarScan(
  sinceISO: string,
  untilISO?: string,
): Promise<CalendarScanResult> {
  const settings = await getSettings();
  const ilanitPhone = env().ILANIT_PHONE;
  const until = untilISO ?? nowIL().toISOString();

  const events: EndedEvent[] = await listEndedSince(sinceISO, until);

  const result: CalendarScanResult = {
    completed: 0,
    paymentPrompts: 0,
    needsMatchCreated: 0,
    groupSkipped: 0,
    nonTeachingSkipped: 0,
  };

  if (events.length === 0) return result;

  /*
    Matching an event back to the lesson that already represents it.

    A recurring series is ONE Google event: createSeries stamps every occurrence
    with the MASTER id. But listEndedSince asks for singleEvents, so Google
    returns INSTANCES, whose ids are `<master>_<utc timestamp>`. Looking up the
    instance id therefore never found the lesson, and the scan re-imported every
    recurring lesson that ended as a fresh copy with no price — which is where
    the phantom debts, the ₪0 payment requests and the missing "was it paid?"
    prompts all came from.

    So the master is derived from the instance, and the occurrence is identified
    by master + start. A keyed-by-id map alone cannot do this: fourteen lessons
    share one master, and building a Map from them keeps only the last.
  */
  const masterOf = (eventId: string) => eventId.split('_')[0];

  const lookupIds = [...new Set(events.flatMap((e) => [e.id, masterOf(e.id)]))];
  const existing = await db
    .select()
    .from(lessons)
    .where(inArray(lessons.googleEventId, lookupIds));

  const lessonByEventId = new Map<string, Lesson>();
  const lessonByMasterAndStart = new Map<string, Lesson>();
  for (const l of existing) {
    if (!l.googleEventId) continue;
    lessonByEventId.set(l.googleEventId, l);
    lessonByMasterAndStart.set(`${l.googleEventId}|${l.startsAt.toISOString()}`, l);
  }

  function findExistingLesson(event: EndedEvent): Lesson | undefined {
    if (event.startISO) {
      const byStart = lessonByMasterAndStart.get(
        `${masterOf(event.id)}|${new Date(event.startISO).toISOString()}`,
      );
      if (byStart) return byStart;
    }
    return lessonByEventId.get(event.id);
  }

  for (const event of events) {
    // Group sessions never trigger a payment prompt — mark + skip.
    if (event.type === 'group') {
      result.groupSkipped++;
      continue;
    }

    const matched = findExistingLesson(event);

    // Non-teaching events (Preply online lessons of the family, all-day markers
    // / personal events) are never imported — don't create a lesson, don't
    // prompt. The only exception is an event already represented by a lesson
    // row, which we still let fall through so an existing lesson isn't stranded.
    if (isNonTeachingEvent(event) && !matched) {
      result.nonTeachingSkipped++;
      continue;
    }

    if (matched) {
      // A lesson already exists for this event. Only act on still-open ones.
      if (matched.status !== 'confirmed' || matched.needsMatch) {
        // Already completed/needs_match/cancelled — nothing to do (idempotent).
        continue;
      }
      await completeAndPrompt(matched, event, settings.locationAddress, ilanitPhone);
      result.completed++;
      result.paymentPrompts++;
      continue;
    }

    // No lesson references this event. Try to resolve a student by attendee
    // email; if found we still treat it as an imported individual lesson with a
    // known student. Otherwise it becomes a needs_match lesson.
    const resolvedStudentId = event.studentId
      ? event.studentId
      : await resolveStudentByEmail(event.attendeeEmail);

    if (resolvedStudentId) {
      const created = await createImportedLesson(event, resolvedStudentId, settings, 'completed');
      await completeAndPrompt(created, event, settings.locationAddress, ilanitPhone);
      result.completed++;
      result.paymentPrompts++;
    } else {
      const created = await createImportedLesson(event, null, settings, 'completed', true);
      await promptAssign(created, event, ilanitPhone);
      result.needsMatchCreated++;
    }
  }

  return result;
}

/** Resolves an active student by their email, or null. */
async function resolveStudentByEmail(email?: string): Promise<string | null> {
  if (!email) return null;
  const rows = await db
    .select({ id: students.id })
    .from(students)
    .where(eq(students.email, email))
    .limit(1);
  return rows[0]?.id ?? null;
}

/**
 * Inserts a lesson imported from the calendar. `needsMatch` marks an event we
 * could not attribute to a student yet.
 */
async function createImportedLesson(
  event: EndedEvent,
  studentId: string | null,
  settings: Awaited<ReturnType<typeof getSettings>>,
  status: 'completed',
  needsMatch = false,
): Promise<Lesson> {
  const startsAt = deriveStart(event, settings.defaultDurationMin);
  const endsAt = new Date(event.endISO);
  // Store the calendar event's TITLE so imported lessons render with their real
  // name in /lessons (loadLessons falls back studentName ?? bookedByName) and so
  // the in-app assign dialog can suggest a student by matching the title.
  const title = event.summary?.trim() || null;
  const inserted = await db
    .insert(lessons)
    .values({
      type: 'individual',
      source: 'calendar_import',
      studentId: studentId ?? undefined,
      startsAt,
      endsAt,
      status,
      needsMatch,
      location: settings.locationAddress,
      googleEventId: event.id,
      bookedByName: title,
      notes: title,
    })
    .returning();
  return inserted[0];
}

/** Estimates a start time when only the end is known (fallback to duration). */
function deriveStart(event: EndedEvent, durationMin: number): Date {
  // Google tells us the start; the duration fallback is only for the rare
  // event that arrives without one.
  if (event.startISO) return new Date(event.startISO);
  const end = new Date(event.endISO);
  return new Date(end.getTime() - durationMin * 60 * 1000);
}

/**
 * Marks a confirmed lesson completed, opens a due payment if none exists, mints
 * a payment token and asks Ilanit whether it was paid.
 */
async function completeAndPrompt(
  lesson: Lesson,
  event: EndedEvent,
  fallbackLocation: string,
  ilanitPhone: string,
): Promise<void> {
  if (lesson.status !== 'completed') {
    await db
      .update(lessons)
      .set({ status: 'completed' })
      .where(eq(lessons.id, lesson.id));
  }

  const amount = lesson.price ?? 0;

  /*
    A lesson with no price is an exemption or an unpriced import — never a ₪0
    debt. Opening one produced a charge nobody owed, and then asked Ilanit
    "התקבל תשלום של ₪0?" and the parent "עבור השיעור: ₪0". The lesson is still
    marked completed above; it simply carries no charge.
  */
  if (amount <= 0) return;

  // Open exactly one payment per lesson (payments.lessonId is unique).
  const existingPayment = await db
    .select({ id: payments.id })
    .from(payments)
    .where(eq(payments.lessonId, lesson.id))
    .limit(1);
  if (existingPayment.length === 0) {
    await db.insert(payments).values({
      lessonId: lesson.id,
      status: 'due',
      amount,
    });
  }

  // Resolve the student's name for the message.
  let studentName = event.summary || 'תלמיד/ה';
  if (lesson.studentId) {
    const s = await db
      .select({ name: students.name })
      .from(students)
      .where(eq(students.id, lesson.studentId))
      .limit(1);
    if (s[0]) studentName = s[0].name;
  }

  const token = await createActionToken('payment', lesson.id, PAYMENT_TOKEN_TTL_MIN);
  const actionUrl = `${actionBase()}/p/${token}`;

  await notify(
    'payment_check_ilanit',
    ilanitPhone,
    {
      studentName,
      datetime: formatILDateTime(lesson.startsAt),
      amount,
      actionUrl,
    },
    `payment_check:${lesson.id}`,
    lesson.id,
  );
}

/** Creates an assign token and asks Ilanit to attribute the unmatched event. */
async function promptAssign(
  lesson: Lesson,
  event: EndedEvent,
  ilanitPhone: string,
): Promise<void> {
  const token = await createActionToken('assign_student', lesson.id, ASSIGN_TOKEN_TTL_MIN);
  const actionUrl = `${actionBase()}/m/${token}`;
  await notify(
    'assign_student_ilanit',
    ilanitPhone,
    {
      eventTitle: event.summary || '(ללא כותרת)',
      datetime: formatILDateTime(lesson.startsAt),
      actionUrl,
    },
    `assign:${lesson.id}`,
    lesson.id,
  );
}
