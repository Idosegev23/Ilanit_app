'use server';

import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import {
  blockFullDay,
  blockTimeWindow,
  blockDateRange,
  removeBlock,
  listBlocks,
  blocksHorizon,
  type BlockRow,
} from '@/lib/availability/blocks';

// Owner-only server actions for the /availability manager (the "everything open,
// mark what to close" blocks). Availability = operating hours − blocks − lessons.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export interface BlockActionResult {
  ok: boolean;
  error?: string;
  count?: number;
}

async function requireOwner(): Promise<boolean> {
  const session = await auth();
  return Boolean(session?.user);
}

export async function fetchBlocks(): Promise<BlockRow[]> {
  if (!(await requireOwner())) return [];
  const { from, to } = blocksHorizon();
  return listBlocks(from, to);
}

export async function blockFullDayAction(date: string): Promise<BlockActionResult> {
  if (!(await requireOwner())) return { ok: false, error: 'אין הרשאה' };
  if (!DATE_RE.test(date)) return { ok: false, error: 'תאריך לא תקין' };
  await blockFullDay(date);
  revalidatePath('/availability');
  return { ok: true };
}

export async function blockRangeAction(
  fromDate: string,
  toDate: string,
): Promise<BlockActionResult> {
  if (!(await requireOwner())) return { ok: false, error: 'אין הרשאה' };
  if (!DATE_RE.test(fromDate) || !DATE_RE.test(toDate)) {
    return { ok: false, error: 'תאריכים לא תקינים' };
  }
  if (toDate < fromDate) return { ok: false, error: 'תאריך הסיום לפני ההתחלה' };
  const count = await blockDateRange(fromDate, toDate);
  revalidatePath('/availability');
  return { ok: true, count };
}

export async function blockWindowAction(
  date: string,
  start: string,
  end: string,
): Promise<BlockActionResult> {
  if (!(await requireOwner())) return { ok: false, error: 'אין הרשאה' };
  if (!DATE_RE.test(date)) return { ok: false, error: 'תאריך לא תקין' };
  if (!TIME_RE.test(start) || !TIME_RE.test(end)) return { ok: false, error: 'שעות לא תקינות' };
  if (end <= start) return { ok: false, error: 'שעת הסיום לפני ההתחלה' };
  await blockTimeWindow(date, start, end);
  revalidatePath('/availability');
  return { ok: true };
}

export async function removeBlockAction(id: string): Promise<BlockActionResult> {
  if (!(await requireOwner())) return { ok: false, error: 'אין הרשאה' };
  await removeBlock(id);
  revalidatePath('/availability');
  return { ok: true };
}
