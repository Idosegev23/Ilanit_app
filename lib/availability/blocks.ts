import { db } from '@/lib/db';
import { availabilityExceptions } from '@/db/schema';
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import { nowIL, toILDateStr } from '@/lib/time';

// Availability BLOCKS — the "everything open within operating hours, mark what to
// close" model. Blocks subtract from the operating-hours template:
//   full_day → a 'blocked' exception (whole day closed)
//   window   → a 'block_window' exception (partial close, HH:mm..HH:mm)
// A vacation is a date range stored as one full-day block per date.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface BlockRow {
  id: string;
  date: string; // yyyy-MM-dd
  kind: 'full_day' | 'window';
  startTime: string | null; // HH:mm (window only)
  endTime: string | null;
}

const HORIZON_DAYS = 120;

/** The blocks display/list horizon: today → +120 days (Asia/Jerusalem). */
export function blocksHorizon(): { from: string; to: string } {
  const now = nowIL();
  return {
    from: toILDateStr(now),
    to: toILDateStr(new Date(now.getTime() + HORIZON_DAYS * MS_PER_DAY)),
  };
}

function hhmm(t: string | null): string | null {
  return t ? t.slice(0, 5) : null;
}

/** Every `yyyy-MM-dd` from..to inclusive (capped defensively). */
function datesInRange(fromISO: string, toISO: string): string[] {
  const out: string[] = [];
  let cur = fromISO;
  for (let i = 0; i < 400 && cur <= toISO; i++) {
    out.push(cur);
    const [y, m, d] = cur.split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1, d) + MS_PER_DAY);
    cur = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(
      next.getUTCDate(),
    ).padStart(2, '0')}`;
  }
  return out;
}

/** Blocks a whole day (idempotent — a single full-day block per date). */
export async function blockFullDay(dateISO: string): Promise<void> {
  const existing = await db
    .select({ id: availabilityExceptions.id })
    .from(availabilityExceptions)
    .where(and(eq(availabilityExceptions.date, dateISO), eq(availabilityExceptions.type, 'blocked')))
    .limit(1);
  if (existing[0]) return;
  await db
    .insert(availabilityExceptions)
    .values({ date: dateISO, type: 'blocked', startTime: null, endTime: null });
}

/** Blocks a HH:mm..HH:mm window on a date. */
export async function blockTimeWindow(
  dateISO: string,
  startTime: string,
  endTime: string,
): Promise<void> {
  await db
    .insert(availabilityExceptions)
    .values({ date: dateISO, type: 'block_window', startTime, endTime });
}

/** Blocks a full inclusive date range (vacation). Returns days blocked. */
export async function blockDateRange(fromISO: string, toISO: string): Promise<number> {
  const dates = datesInRange(fromISO, toISO);
  for (const dt of dates) await blockFullDay(dt);
  return dates.length;
}

/** Lists blocks within [fromISO, toISO] inclusive, ascending by date. */
export async function listBlocks(fromISO: string, toISO: string): Promise<BlockRow[]> {
  const rows = await db
    .select()
    .from(availabilityExceptions)
    .where(
      and(
        gte(availabilityExceptions.date, fromISO),
        lte(availabilityExceptions.date, toISO),
        inArray(availabilityExceptions.type, ['blocked', 'block_window']),
      ),
    )
    .orderBy(asc(availabilityExceptions.date), asc(availabilityExceptions.startTime));

  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    kind: r.type === 'blocked' ? 'full_day' : 'window',
    startTime: hhmm(r.startTime),
    endTime: hhmm(r.endTime),
  }));
}

/** Deletes one block by id. */
export async function removeBlock(id: string): Promise<void> {
  await db.delete(availabilityExceptions).where(eq(availabilityExceptions.id, id));
}
