import { describe, it, expect } from 'vitest';
import { requiresApproval } from '@/lib/availability/booking';

// The cutoff compares the slot's ISRAEL-LOCAL time. These cases pin that down,
// because the stored ISO strings are UTC and Israel runs +2 in winter / +3 in
// summer — comparing UTC hours would move the gate by an hour twice a year.

describe('requiresApproval', () => {
  it('is off when no cutoff is configured', () => {
    expect(requiresApproval(new Date('2026-08-17T20:00:00.000Z'), null)).toBe(false);
  });

  it('treats the cutoff hour itself as requiring approval', () => {
    // 15:00Z = 18:00 in Israel (summer, +3)
    expect(requiresApproval(new Date('2026-08-17T15:00:00.000Z'), '18:00')).toBe(true);
  });

  it('lets the slot just before the cutoff through', () => {
    // 14:59Z = 17:59 IL
    expect(requiresApproval(new Date('2026-08-17T14:59:00.000Z'), '18:00')).toBe(false);
  });

  it('gates a late-evening slot', () => {
    // 17:30Z = 20:30 IL
    expect(requiresApproval(new Date('2026-08-17T17:30:00.000Z'), '18:00')).toBe(true);
  });

  it('uses local time in WINTER too, when Israel is +2', () => {
    // 16:00Z is 18:00 IL in winter but 19:00 IL in summer. Both are ≥ 18:00, so
    // check the pair that actually distinguishes the two offsets:
    // 15:30Z = 17:30 IL in winter (allowed) but 18:30 IL in summer (gated).
    expect(requiresApproval(new Date('2026-01-15T15:30:00.000Z'), '18:00')).toBe(false);
    expect(requiresApproval(new Date('2026-08-15T15:30:00.000Z'), '18:00')).toBe(true);
  });

  it('accepts a postgres HH:MM:SS time value', () => {
    expect(requiresApproval(new Date('2026-08-17T15:00:00.000Z'), '18:00:00')).toBe(true);
  });

  it('honours a non-round cutoff', () => {
    // 16:00Z = 19:00 IL — after 18:30
    expect(requiresApproval(new Date('2026-08-17T16:00:00.000Z'), '18:30')).toBe(true);
    // 15:15Z = 18:15 IL — before 18:30
    expect(requiresApproval(new Date('2026-08-17T15:15:00.000Z'), '18:30')).toBe(false);
  });
});
