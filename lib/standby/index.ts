import { randomBytes, createHash } from 'crypto';
import { db } from '@/lib/db';
import {
  standbyRequests,
  standbyOffers,
  type StandbyRequest,
  type StandbyOffer,
} from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { findStudentByPhone, createStudent, contactPhoneFor } from '@/lib/students';
import { normalizePhoneIL } from '@/lib/utils';
import { env } from '@/lib/env';
import { notify } from '@/lib/notifications/dispatch';
import { ilWeekday, toILTimeStr, formatILDateTime } from '@/lib/time';

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

// ── Matching + offer (Phase 2) ──────────────────────────────────────────────

const sha256 = (raw: string) => createHash('sha256').update(raw).digest('hex');

/**
 * Active standby requests whose wanted weekday + hour range cover the given slot.
 * A slot matches when its weekday is in the request's weekdays AND its start time
 * falls within [startTime, endTime).
 */
export async function findMatchingStandbys(
  startsAt: Date,
  endsAt: Date,
): Promise<StandbyRequest[]> {
  void endsAt;
  const weekday = ilWeekday(startsAt);
  const slotTime = toILTimeStr(startsAt); // HH:mm
  const active = await db
    .select()
    .from(standbyRequests)
    .where(eq(standbyRequests.status, 'active'));

  return active.filter((r) => {
    const days = r.weekdays.split(',').map((d) => Number(d.trim()));
    if (!days.includes(weekday)) return false;
    // HH:mm strings compare chronologically (zero-padded).
    return r.startTime <= slotTime && slotTime < r.endTime;
  });
}

/**
 * Called when a lesson is cancelled and its slot genuinely frees. If any active
 * standby matches the freed slot, mint an offer + token and alert Ilanit with the
 * approval link. Best-effort: never throws to the caller (a cancel must not fail
 * because the waitlist alert failed). Returns the raw token when an offer is made.
 */
export async function offerFreedSlot(startsAt: Date, endsAt: Date): Promise<string | null> {
  try {
    const matches = await findMatchingStandbys(startsAt, endsAt);
    if (matches.length === 0) return null;

    const raw = randomBytes(32).toString('base64url');
    const inserted = await db
      .insert(standbyOffers)
      .values({ tokenHash: sha256(raw), startsAt, endsAt, status: 'open' })
      .returning({ id: standbyOffers.id });
    const offerId = inserted[0].id;

    const appUrl = env().NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
    await notify(
      'standby_slot_ilanit',
      env().ILANIT_PHONE,
      {
        datetime: formatILDateTime(startsAt),
        count: matches.length,
        actionUrl: `${appUrl}/s/${raw}`,
      },
      `standby-offer:${offerId}`,
    );
    return raw;
  } catch (err) {
    console.error('[standby] offerFreedSlot failed:', err);
    return null;
  }
}

// ── Approval peek (Phase 3) ─────────────────────────────────────────────────

export interface StandbyOfferView {
  offer: StandbyOffer;
  matches: StandbyRequest[];
}

/** Read-only lookup of an OPEN offer by its raw token, with the standbys that
 *  still match it. Returns null for an unknown/filled/expired token. */
export async function peekStandbyOffer(rawToken: string): Promise<StandbyOfferView | null> {
  if (!rawToken) return null;
  const rows = await db
    .select()
    .from(standbyOffers)
    .where(and(eq(standbyOffers.tokenHash, sha256(rawToken)), eq(standbyOffers.status, 'open')))
    .limit(1);
  const offer = rows[0];
  if (!offer) return null;
  const matches = await findMatchingStandbys(offer.startsAt, offer.endsAt);
  return { offer, matches };
}

/** Finds an OPEN offer by raw token (for the approval action). */
export async function findOpenOffer(rawToken: string): Promise<StandbyOffer | null> {
  if (!rawToken) return null;
  const rows = await db
    .select()
    .from(standbyOffers)
    .where(and(eq(standbyOffers.tokenHash, sha256(rawToken)), eq(standbyOffers.status, 'open')))
    .limit(1);
  return rows[0] ?? null;
}

/** Marks a standby request fulfilled and its offer filled (called on approval). */
export async function markStandbyFilled(offerId: string, standbyId: string): Promise<void> {
  const now = new Date();
  await db
    .update(standbyRequests)
    .set({ status: 'fulfilled', fulfilledAt: now })
    .where(eq(standbyRequests.id, standbyId));
  await db
    .update(standbyOffers)
    .set({ status: 'filled', filledAt: now })
    .where(eq(standbyOffers.id, offerId));
}

/** Loads a single active standby request by id. */
export async function getActiveStandby(standbyId: string): Promise<StandbyRequest | null> {
  const rows = await db
    .select()
    .from(standbyRequests)
    .where(and(eq(standbyRequests.id, standbyId), eq(standbyRequests.status, 'active')))
    .limit(1);
  return rows[0] ?? null;
}
