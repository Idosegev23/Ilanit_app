'use server';

// Server actions for the personal (token) booking WEEK view. These run with NO
// login — the token IS the authorization, and these only READ public booking
// availability (the same data the public /api/availability endpoint exposes),
// so there is nothing token-specific to leak here. The actual booking still
// goes through /api/book (which re-checks the slot + open-weeks gate).
//
// We keep the open-weeks GATE on the server: `availableWeek` already returns
// empty slots for closed weeks, and `listOpenWeeks` tells the UI which weeks in
// the horizon are bookable (so it can auto-jump to the nearest open one and
// disable navigation past the horizon edges).

import { availableWeek, type AvailableWeek } from '@/lib/availability';
import { listOpenWeeks, weekStartOf } from '@/lib/open-weeks';
import { getSettings } from '@/lib/settings';
import { nowIL, parseILDateTime } from '@/lib/time';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface BookingWeekView {
  /** The 7-day (Sun→Sat) availability for the requested week. */
  week: AvailableWeek;
  /** Sunday `weekStart`s that are OPEN within the booking horizon (ascending). */
  openWeeks: string[];
  /** The earliest Sunday a user may navigate to (this week's Sunday). */
  firstWeekStart: string;
  /** The latest Sunday a user may navigate to (within the booking horizon). */
  lastWeekStart: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The Sunday `weekStart` of the week containing "now" (Asia/Jerusalem). */
function currentWeekStart(): string {
  return weekStartOf(nowIL());
}

/**
 * The horizon bounds, as Sunday `weekStart`s: the current week through the week
 * that contains (today + bookingHorizonDays). Booking navigation is clamped to
 * this inclusive range.
 */
async function horizonBounds(): Promise<{ first: string; last: string }> {
  const settings = await getSettings();
  const first = currentWeekStart();
  const lastDay = new Date(nowIL().getTime() + settings.bookingHorizonDays * MS_PER_DAY);
  const last = weekStartOf(lastDay);
  return { first, last };
}

/** Clamps a Sunday `weekStart` into the [first, last] horizon (inclusive). */
function clampWeek(weekStart: string, first: string, last: string): string {
  if (weekStart < first) return first;
  if (weekStart > last) return last;
  return weekStart;
}

/**
 * Loads the booking week view. When `weekStartISO` is omitted (the initial
 * load), we resolve the NEAREST open week within the horizon so the user lands
 * on a bookable week when one exists. Any input is normalized to its Sunday and
 * clamped to the booking horizon.
 */
export async function loadBookingWeek(weekStartISO?: string): Promise<BookingWeekView> {
  const { first, last } = await horizonBounds();
  const openWeeks = await listOpenWeeks(first, last);

  // Resolve the target Sunday.
  let target: string;
  if (weekStartISO && DATE_RE.test(weekStartISO)) {
    target = clampWeek(
      weekStartOf(parseILDateTime(weekStartISO, '00:00')),
      first,
      last,
    );
  } else {
    // Initial load: prefer the nearest open week (the current one if open,
    // otherwise the first open week in the horizon), else the current week.
    target = openWeeks.length > 0 ? openWeeks[0] : first;
    if (openWeeks.includes(first)) target = first;
  }

  const week = await availableWeek(target);

  return { week, openWeeks, firstWeekStart: first, lastWeekStart: last };
}
