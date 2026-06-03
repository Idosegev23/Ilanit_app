import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { generateInsights, getCachedInsights } from '@/lib/insights';

// /api/insights — owner-only endpoint to (re)generate or fetch the cached AI
// insights. The route lives under the authenticated area (middleware also
// guards it); we re-check the session here as defense-in-depth. External calls
// (OpenAI) are wrapped in try/catch and surfaced as JSON.

export const dynamic = 'force-dynamic';

const DEFAULT_PERIOD_DAYS = 30;
const MIN_PERIOD_DAYS = 1;
const MAX_PERIOD_DAYS = 365;

/** Parses & clamps the `periodDays` query/body value. */
function parsePeriodDays(raw: unknown): number {
  const n = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : NaN;
  if (!Number.isFinite(n)) return DEFAULT_PERIOD_DAYS;
  const int = Math.floor(n);
  if (int < MIN_PERIOD_DAYS) return MIN_PERIOD_DAYS;
  if (int > MAX_PERIOD_DAYS) return MAX_PERIOD_DAYS;
  return int;
}

async function requireOwner(): Promise<boolean> {
  const session = await auth();
  return Boolean(session?.user);
}

/** GET — returns the latest cached insight for the period (no API call). */
export async function GET(request: Request) {
  if (!(await requireOwner())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const periodDays = parsePeriodDays(searchParams.get('periodDays'));
  const cached = await getCachedInsights(periodDays);
  return NextResponse.json({ periodDays, cached });
}

/** POST — (re)generates insights via OpenAI and caches them. */
export async function POST(request: Request) {
  if (!(await requireOwner())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let periodDays = DEFAULT_PERIOD_DAYS;
  try {
    const body = (await request.json().catch(() => ({}))) as { periodDays?: unknown };
    periodDays = parsePeriodDays(body?.periodDays);
  } catch {
    periodDays = DEFAULT_PERIOD_DAYS;
  }

  try {
    const { stats, text } = await generateInsights(periodDays);
    return NextResponse.json({ periodDays, stats, text });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[api/insights] generation failed:', message);
    return NextResponse.json(
      { error: 'insights_generation_failed', detail: message },
      { status: 502 },
    );
  }
}
