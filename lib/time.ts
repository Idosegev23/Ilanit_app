import { fromZonedTime, toZonedTime, format } from 'date-fns-tz';
import { startOfDay } from 'date-fns';

// All business-logic time handling happens in Asia/Jerusalem. Storage is UTC
// (timestamptz); these helpers convert at the edges so we never rely on the
// host machine's local timezone.

export const IL_TZ = 'Asia/Jerusalem';

/** Current instant (UTC Date). */
export function nowIL(): Date {
  return new Date();
}

/**
 * Start of the calendar day (00:00 Asia/Jerusalem) for the given instant,
 * returned as a UTC Date.
 */
export function startOfDayIL(date: Date): Date {
  const zoned = toZonedTime(date, IL_TZ);
  const startZoned = startOfDay(zoned);
  return fromZonedTime(startZoned, IL_TZ);
}

/** Hour-of-day (0-23) in Asia/Jerusalem for the given instant. */
export function ilHour(date: Date): number {
  return Number(format(toZonedTime(date, IL_TZ), 'H', { timeZone: IL_TZ }));
}

/** Minute-of-hour (0-59) in Asia/Jerusalem for the given instant. */
export function ilMinute(date: Date): number {
  return Number(format(toZonedTime(date, IL_TZ), 'm', { timeZone: IL_TZ }));
}

/** Weekday (0=Sunday … 6=Saturday) in Asia/Jerusalem. */
/** Day of the calendar month in Asia/Jerusalem (1-31). */
export function ilDayOfMonth(date: Date): number {
  return Number(toILDateStr(date).slice(8, 10));
}

export function ilWeekday(date: Date): number {
  return toZonedTime(date, IL_TZ).getDay();
}

/** Local date string `yyyy-MM-dd` in Asia/Jerusalem. */
export function toILDateStr(date: Date): string {
  return format(toZonedTime(date, IL_TZ), 'yyyy-MM-dd', { timeZone: IL_TZ });
}

/** Local time string `HH:mm` in Asia/Jerusalem. */
export function toILTimeStr(date: Date): string {
  return format(toZonedTime(date, IL_TZ), 'HH:mm', { timeZone: IL_TZ });
}

/**
 * Parses a wall-clock date+time in Asia/Jerusalem into a UTC Date.
 * `dateStr` = `yyyy-MM-dd`, `timeStr` = `HH:mm` (or `HH:mm:ss`).
 */
export function parseILDateTime(dateStr: string, timeStr: string): Date {
  const t = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
  return fromZonedTime(`${dateStr}T${t}`, IL_TZ);
}

/** Formats an instant as a human Hebrew date+time, e.g. `03/06/2026 18:00`. */
export function formatILDateTime(date: Date): string {
  return format(toZonedTime(date, IL_TZ), 'dd/MM/yyyy HH:mm', { timeZone: IL_TZ });
}
