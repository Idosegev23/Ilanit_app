import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { availability, availabilityExceptions } from '@/db/schema';
import { getSettings, updateSettings } from '@/lib/settings';

// /api/settings — owner-only endpoint backing the NEW /settings page.
//   GET  → { settings, availability[], exceptions[] }
//   PUT  → updates the settings row + REPLACES the weekly availability windows
//          and blocked/custom-date exceptions in a single call.
// The route lives under the middleware-protected area; we re-check the session
// here (auth()) as defense-in-depth. Money is never handled here — settings are
// schedule/business config only.

export const dynamic = 'force-dynamic';

async function requireOwner(): Promise<boolean> {
  const session = await auth();
  return Boolean(session?.user);
}

// ── Validation ──────────────────────────────────────────────────────────────

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/; // 00:00 – 23:59
const YYYYMMDD = /^\d{4}-\d{2}-\d{2}$/;

/** A single weekly time window. Stored as one `availability` row. */
const windowSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startTime: z.string().regex(HHMM, 'שעת התחלה לא תקינה'),
    endTime: z.string().regex(HHMM, 'שעת סיום לא תקינה'),
    active: z.boolean(),
  })
  .refine((w) => w.startTime < w.endTime, {
    message: 'שעת הסיום חייבת להיות אחרי שעת ההתחלה',
    path: ['endTime'],
  });

/** A blocked / custom-window calendar exception. One `availability_exceptions` row. */
const exceptionSchema = z
  .object({
    date: z.string().regex(YYYYMMDD, 'תאריך לא תקין'),
    type: z.enum(['blocked', 'custom']),
    startTime: z.string().regex(HHMM).nullable().optional(),
    endTime: z.string().regex(HHMM).nullable().optional(),
  })
  .refine(
    (e) =>
      e.type === 'blocked' ||
      (!!e.startTime && !!e.endTime && e.startTime < e.endTime),
    { message: 'חלון מותאם דורש שעת התחלה וסיום תקינות', path: ['endTime'] },
  );

const putSchema = z.object({
  settings: z.object({
    businessName: z.string().trim().min(1, 'יש להזין שם עסק'),
    locationAddress: z.string().trim(),
    defaultDurationMin: z.number().int().min(1).max(600),
    bufferMin: z.number().int().min(0).max(240),
    leadTimeMin: z.number().int().min(0).max(20160), // ≤ 14 days
    bookingHorizonDays: z.number().int().min(1).max(365),
    reminderTime: z.string().regex(HHMM, 'שעת תזכורת לא תקינה'),
    groupBillingDay: z.number().int().min(1).max(28),
    morningDocType: z.string().trim().nullable(),
  }),
  availability: z.array(windowSchema).max(200),
  exceptions: z.array(exceptionSchema).max(365),
});

// ── Handlers ──────────────────────────────────────────────────────────────

export async function GET() {
  if (!(await requireOwner())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const [settingsRow, availabilityRows, exceptionRows] = await Promise.all([
    getSettings(),
    db.select().from(availability),
    db.select().from(availabilityExceptions),
  ]);
  return NextResponse.json({
    settings: settingsRow,
    availability: availabilityRows,
    exceptions: exceptionRows,
  });
}

export async function PUT(request: Request) {
  if (!(await requireOwner())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: 'גוף הבקשה אינו תקין' }, { status: 400 });
  }

  const parsed = putSchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { error: first?.message ?? 'נתונים לא תקינים', issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const { settings: s, availability: windows, exceptions } = parsed.data;

  // Persist the settings row via the shared lib helper (single source of truth).
  await updateSettings({
    businessName: s.businessName,
    locationAddress: s.locationAddress,
    defaultDurationMin: s.defaultDurationMin,
    bufferMin: s.bufferMin,
    leadTimeMin: s.leadTimeMin,
    bookingHorizonDays: s.bookingHorizonDays,
    reminderTime: s.reminderTime,
    groupBillingDay: s.groupBillingDay,
    morningDocType: s.morningDocType,
  });

  // Replace the weekly availability template wholesale. The page always sends
  // the full set, so a delete-then-insert keeps the table in lock-step with the
  // editor (and feeds the /book slot engine directly).
  await db.delete(availability);
  if (windows.length > 0) {
    await db.insert(availability).values(
      windows.map((w) => ({
        weekday: w.weekday,
        startTime: w.startTime,
        endTime: w.endTime,
        active: w.active,
      })),
    );
  }

  // Same replace strategy for blocked/custom-date exceptions.
  await db.delete(availabilityExceptions);
  if (exceptions.length > 0) {
    await db.insert(availabilityExceptions).values(
      exceptions.map((e) => ({
        date: e.date,
        type: e.type,
        startTime: e.type === 'custom' ? (e.startTime ?? null) : null,
        endTime: e.type === 'custom' ? (e.endTime ?? null) : null,
      })),
    );
  }

  const [settingsRow, availabilityRows, exceptionRows] = await Promise.all([
    getSettings(),
    db.select().from(availability),
    db.select().from(availabilityExceptions),
  ]);

  return NextResponse.json({
    ok: true,
    settings: settingsRow,
    availability: availabilityRows,
    exceptions: exceptionRows,
  });
}
