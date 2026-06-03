import { describe, it, expect } from 'vitest';
import { normalizePhoneIL, phoneToChatId, formatShekels, cn } from '@/lib/utils';

describe('normalizePhoneIL', () => {
  it('normalizes a local mobile number with leading 0', () => {
    expect(normalizePhoneIL('0501234567')).toBe('+972501234567');
  });

  it('strips spaces, dashes and parens', () => {
    expect(normalizePhoneIL('050-123-4567')).toBe('+972501234567');
    expect(normalizePhoneIL('(050) 123 4567')).toBe('+972501234567');
  });

  it('accepts +972 E.164 form', () => {
    expect(normalizePhoneIL('+972501234567')).toBe('+972501234567');
  });

  it('accepts 972 prefix without plus', () => {
    expect(normalizePhoneIL('972501234567')).toBe('+972501234567');
  });

  it('accepts 00972 international prefix', () => {
    expect(normalizePhoneIL('00972501234567')).toBe('+972501234567');
  });

  it('accepts an 8-digit landline subscriber number', () => {
    expect(normalizePhoneIL('035551234')).toBe('+97235551234');
  });

  it('throws on empty input', () => {
    expect(() => normalizePhoneIL('')).toThrow();
  });

  it('throws on a non-IL country code', () => {
    expect(() => normalizePhoneIL('+14155552671')).toThrow();
  });

  it('throws on too-short numbers', () => {
    expect(() => normalizePhoneIL('12345')).toThrow();
  });
});

describe('phoneToChatId', () => {
  it('builds a GreenAPI chatId from E.164', () => {
    expect(phoneToChatId('+972501234567')).toBe('972501234567@c.us');
  });

  it('strips non-digits', () => {
    expect(phoneToChatId('+972 50 123 4567')).toBe('972501234567@c.us');
  });

  it('throws when there are no digits', () => {
    expect(() => phoneToChatId('+')).toThrow();
  });
});

describe('formatShekels', () => {
  it('formats an integer amount with the shekel sign', () => {
    expect(formatShekels(120)).toBe('₪120');
  });

  it('rounds non-integers', () => {
    expect(formatShekels(119.6)).toBe('₪120');
  });

  it('adds a thousands separator', () => {
    expect(formatShekels(1200)).toBe('₪1,200');
  });

  it('handles zero', () => {
    expect(formatShekels(0)).toBe('₪0');
  });
});

describe('cn', () => {
  it('merges class names and dedupes tailwind conflicts', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('handles conditional values', () => {
    expect(cn('a', false && 'b', 'c')).toBe('a c');
  });
});
