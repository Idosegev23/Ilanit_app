'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { lessons } from '@/db/schema';
import { normalizePhoneIL } from '@/lib/utils';
import {
  createStudent,
  updateStudent,
  findStudentByPhone,
  findStudentsByContactPhone,
  findStudentsByNormalizedName,
  describeFamily,
  siblingFieldsFor,
  getStudent,
} from '@/lib/students';
import { getSettings } from '@/lib/settings';
import { nowIL, parseILDateTime, formatILDateTime } from '@/lib/time';
import { insertEvent } from '@/lib/google-calendar';
import { hasSlotConflict, overlappingLessons, type OverlappingLesson } from '@/lib/availability';
import { createSeries } from '@/lib/recurrence';
import { notifyStudent } from '@/lib/notifications/dispatch';
import { addToCalendarUrl } from '@/lib/calendar-link';
import { createCancelUrl } from '@/lib/availability/cancel';

// Server actions for the Students UI. The directory + client-file pages stay
// server components and post through here. Money is integer shekels; phones are
// normalized to E.164 before persisting (matching the booking-link flow).
//
// Each action returns a small { ok, error?, id? } result so the client form can
// surface inline errors without throwing.

export interface StudentActionResult {
  ok: boolean;
  error?: string;
  id?: string;
  /**
   * Set when the number typed already belongs to a family. Siblings share one
   * parent's phone, so this is far more often "another child of the same
   * mother" than a mistake — and the caller is offered the sibling path
   * instead of a dead end.
   */
  sameNumberAs?: { names: string[]; guardianName: string | null };
}

async function requireOwner(): Promise<boolean> {
  const session = await auth();
  return Boolean(session?.user);
}

function str(form: FormData, key: string): string {
  return String(form.get(key) ?? '').trim();
}

/**
 * Parses an optional integer-shekel money field. Empty → null (no default
 * price configured). Rejects negatives / non-numeric input.
 */
function optionalIntShekels(form: FormData, key: string): number | null | undefined {
  const raw = str(form, key);
  if (raw === '') return null;
  const cleaned = raw.replace(/[^\d-]/g, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return undefined; // signals invalid
  return Math.round(n);
}

/** Parses an optional positive duration in minutes. Empty/invalid → fallback. */
function durationMin(form: FormData, key: string, fallback: number): number {
  const raw = str(form, key).replace(/[^\d]/g, '');
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.round(n);
}

/**
 * Day-of-month a family may first be asked for money, or null for no limit.
 * Capped at 28 so it exists in February too.
 */
function collectDay(form: FormData): number | null {
  const raw = str(form, 'collectFromDay').trim();
  if (!raw) return null;
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n < 1 || n > 28) return null;
  return n;
}

export async function createStudentAction(form: FormData): Promise<StudentActionResult> {
  if (!(await requireOwner())) return { ok: false, error: 'אין הרשאה' };

  const name = str(form, 'name');
  if (!name) return { ok: false, error: 'יש להזין שם' };

  const phoneRaw = str(form, 'phone');
  if (!phoneRaw) return { ok: false, error: 'יש להזין מספר טלפון' };

  let phone: string;
  try {
    phone = normalizePhoneIL(phoneRaw);
  } catch {
    return { ok: false, error: 'מספר טלפון לא תקין' };
  }

  /*
    A number already in the roster is usually a SIBLING, not a duplicate: one
    mother, several children, one phone. `students.phone` is unique, so a family
    is modelled with the first child holding the number and the rest carrying it
    as `guardianPhone` — which is how the רשף and בישלה families already sit in
    the roster.

    So a match is not an error on its own. It is an error only until Ilanit says
    which of the two it is, and `addAsSibling` is her answer.
  */
  const addAsSibling = str(form, 'addAsSibling') === 'on';
  const family = await findStudentsByContactPhone(phone);

  if (family.length > 0 && !addAsSibling) {
    return {
      ok: false,
      error: `המספר הזה כבר רשום ל${family.map((f) => f.name).join(', ')}`,
      sameNumberAs: describeFamily(family),
    };
  }

  if (addAsSibling && family.length === 0) {
    // Nothing to be a sibling of — fall through and create normally rather
    // than silently filing the number in the wrong column.
  }

  /*
    The same-name guard still applies, sibling or not: the duplicate we actually
    cleaned up on 17/08 was one child entered twice, and "add as sibling" must
    not become a way past that.
  */
  const sameName = await findStudentsByNormalizedName(name);
  if (sameName.length > 0) {
    return { ok: false, error: `כבר קיימת רשומה בשם "${sameName[0].name}"` };
  }

  const price = optionalIntShekels(form, 'defaultPrice');
  if (price === undefined) return { ok: false, error: 'מחיר לא תקין' };

  const email = str(form, 'email') || null;
  const notes = str(form, 'notes') || null;

  // Guardian (parent) contact — recommended for children. When present, all
  // outbound WhatsApp for this student routes to the guardian (contactPhoneFor).
  const guardianName = str(form, 'guardianName') || null;
  let guardianPhone: string | null = null;
  const guardianPhoneRaw = str(form, 'guardianPhone');
  if (guardianPhoneRaw) {
    try {
      guardianPhone = normalizePhoneIL(guardianPhoneRaw);
    } catch {
      return { ok: false, error: 'מספר טלפון הורה לא תקין' };
    }
  }

  const receiptLabel = str(form, 'receiptLabel') || null;

  try {
    /*
      A sibling does not hold the shared number: `students.phone` is unique, so
      only one child in a family can carry it and everyone else is reached
      through `guardianPhone`. Storing it in both places would be rejected by
      the index — and would make the family unreadable besides.
    */
    const isSibling = addAsSibling && family.length > 0;
    const sibling = isSibling ? siblingFieldsFor(phone, family) : null;
    const student = await createStudent({
      name,
      phone: sibling ? sibling.phone : phone,
      email,
      guardianName: guardianName ?? sibling?.guardianName ?? null,
      guardianPhone: sibling ? sibling.guardianPhone : guardianPhone,
      receiptLabel,
      defaultPrice: price,
      defaultDurationMin: durationMin(form, 'defaultDurationMin', 60),
      notes,
      autoCollect: str(form, 'manualBilling') !== 'on',
      collectFromDay: collectDay(form),
    });
    revalidatePath('/students');
    return { ok: true, id: student.id };
  } catch (err) {
    console.error('[students] create failed:', err);
    return { ok: false, error: 'שמירת התלמיד נכשלה' };
  }
}

export async function updateStudentAction(form: FormData): Promise<StudentActionResult> {
  if (!(await requireOwner())) return { ok: false, error: 'אין הרשאה' };

  const id = str(form, 'id');
  if (!id) return { ok: false, error: 'מזהה תלמיד חסר' };

  const current = await getStudent(id);
  if (!current) return { ok: false, error: 'התלמיד לא נמצא' };

  const name = str(form, 'name');
  if (!name) return { ok: false, error: 'יש להזין שם' };

  const phoneRaw = str(form, 'phone');
  if (!phoneRaw) return { ok: false, error: 'יש להזין מספר טלפון' };

  let phone: string;
  try {
    phone = normalizePhoneIL(phoneRaw);
  } catch {
    return { ok: false, error: 'מספר טלפון לא תקין' };
  }

  // If the phone changed, make sure it isn't taken by a different student.
  if (phone !== current.phone) {
    const clash = await findStudentByPhone(phone);
    if (clash && clash.id !== id) {
      return { ok: false, error: 'כבר קיים תלמיד עם מספר טלפון זה' };
    }
  }

  const price = optionalIntShekels(form, 'defaultPrice');
  if (price === undefined) return { ok: false, error: 'מחיר לא תקין' };

  // Guardian (parent) contact — when present, all outbound WhatsApp for this
  // student routes to the guardian (contactPhoneFor).
  let guardianPhone: string | null = null;
  const guardianPhoneRaw = str(form, 'guardianPhone');
  if (guardianPhoneRaw) {
    try {
      guardianPhone = normalizePhoneIL(guardianPhoneRaw);
    } catch {
      return { ok: false, error: 'מספר טלפון הורה לא תקין' };
    }
  }

  try {
    await updateStudent(id, {
      name,
      phone,
      email: str(form, 'email') || null,
      guardianName: str(form, 'guardianName') || null,
      guardianPhone,
      receiptLabel: str(form, 'receiptLabel') || null,
      defaultPrice: price,
      defaultDurationMin: durationMin(form, 'defaultDurationMin', current.defaultDurationMin),
      notes: str(form, 'notes') || null,
      archived: str(form, 'archived') === 'on',
      // The checkbox asks the opposite question from the column it sets.
      autoCollect: str(form, 'manualBilling') !== 'on',
      collectFromDay: collectDay(form),
    });
    revalidatePath('/students');
    revalidatePath(`/students/${id}`);
    return { ok: true, id };
  } catch (err) {
    console.error('[students] update failed:', err);
    return { ok: false, error: 'עדכון התלמיד נכשל' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN scheduling — Ilanit adds/owns a student and SETS their lesson herself.
// This is the "she just sets it" path: lessons are created status='confirmed'
// and the Google Calendar event is inserted IMMEDIATELY. It is deliberately NOT
// the student self-booking flow — there is no booking link, no pending-approval
// step, and it is NOT gated by open-weeks. Double-booking is only WARNED about
// (via checkSlotConflictAction) so the owner can override and proceed anyway.
// ─────────────────────────────────────────────────────────────────────────────

/** Weekday (0=Sunday … 6=Saturday) of a `yyyy-MM-dd` string, TZ-safe. */
function weekdayOfDateStr(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export interface ScheduleResult {
  ok: boolean;
  error?: string;
  /** Number of lessons created (1 for one-off, N for a series). */
  count?: number;
  /** True when the slot overlapped an existing lesson / calendar busy block. */
  conflict?: boolean;
}

/**
 * Warns about a double-booking for an admin-chosen slot WITHOUT blocking it.
 * `date` = `yyyy-MM-dd`, `time` = `HH:mm` (Asia/Jerusalem); duration in minutes.
 * Returns `{ conflict }`; never throws to the UI (errors degrade to no-conflict).
 */
export async function checkSlotConflictAction(
  date: string,
  time: string,
  durationMin: number,
): Promise<{ conflict: boolean; items: OverlappingLesson[]; error?: string }> {
  if (!(await requireOwner())) return { conflict: false, items: [], error: 'אין הרשאה' };
  if (!date || !time) return { conflict: false, items: [] };
  const minutes = Number.isFinite(durationMin) && durationMin > 0 ? durationMin : 60;
  try {
    const startsAt = parseILDateTime(date, time);
    const endsAt = new Date(startsAt.getTime() + minutes * 60 * 1000);
    const [conflict, items] = await Promise.all([
      hasSlotConflict(startsAt.toISOString(), endsAt.toISOString()),
      overlappingLessons(startsAt.toISOString(), endsAt.toISOString()),
    ]);
    return { conflict, items };
  } catch (err) {
    console.error('[students] conflict check failed:', err);
    return { conflict: false, items: [] };
  }
}

/**
 * ADMIN one-off scheduler. Creates ONE confirmed individual lesson for an
 * existing student and inserts the Google Calendar event immediately (location
 * from settings, attendee = student/guardian email when present, default
 * reminders). Bypasses open-weeks + approval. Money is integer shekels.
 */
export async function scheduleStudentLesson(form: FormData): Promise<ScheduleResult> {
  if (!(await requireOwner())) return { ok: false, error: 'אין הרשאה' };

  const studentId = str(form, 'studentId');
  if (!studentId) return { ok: false, error: 'מזהה תלמיד חסר' };

  const student = await getStudent(studentId);
  if (!student) return { ok: false, error: 'התלמיד לא נמצא' };

  const dateStr = str(form, 'date');
  const timeStr = str(form, 'time');
  if (!dateStr) return { ok: false, error: 'יש לבחור תאריך' };
  if (!timeStr) return { ok: false, error: 'יש לבחור שעה' };

  const settings = await getSettings();
  const minutes = durationMin(form, 'durationMin', student.defaultDurationMin || settings.defaultDurationMin);

  // Price: explicit override → student default → settings default → null.
  const priceOverride = optionalIntShekels(form, 'price');
  if (priceOverride === undefined) return { ok: false, error: 'מחיר לא תקין' };
  const price =
    priceOverride !== null
      ? priceOverride
      : (student.defaultPrice ?? settings.defaultPrivatePrice ?? null);

  try {
    const startsAt = parseILDateTime(dateStr, timeStr);
    const endsAt = new Date(startsAt.getTime() + minutes * 60 * 1000);
    const location = settings.locationAddress || null;
    // Email goes to the guardian when set (children), else the student.
    const attendeeEmail = student.email ?? undefined;

    const inserted = await db
      .insert(lessons)
      .values({
        type: 'individual',
        source: 'manual',
        studentId: student.id,
        startsAt,
        endsAt,
        status: 'confirmed',
        needsMatch: false,
        price,
        location,
        bookedByName: student.name,
        bookedByPhone: student.phone,
        notes: str(form, 'notes') || null,
        confirmedAt: nowIL(),
      })
      .returning();
    const lesson = inserted[0];

    const evt = await insertEvent({
      summary: `שיעור – ${student.name}`,
      startISO: startsAt.toISOString(),
      endISO: endsAt.toISOString(),
      location: location ?? undefined,
      attendeeEmail,
      extendedPrivate: { type: 'individual', studentId: student.id },
    });

    await db.update(lessons).set({ googleEventId: evt.id }).where(eq(lessons.id, lesson.id));

    // Confirm to the recipient (the parent when a guardian phone is set) that
    // Ilanit scheduled the lesson. Non-fatal — never blocks the schedule.
    try {
      await notifyStudent(student, 'booking_approved_student', {
        studentName: student.name,
        datetime: formatILDateTime(startsAt),
        location: location ?? '',
        price: price ?? 0,
        calendarUrl: addToCalendarUrl({
          title: 'שיעור עם אילנית',
          start: startsAt,
          end: endsAt,
          location,
        }),
        cancelUrl: await createCancelUrl(lesson.id),
      });
    } catch (err) {
      console.error('[students] schedule confirmation failed:', err);
    }

    revalidatePath('/lessons');
    revalidatePath('/students');
    revalidatePath(`/students/${student.id}`);
    return { ok: true, count: 1 };
  } catch (err) {
    console.error('[students] schedule lesson failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'יצירת השיעור נכשלה' };
  }
}

/**
 * ADMIN weekly-recurring scheduler. Delegates to lib/recurrence.createSeries,
 * which persists a confirmed series + a single Google recurring event. Bypasses
 * open-weeks + approval. The weekday is derived from the chosen start date so
 * the owner can "pick a date and repeat weekly" without a separate weekday box.
 */
export async function scheduleStudentSeries(form: FormData): Promise<ScheduleResult> {
  if (!(await requireOwner())) return { ok: false, error: 'אין הרשאה' };

  const studentId = str(form, 'studentId');
  if (!studentId) return { ok: false, error: 'מזהה תלמיד חסר' };

  const student = await getStudent(studentId);
  if (!student) return { ok: false, error: 'התלמיד לא נמצא' };

  const timeStr = str(form, 'time');
  if (!timeStr) return { ok: false, error: 'יש לבחור שעה' };

  // weekday: either an explicit 0-6 field, or derived from a chosen start date.
  const weekdayRaw = str(form, 'weekday');
  const dateStr = str(form, 'date');
  let weekday: number;
  if (weekdayRaw !== '') {
    weekday = Number(weekdayRaw);
  } else if (dateStr) {
    weekday = weekdayOfDateStr(dateStr);
  } else {
    return { ok: false, error: 'יש לבחור יום בשבוע' };
  }
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    return { ok: false, error: 'יום בשבוע לא תקין' };
  }

  const settings = await getSettings();
  const minutes = durationMin(form, 'durationMin', student.defaultDurationMin || settings.defaultDurationMin);

  const priceOverride = optionalIntShekels(form, 'price');
  if (priceOverride === undefined) return { ok: false, error: 'מחיר לא תקין' };
  // createSeries falls back to the student default itself; pass an override only
  // when the owner typed one.
  const price = priceOverride !== null ? priceOverride : undefined;

  const horizonRaw = str(form, 'horizonDays').replace(/[^\d]/g, '');
  const horizonDays = horizonRaw ? Number(horizonRaw) : settings.bookingHorizonDays;

  try {
    const res = await createSeries({
      kind: 'individual',
      studentId: student.id,
      weekday,
      startTime: timeStr,
      durationMin: minutes,
      price,
      horizonDays,
    });

    // Confirm the recurring lesson to the recipient (parent when set), using the
    // first occurrence as the reference date. Non-fatal.
    if (res.firstStartsAt) {
      try {
        await notifyStudent(student, 'booking_approved_student', {
          studentName: student.name,
          datetime: formatILDateTime(res.firstStartsAt),
          location: settings.locationAddress ?? '',
          // Same fallback chain the series itself used when it set each price.
          price: price ?? student.defaultPrice ?? settings.defaultPrivatePrice ?? 0,
          calendarUrl: addToCalendarUrl({
            title: 'שיעור עם אילנית',
            start: res.firstStartsAt,
            end: new Date(res.firstStartsAt.getTime() + minutes * 60 * 1000),
            location: settings.locationAddress ?? null,
          }),
        });
      } catch (err) {
        console.error('[students] series confirmation failed:', err);
      }
    }

    revalidatePath('/lessons');
    revalidatePath('/students');
    revalidatePath(`/students/${student.id}`);
    if (res.count === 0) {
      return { ok: true, count: 0, error: 'לא נוצרו שיעורים בטווח שנבחר' };
    }
    return { ok: true, count: res.count };
  } catch (err) {
    console.error('[students] schedule series failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'יצירת הסדרה נכשלה' };
  }
}
