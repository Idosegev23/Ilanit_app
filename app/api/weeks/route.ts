import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { getSettings } from '@/lib/settings';
import { nowIL, parseILDateTime, toILDateStr } from '@/lib/time';
import {
  weekStartOf,
  openWeek,
  closeWeek,
  listOpenWeeks,
} from '@/lib/open-weeks';

// /api/weeks — owner-only endpoint backing the open-weeks WEEK STRIP in /lessons.
//   GET  → { horizonDays, weeks: [{ weekStartISO, isOpen }] } — the upcoming
//          weeks (Sunday→Saturday, Asia/Jerusalem) from this week through the
//          booking horizon, each flagged open/closed for personal-link booking.
//   POST → { weekStartISO, open: boolean } opens/closes that week (idempotent).
//
// Weeks start CLOSED; Ilanit opens them manually ("אילנית פותחת שבוע ידנית").
// Recurring lessons & group sessions are NOT gated by open-weeks — only
// personal-link single-slot booking is. This route lives under the
// middleware-protected area; we re-check the session here (auth()) as
// defense-in-depth, mirroring /api/settings.

export const dynamic = 'force-dynamic';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

async function requireOwner(): Promise<boolean> {
  const session = await auth();
  return Boolean(session?.user);
}

const YYYYMMDD = /^\d{4}-\d{2}-\d{2}$/;

const postSchema = z.object({
  weekStartISO: z.string().regex(YYYYMMDD, 'תאריך תחילת שבוע לא תקין'),
  open: z.boolean(),
});

/**
 * Enumerates the Sunday `weekStart` of every week from the current week through
 * `horizonDays` forward, inclusive. Stepped in 7-day increments off the current
 * week's Sunday; each Sunday is re-normalized via `weekStartOf` so the boundary
 * stays correct across an Asia/Jerusalem DST transition.
 */
function upcomingWeekStarts(horizonDays: number): string[] {
  const now = nowIL();
  const horizonEnd = toILDateStr(new Date(now.getTime() + horizonDays * MS_PER_DAY));
  const out: string[] = [];
  const seen = new Set<string>();
  let cursor = weekStartOf(now);
  // Cap iterations defensively; the horizon is bounded (≤ 365 days → ≤ 53 weeks).
  for (let i = 0; i <= 60; i++) {
    if (seen.has(cursor)) break;
    seen.add(cursor);
    out.push(cursor);
    if (cursor >= horizonEnd) break;
    const sunday = parseILDateTime(cursor, '00:00');
    cursor = weekStartOf(new Date(sunday.getTime() + 7 * MS_PER_DAY));
  }
  return out;
}

export async function GET() {
  if (!(await requireOwner())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const settings = await getSettings();
  const weekStarts = upcomingWeekStarts(settings.bookingHorizonDays);
  const openSet = new Set(
    await listOpenWeeks(weekStarts[0], weekStarts[weekStarts.length - 1]),
  );

  return NextResponse.json({
    horizonDays: settings.bookingHorizonDays,
    weeks: weekStarts.map((weekStartISO) => ({
      weekStartISO,
      isOpen: openSet.has(weekStartISO),
    })),
  });
}

export async function POST(request: Request) {
  if (!(await requireOwner())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: 'גוף הבקשה אינו תקין' }, { status: 400 });
  }

  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { error: first?.message ?? 'נתונים לא תקינים' },
      { status: 422 },
    );
  }

  const { weekStartISO, open } = parsed.data;

  try {
    if (open) {
      await openWeek(weekStartISO);
    } else {
      await closeWeek(weekStartISO);
    }
  } catch (err) {
    console.error('[api/weeks] toggle failed:', err);
    return NextResponse.json(
      { error: 'שגיאה בעדכון סטטוס השבוע' },
      { status: 500 },
    );
  }

  // Echo back the canonical (normalized) Sunday + resulting state.
  return NextResponse.json({
    ok: true,
    weekStartISO: weekStartOf(parseILDateTime(weekStartISO, '00:00')),
    isOpen: open,
  });
}
