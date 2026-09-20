import { describe, it, expect, afterEach } from 'vitest';
import { isQuietNow, quietUntil } from '@/lib/env';

/*
  Yom Kippur 2026: Ilanit asked for everything to go silent from the eve until
  Tuesday morning.

  The window expires by itself rather than being a switch someone flips. A
  switch has to be flipped back, and the cost of forgetting is a system that has
  quietly stopped reminding anybody — which is far worse than the holiday
  message it was meant to prevent.
*/
const ORIGINAL = process.env.QUIET_UNTIL;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.QUIET_UNTIL;
  else process.env.QUIET_UNTIL = ORIGINAL;
});

describe('quiet window', () => {
  it('is off when nothing is configured', () => {
    delete process.env.QUIET_UNTIL;
    expect(quietUntil()).toBeNull();
    expect(isQuietNow(new Date('2026-09-20T15:00:00Z'))).toBe(false);
  });

  it('silences the jobs inside the window', () => {
    process.env.QUIET_UNTIL = '2026-09-22T03:00:00.000Z'; // Tue 06:00 IL
    expect(isQuietNow(new Date('2026-09-20T15:00:00Z'))).toBe(true); // erev, 18:00 IL
    expect(isQuietNow(new Date('2026-09-21T12:00:00Z'))).toBe(true); // Yom Kippur
  });

  it('lapses on its own once the window passes', () => {
    process.env.QUIET_UNTIL = '2026-09-22T03:00:00.000Z';
    expect(isQuietNow(new Date('2026-09-22T03:00:01Z'))).toBe(false);
    expect(isQuietNow(new Date('2026-09-22T15:00:00Z'))).toBe(false); // Tue 18:00 IL
  });

  it('ignores a malformed value rather than going silent forever', () => {
    // A typo must not mute the system indefinitely.
    process.env.QUIET_UNTIL = 'tuesday morning';
    expect(quietUntil()).toBeNull();
    expect(isQuietNow(new Date('2026-09-21T12:00:00Z'))).toBe(false);
  });
});
