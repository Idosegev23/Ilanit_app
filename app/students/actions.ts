'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { normalizePhoneIL } from '@/lib/utils';
import {
  createStudent,
  updateStudent,
  findStudentByPhone,
  getStudent,
} from '@/lib/students';

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

  // The phone column is unique — surface a friendly conflict message.
  const existing = await findStudentByPhone(phone);
  if (existing) {
    return { ok: false, error: 'כבר קיים תלמיד עם מספר טלפון זה' };
  }

  const price = optionalIntShekels(form, 'defaultPrice');
  if (price === undefined) return { ok: false, error: 'מחיר לא תקין' };

  const email = str(form, 'email') || null;
  const notes = str(form, 'notes') || null;

  try {
    const student = await createStudent({
      name,
      phone,
      email,
      defaultPrice: price,
      defaultDurationMin: durationMin(form, 'defaultDurationMin', 60),
      notes,
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

  try {
    await updateStudent(id, {
      name,
      phone,
      email: str(form, 'email') || null,
      defaultPrice: price,
      defaultDurationMin: durationMin(form, 'defaultDurationMin', current.defaultDurationMin),
      notes: str(form, 'notes') || null,
      archived: str(form, 'archived') === 'on',
    });
    revalidatePath('/students');
    revalidatePath(`/students/${id}`);
    return { ok: true, id };
  } catch (err) {
    console.error('[students] update failed:', err);
    return { ok: false, error: 'עדכון התלמיד נכשל' };
  }
}
