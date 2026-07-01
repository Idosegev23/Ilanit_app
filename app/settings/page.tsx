import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { availability, availabilityExceptions } from '@/db/schema';
import { getSettings } from '@/lib/settings';
import { PageHeader } from '@/components/ui/page-header';
import { SettingsView } from './SettingsView';
import {
  toHHmm,
  type AvailabilityExceptionInput,
  type AvailabilityWindow,
  type SettingsValues,
} from './types';

// Owner-only settings page (lives in the app shell). Loads the current
// settings row, weekly availability template and date exceptions, then hands
// them to a client editor that PUTs back to /api/settings. Saving the weekly
// availability is what makes the public /book page show bookable slots.
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect('/login?callbackUrl=/settings');
  }

  const [settingsRow, availabilityRows, exceptionRows] = await Promise.all([
    getSettings(),
    db.select().from(availability),
    db.select().from(availabilityExceptions),
  ]);

  const initialSettings: SettingsValues = {
    businessName: settingsRow.businessName,
    locationAddress: settingsRow.locationAddress,
    defaultDurationMin: settingsRow.defaultDurationMin,
    bufferMin: settingsRow.bufferMin,
    leadTimeMin: settingsRow.leadTimeMin,
    bookingHorizonDays: settingsRow.bookingHorizonDays,
    reminderTime: toHHmm(settingsRow.reminderTime),
    groupBillingDay: settingsRow.groupBillingDay,
    morningDocType: settingsRow.morningDocType,
    defaultPrivatePrice: settingsRow.defaultPrivatePrice ?? null,
  };

  const initialAvailability: AvailabilityWindow[] = availabilityRows.map((r) => ({
    weekday: r.weekday,
    startTime: toHHmm(r.startTime),
    endTime: toHHmm(r.endTime),
    active: r.active,
  }));

  // 'block_window' blocks are managed on /availability, not here — the settings
  // editor covers full-day blocks + custom-hours only.
  const initialExceptions: AvailabilityExceptionInput[] = exceptionRows
    .filter((r) => r.type === 'blocked' || r.type === 'custom')
    .map((r) => ({
      date: r.date,
      type: r.type as 'blocked' | 'custom',
      startTime: toHHmm(r.startTime),
      endTime: toHHmm(r.endTime),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="ניהול העסק"
        title="הגדרות"
        subtitle="זמינות שבועית, חריגים, תמחור ופרטי העסק — אלה קובעים את הזמנים והמחירים בלינק התיאום."
      />
      <SettingsView
        initialSettings={initialSettings}
        initialAvailability={initialAvailability}
        initialExceptions={initialExceptions}
      />
    </div>
  );
}
