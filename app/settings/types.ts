// Shared shapes between the /settings server page, its client editors, and the
// /api/settings route. Times are wall-clock `HH:mm` strings (Asia/Jerusalem);
// the DB `time` columns round-trip as `HH:mm:ss`, normalised at the edges.

export interface SettingsValues {
  businessName: string;
  locationAddress: string;
  defaultDurationMin: number;
  bufferMin: number;
  leadTimeMin: number;
  bookingHorizonDays: number;
  reminderTime: string; // HH:mm
  groupBillingDay: number; // 1–28
  morningDocType: string | null;
}

export interface AvailabilityWindow {
  weekday: number; // 0 = Sunday … 6 = Saturday
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  active: boolean;
}

export interface AvailabilityExceptionInput {
  date: string; // yyyy-MM-dd
  type: 'blocked' | 'custom';
  startTime: string | null; // HH:mm (custom only)
  endTime: string | null; // HH:mm (custom only)
}

export interface SettingsPayload {
  settings: SettingsValues;
  availability: AvailabilityWindow[];
  exceptions: AvailabilityExceptionInput[];
}

/** Hebrew weekday labels, indexed 0 = Sunday … 6 = Saturday. */
export const WEEKDAY_LABELS = [
  'ראשון',
  'שני',
  'שלישי',
  'רביעי',
  'חמישי',
  'שישי',
  'שבת',
] as const;

/** Postgres `time` → `HH:mm` (drops seconds; tolerates already-trimmed input). */
export function toHHmm(t: string | null | undefined): string {
  if (!t) return '';
  return t.slice(0, 5);
}
