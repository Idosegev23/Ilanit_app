import { fromZonedTime } from 'date-fns-tz';

// Standalone IL-wall-clock → UTC converter for test fixtures. The metrics test
// mocks @/lib/time, so it cannot import parseILDateTime; this mirrors it.
export function parseILDateTimeUTC(dateStr: string, timeStr: string): Date {
  const t = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
  return fromZonedTime(`${dateStr}T${t}`, 'Asia/Jerusalem');
}
