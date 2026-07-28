import { db } from '@/lib/db';
import { standbyRequests } from '@/db/schema';
import { findStudentByPhone, createStudent, contactPhoneFor } from '@/lib/students';
import { normalizePhoneIL } from '@/lib/utils';
import { notify } from '@/lib/notifications/dispatch';

// Standby / waitlist engine. Phase 1: register interest (weekdays + hour range)
// and confirm to the visitor. The matching + approval flow lives in later phases.

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const HE_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'] as const;

export interface CreateStandbyInput {
  name: string;
  phone: string;
  email?: string;
  weekdays: number[]; // JS weekday numbers 0=Sun … 6=Sat
  startTime: string; // HH:mm
  endTime: string; // HH:mm
}

/** Sorted, de-duped, valid weekdays → "ראשון, שלישי, חמישי". */
export function weekdaysLabel(weekdays: number[]): string {
  return normalizeWeekdays(weekdays)
    .map((d) => HE_DAYS[d])
    .join(', ');
}

/** Sorted, de-duped list of valid (0–6) weekday numbers. */
export function normalizeWeekdays(weekdays: number[]): number[] {
  return [...new Set((weekdays ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort(
    (a, b) => a - b,
  );
}

export interface StandbyResult {
  ok: boolean;
  error?: string;
}

/**
 * Registers a standby (waitlist) request: validates, finds-or-creates the student
 * by phone, stores the request, and confirms to the visitor (best-effort). The
 * wanted weekdays are stored as a CSV of JS weekday numbers.
 */
export async function createStandbyRequest(input: CreateStandbyInput): Promise<StandbyResult> {
  const name = input.name?.trim();
  const phoneRaw = input.phone?.trim();
  if (!name) return { ok: false, error: 'יש להזין שם' };
  if (!phoneRaw) return { ok: false, error: 'יש להזין טלפון' };

  const weekdays = normalizeWeekdays(input.weekdays);
  if (weekdays.length === 0) return { ok: false, error: 'יש לבחור לפחות יום אחד' };

  if (!HHMM.test(input.startTime) || !HHMM.test(input.endTime)) {
    return { ok: false, error: 'טווח שעות לא תקין' };
  }
  if (input.startTime >= input.endTime) {
    return { ok: false, error: 'שעת הסיום חייבת להיות אחרי שעת ההתחלה' };
  }

  const phone = normalizePhoneIL(phoneRaw);
  const email = input.email?.trim() || null;

  const student =
    (await findStudentByPhone(phone)) ?? (await createStudent({ name, phone, email }));

  await db.insert(standbyRequests).values({
    studentId: student.id,
    name,
    phone,
    email,
    weekdays: weekdays.join(','),
    startTime: input.startTime,
    endTime: input.endTime,
    status: 'active',
  });

  try {
    await notify('standby_registered_student', contactPhoneFor(student), {
      studentName: name,
      daysLabel: weekdaysLabel(weekdays),
      startTime: input.startTime,
      endTime: input.endTime,
    });
  } catch (err) {
    console.error('[standby] registration confirmation failed:', err);
  }

  return { ok: true };
}
