import { NextResponse } from 'next/server';
import { availableSlots } from '@/lib/availability';

// Public availability endpoint for the booking page. GET /api/availability?date=YYYY-MM-DD
// returns the bookable slots for that day. No auth (booking is public); rate
// limiting is enforced at the platform/CDN layer per spec §6.

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');

  if (!date || !DATE_RE.test(date)) {
    return NextResponse.json(
      { ok: false, error: 'יש לציין תאריך תקין בפורמט YYYY-MM-DD' },
      { status: 400 },
    );
  }

  try {
    const slots = await availableSlots(date);
    return NextResponse.json({ ok: true, date, slots });
  } catch (err) {
    console.error('[api/availability] failed:', err);
    return NextResponse.json(
      { ok: false, error: 'שגיאה בטעינת הזמנים הפנויים' },
      { status: 500 },
    );
  }
}
