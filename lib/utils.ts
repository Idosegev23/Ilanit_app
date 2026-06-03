import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Tailwind-aware className merge. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Normalizes an Israeli phone number to E.164 (`+972…`).
 * Accepts: 0501234567, 050-123-4567, +972501234567, 972501234567,
 * 00972501234567, with spaces/dashes/parens.
 * Throws on input that cannot be a valid IL number.
 */
export function normalizePhoneIL(raw: string): string {
  if (!raw) throw new Error('empty phone');
  // strip everything except digits and a leading +
  let s = raw.trim().replace(/[\s\-().]/g, '');
  // international prefix 00 → +
  if (s.startsWith('00')) s = '+' + s.slice(2);

  let digits: string;
  if (s.startsWith('+972')) {
    digits = s.slice(4);
  } else if (s.startsWith('972')) {
    digits = s.slice(3);
  } else if (s.startsWith('+')) {
    // some other country code — not supported by IL normalizer
    throw new Error(`unsupported country code in phone: ${raw}`);
  } else if (s.startsWith('0')) {
    digits = s.slice(1);
  } else {
    digits = s;
  }

  // local part must be all digits, 8 or 9 long (mobile 9 incl. leading subscriber,
  // landline 8). After removing leading 0 the subscriber number is 8-9 digits.
  if (!/^\d{8,9}$/.test(digits)) {
    throw new Error(`invalid IL phone number: ${raw}`);
  }
  return `+972${digits}`;
}

/**
 * Converts an E.164 phone to a GreenAPI chatId (`972…@c.us`).
 */
export function phoneToChatId(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  if (!digits) throw new Error(`cannot build chatId from: ${e164}`);
  return `${digits}@c.us`;
}

/**
 * Formats an integer-shekel amount for display (`₪120`).
 */
export function formatShekels(n: number): string {
  const rounded = Math.round(n);
  return `₪${rounded.toLocaleString('he-IL')}`;
}
