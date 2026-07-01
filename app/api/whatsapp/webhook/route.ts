import { NextResponse } from 'next/server';
import { handleGreenNotification, type GreenNotification } from '@/lib/whatsapp/inbound';

// GreenAPI incoming webhook. Configure the GreenAPI instance to POST here:
//   https://<app>/api/whatsapp/webhook   (optionally ?token=<WHATSAPP_WEBHOOK_SECRET>)
// Handles outgoing-message delivered/read status + incoming messages from KNOWN
// students. Always returns 200 (so GreenAPI won't retry-storm); notifications for
// other projects on the same instance / unknown numbers are silently ignored.

export const dynamic = 'force-dynamic';

function authorized(req: Request): boolean {
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!secret) return true; // no secret configured → accept (idMessage/phone still filter)
  const url = new URL(req.url);
  return url.searchParams.get('token') === secret;
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  let body: GreenNotification;
  try {
    body = (await req.json()) as GreenNotification;
  } catch {
    return NextResponse.json({ ok: true, note: 'bad json ignored' });
  }

  try {
    const res = await handleGreenNotification(body);
    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    console.error('[whatsapp/webhook] handler error:', err);
    return NextResponse.json({ ok: true, note: 'error handled' });
  }
}

// GreenAPI (and some uptime probes) may GET the URL to verify it.
export async function GET() {
  return NextResponse.json({ ok: true, service: 'whatsapp-webhook' });
}
