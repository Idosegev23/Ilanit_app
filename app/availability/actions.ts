'use server';

import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import { toILTimeStr } from '@/lib/time';
import {
  dayAvailability,
  monthDayStates,
  overlappingLessons,
  type DaySlot,
  type DayState,
  type OverlappingLesson,
} from '@/lib/availability';
import {
  blockTimeWindow,
  unblockTimeWindow,
  blockFullDay,
  unblockFullDay,
  isFullDayBlocked,
  blockDateRange,
  forceOpenSlot,
  unforceOpenSlot,
} from '@/lib/availability/blocks';

// Owner-only server actions for the interactive availability calendar. Everything
// within operating hours is open unless closed here; lessons are taken auto.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function requireOwner(): Promise<boolean> {
  const session = await auth();
  return Boolean(session?.user);
}

function hhmm(iso: string): string {
  return toILTimeStr(new Date(iso)).slice(0, 5);
}

export interface ActionResult {
  ok: boolean;
  error?: string;
  count?: number;
}

/** Per-day open/taken counts for the month grid range [fromISO, toISO]. */
export async function loadMonth(
  fromISO: string,
  toISO: string,
): Promise<Record<string, DayState>> {
  if (!(await requireOwner())) return {};
  if (!DATE_RE.test(fromISO) || !DATE_RE.test(toISO)) return {};
  return monthDayStates(fromISO, toISO);
}

/** One day's slots (with state) + whether the whole day is blocked. */
export async function loadDay(
  dateISO: string,
): Promise<{ slots: DaySlot[]; fullDayBlocked: boolean }> {
  if (!(await requireOwner())) return { slots: [], fullDayBlocked: false };
  if (!DATE_RE.test(dateISO)) return { slots: [], fullDayBlocked: false };
  const [slots, fullDayBlocked] = await Promise.all([
    dayAvailability(dateISO),
    isFullDayBlocked(dateISO),
  ]);
  return { slots, fullDayBlocked };
}

/** Toggles a single slot open/closed (close=true → block that window). */
export async function toggleSlot(
  dateISO: string,
  startISO: string,
  endISO: string,
  close: boolean,
): Promise<ActionResult> {
  if (!(await requireOwner())) return { ok: false, error: 'אין הרשאה' };
  if (!DATE_RE.test(dateISO)) return { ok: false, error: 'תאריך לא תקין' };
  const start = hhmm(startISO);
  const end = hhmm(endISO);
  if (close) {
    // A close always wins — drop any stale force-open on this slot first.
    await unforceOpenSlot(dateISO, start, end);
    await blockTimeWindow(dateISO, start, end);
  } else {
    await unblockTimeWindow(dateISO, start, end);
  }
  revalidatePath('/availability');
  return { ok: true };
}

/** What already occupies a slot (for the "open over existing?" confirmation). */
export async function slotOccupants(
  startISO: string,
  endISO: string,
): Promise<OverlappingLesson[]> {
  if (!(await requireOwner())) return [];
  try {
    return await overlappingLessons(startISO, endISO);
  } catch {
    return [];
  }
}

/** Force-opens a taken slot for booking (open=true), or reverts it (open=false). */
export async function toggleForceOpen(
  dateISO: string,
  startISO: string,
  endISO: string,
  open: boolean,
): Promise<ActionResult> {
  if (!(await requireOwner())) return { ok: false, error: 'אין הרשאה' };
  if (!DATE_RE.test(dateISO)) return { ok: false, error: 'תאריך לא תקין' };
  const start = hhmm(startISO);
  const end = hhmm(endISO);
  if (open) await forceOpenSlot(dateISO, start, end);
  else await unforceOpenSlot(dateISO, start, end);
  revalidatePath('/availability');
  return { ok: true };
}

/** Closes or re-opens a whole day. */
export async function toggleDay(dateISO: string, close: boolean): Promise<ActionResult> {
  if (!(await requireOwner())) return { ok: false, error: 'אין הרשאה' };
  if (!DATE_RE.test(dateISO)) return { ok: false, error: 'תאריך לא תקין' };
  if (close) await blockFullDay(dateISO);
  else await unblockFullDay(dateISO);
  revalidatePath('/availability');
  return { ok: true };
}

/** Closes a full date range (vacation). */
export async function closeRange(fromDate: string, toDate: string): Promise<ActionResult> {
  if (!(await requireOwner())) return { ok: false, error: 'אין הרשאה' };
  if (!DATE_RE.test(fromDate) || !DATE_RE.test(toDate)) {
    return { ok: false, error: 'תאריכים לא תקינים' };
  }
  if (toDate < fromDate) return { ok: false, error: 'תאריך הסיום לפני ההתחלה' };
  const count = await blockDateRange(fromDate, toDate);
  revalidatePath('/availability');
  return { ok: true, count };
}
