import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { studentSummary, debtsOverview } from '@/lib/insights/lookup';

/*
  Read-only lookup for the WhatsApp assistant.

  Ilanit asks her questions in WhatsApp, so the bot answers them from here
  rather than making her open the app. This endpoint can ONLY read: it cannot
  bill, settle, cancel or message anyone, which keeps the blast radius of a
  leaked token to disclosure rather than action.

  Shares the webhook secret rather than inventing another credential, and
  refuses outright when none is configured — failing closed, because the data
  is students' names, lesson history and debts.
*/

export const dynamic = 'force-dynamic';

function authorized(req: Request): boolean {
  const want = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!want) return false;
  const got = req.headers.get('authorization') ?? '';
  const a = Buffer.from(got);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request): Promise<Response> {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const name = url.searchParams.get('name')?.trim();
  const month = url.searchParams.get('month')?.trim() || undefined;

  try {
    if (!name) {
      return NextResponse.json({ ok: true, debts: await debtsOverview() });
    }
    const res = await studentSummary(name, month);
    if (res.matches.length === 0) {
      return NextResponse.json({ ok: true, found: false, matches: [] });
    }
    if (!res.summary) {
      // Several people match — the assistant should ask rather than pick one.
      return NextResponse.json({ ok: true, found: false, matches: res.matches });
    }
    return NextResponse.json({ ok: true, found: true, student: res.summary });
  } catch (err) {
    console.error('[insights/student] failed:', err);
    return NextResponse.json({ ok: false, error: 'lookup failed' }, { status: 500 });
  }
}
