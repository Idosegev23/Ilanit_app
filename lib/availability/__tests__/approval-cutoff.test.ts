import { describe, it, expect } from 'vitest';
import { requiresApproval } from '@/lib/availability/booking';

// The gate is on the moment the booking is SUBMITTED, not on when the lesson
// is. These cases pin the local-time comparison down: the instants are UTC and
// Israel runs +2 in winter / +3 in summer, so comparing UTC hours would move
// the cutoff by an hour twice a year.

describe('requiresApproval', () => {
  it('is off when no cutoff is configured', () => {
    expect(requiresApproval(new Date('2026-08-17T20:00:00.000Z'), null)).toBe(false);
  });

  it('treats the cutoff minute itself as requiring approval', () => {
    // 15:00Z = 18:00 IL (summer, +3)
    expect(requiresApproval(new Date('2026-08-17T15:00:00.000Z'), '18:00')).toBe(true);
  });

  it('lets a booking made just before the cutoff through', () => {
    // 14:59Z = 17:59 IL
    expect(requiresApproval(new Date('2026-08-17T14:59:00.000Z'), '18:00')).toBe(false);
  });

  it('gates a late-evening booking', () => {
    // 17:30Z = 20:30 IL
    expect(requiresApproval(new Date('2026-08-17T17:30:00.000Z'), '18:00')).toBe(true);
  });

  it('gates a booking made after midnight? no — that is a new day, before 18:00', () => {
    // 22:00Z = 01:00 IL next day
    expect(requiresApproval(new Date('2026-08-17T22:00:00.000Z'), '18:00')).toBe(false);
  });

  it('uses local time in WINTER too, when Israel is +2', () => {
    // 15:30Z is 17:30 IL in winter (allowed) but 18:30 IL in summer (gated).
    expect(requiresApproval(new Date('2026-01-15T15:30:00.000Z'), '18:00')).toBe(false);
    expect(requiresApproval(new Date('2026-08-15T15:30:00.000Z'), '18:00')).toBe(true);
  });

  it('accepts a postgres HH:MM:SS time value', () => {
    expect(requiresApproval(new Date('2026-08-17T15:00:00.000Z'), '18:00:00')).toBe(true);
  });

  it('honours a non-round cutoff', () => {
    expect(requiresApproval(new Date('2026-08-17T16:00:00.000Z'), '18:30')).toBe(true); // 19:00 IL
    expect(requiresApproval(new Date('2026-08-17T15:15:00.000Z'), '18:30')).toBe(false); // 18:15 IL
  });
});
