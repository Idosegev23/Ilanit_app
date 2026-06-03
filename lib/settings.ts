import { db } from '@/lib/db';
import { settings, type Settings, type NewSettings } from '@/db/schema';
import { eq } from 'drizzle-orm';

// Default settings row. Values are best-effort defaults (spec §11 TBD with
// Ilanit) and can be edited from /settings or the seed script.
const DEFAULT_SETTINGS: Omit<NewSettings, 'id' | 'createdAt' | 'updatedAt'> = {
  businessName: 'אילנית — שיעורים פרטיים',
  locationAddress: '',
  defaultDurationMin: 60,
  bufferMin: 15,
  leadTimeMin: 120,
  bookingHorizonDays: 14,
  reminderTime: '18:00',
  paymentFollowupDelayH: 24,
  groupBillingDay: 1,
  groupFollowupDays: 3,
  defaultPrivatePrice: null,
  morningDocType: null,
  morningBusinessMeta: null,
  timezone: 'Asia/Jerusalem',
};

/**
 * Returns the single settings row, creating it with defaults if absent.
 */
export async function getSettings(): Promise<Settings> {
  const rows = await db.select().from(settings).limit(1);
  if (rows.length > 0) return rows[0];
  const inserted = await db.insert(settings).values(DEFAULT_SETTINGS).returning();
  return inserted[0];
}

/**
 * Applies a partial patch to the settings row, creating it first if needed.
 */
export async function updateSettings(
  patch: Partial<Omit<Settings, 'id' | 'createdAt'>>,
): Promise<Settings> {
  const current = await getSettings();
  const updated = await db
    .update(settings)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(settings.id, current.id))
    .returning();
  return updated[0];
}
