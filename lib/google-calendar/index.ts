import { google } from 'googleapis';
import type { calendar_v3 } from 'googleapis';
import { getGoogleAccessToken } from '@/lib/google-tokens';
import { env } from '@/lib/env';

// Google Calendar wrapper (module B1). Every operation runs against Ilanit's
// single connected calendar, authorised via the stored OAuth refresh token
// (exchanged for a fresh access token by `getGoogleAccessToken`). External SDK
// (`googleapis`) is mocked in tests; this module is the only place that touches
// it. Times are passed through as ISO strings produced in Asia/Jerusalem by the
// callers (booking / recurrence); event bodies pin the timeZone explicitly so
// Google renders them correctly regardless of the offset notation.

const TIMEZONE = 'Asia/Jerusalem';

// 24h and 1h reminders — covers Ilanit's "day before" expectation and a final
// nudge. Google caps overrides at a few entries; these two are safe.
const DEFAULT_REMINDERS: calendar_v3.Schema$Event['reminders'] = {
  useDefault: false,
  overrides: [
    { method: 'popup', minutes: 24 * 60 },
    { method: 'popup', minutes: 60 },
  ],
};

export interface FreeBusySlot {
  start: string;
  end: string;
}

export interface EventInput {
  summary: string;
  startISO: string;
  endISO: string;
  location?: string;
  attendeeEmail?: string;
  description?: string;
  extendedPrivate?: Record<string, string>;
}

export interface EndedEvent {
  id: string;
  summary: string;
  endISO: string;
  attendeeEmail?: string;
  type?: 'individual' | 'group';
  studentId?: string;
  groupId?: string;
  /** Event location text (when set). Used to detect non-teaching events. */
  location?: string;
  /** Event description/notes (when set). Used to detect non-teaching events. */
  description?: string;
  /** True for an all-day event (date without a time-of-day) / a marker. */
  allDay?: boolean;
}

export interface CalendarEventDetails {
  id: string;
  summary: string;
  startISO?: string;
  endISO?: string;
}

/** Builds an authenticated Calendar v3 client using the current access token. */
async function getCalendar(): Promise<calendar_v3.Calendar> {
  const e = env();
  const accessToken = await getGoogleAccessToken();
  const oauth2 = new google.auth.OAuth2(e.AUTH_GOOGLE_ID, e.AUTH_GOOGLE_SECRET);
  oauth2.setCredentials({ access_token: accessToken });
  return google.calendar({ version: 'v3', auth: oauth2 });
}

function calendarId(): string {
  return env().GOOGLE_CALENDAR_ID;
}

/** Returns busy time-ranges on Ilanit's calendar within [timeMin, timeMax). */
export async function freeBusy(
  timeMin: string,
  timeMax: string,
): Promise<FreeBusySlot[]> {
  const calendar = await getCalendar();
  const id = calendarId();
  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      timeZone: TIMEZONE,
      items: [{ id }],
    },
  });

  const busy = res.data.calendars?.[id]?.busy ?? [];
  return busy
    .filter((b): b is { start: string; end: string } => Boolean(b.start && b.end))
    .map((b) => ({ start: b.start, end: b.end }));
}

export interface CalendarBusyEvent {
  id: string;
  summary: string;
  startISO?: string;
  endISO?: string;
}

/**
 * Lists TIMED events overlapping [timeMin, timeMax] with their titles — used to
 * label WHAT occupies a slot (freeBusy has no title). Best-effort: returns [] on
 * any API error; skips all-day and cancelled events.
 */
export async function listEventsInRange(
  timeMin: string,
  timeMax: string,
): Promise<CalendarBusyEvent[]> {
  try {
    const calendar = await getCalendar();
    const res = await calendar.events.list({
      calendarId: calendarId(),
      timeMin,
      timeMax,
      singleEvents: true,
      showDeleted: false,
      maxResults: 20,
      orderBy: 'startTime',
    });
    return (res.data.items ?? [])
      .filter((e) => Boolean(e.id) && e.status !== 'cancelled' && Boolean(e.start?.dateTime))
      .map((e) => ({
        id: e.id as string,
        summary: e.summary ?? '',
        startISO: e.start?.dateTime ?? undefined,
        endISO: endISOOf(e),
      }));
  } catch {
    return [];
  }
}

/** Shared body builder for both one-off and recurring inserts. */
function buildEventBody(e: EventInput): calendar_v3.Schema$Event {
  const body: calendar_v3.Schema$Event = {
    summary: e.summary,
    start: { dateTime: e.startISO, timeZone: TIMEZONE },
    end: { dateTime: e.endISO, timeZone: TIMEZONE },
    reminders: DEFAULT_REMINDERS,
  };
  if (e.location) body.location = e.location;
  if (e.description) body.description = e.description;
  if (e.attendeeEmail) body.attendees = [{ email: e.attendeeEmail }];
  if (e.extendedPrivate && Object.keys(e.extendedPrivate).length > 0) {
    body.extendedProperties = { private: e.extendedPrivate };
  }
  return body;
}

/**
 * Creates a single confirmed lesson event. Notifies attendees + Ilanit's
 * devices via `sendUpdates:'all'` so a student with an email receives the
 * Google invite automatically.
 */
export async function insertEvent(
  e: EventInput,
): Promise<{ id: string; htmlLink?: string }> {
  const calendar = await getCalendar();
  const res = await calendar.events.insert({
    calendarId: calendarId(),
    sendUpdates: 'all',
    requestBody: buildEventBody(e),
  });

  const id = res.data.id;
  if (!id) {
    throw new Error('Google Calendar insertEvent returned no event id');
  }
  return { id, htmlLink: res.data.htmlLink ?? undefined };
}

/**
 * Creates a recurring event (weekly lesson / group session) by attaching the
 * supplied RRULE. Group markers travel in `extendedPrivate`.
 */
export async function insertRecurringEvent(
  e: EventInput,
  rrule: string,
): Promise<{ id: string }> {
  const calendar = await getCalendar();
  const body = buildEventBody(e);
  body.recurrence = [rrule];
  const res = await calendar.events.insert({
    calendarId: calendarId(),
    sendUpdates: 'all',
    requestBody: body,
  });

  const id = res.data.id;
  if (!id) {
    throw new Error('Google Calendar insertRecurringEvent returned no event id');
  }
  return { id };
}

function isNotFoundError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const code = (err as { code?: unknown }).code;
  const status = (err as { status?: unknown }).status;
  return code === 404 || code === 410 || status === 404 || status === 410;
}

/**
 * Deletes (cancels) an event, notifying participants. An event that is already
 * gone (404/410) is treated as success so the caller's flow stays idempotent.
 */
export async function cancelEvent(eventId: string): Promise<void> {
  const calendar = await getCalendar();
  try {
    await calendar.events.delete({
      calendarId: calendarId(),
      eventId,
      sendUpdates: 'all',
    });
  } catch (err) {
    if (isNotFoundError(err)) return;
    throw err;
  }
}

/**
 * Fetches a single event's details by id. Returns null when the event no longer
 * exists (404/410) so callers (the title backfill) can skip it safely. Times are
 * the timed (dateTime) values when present, otherwise the all-day date.
 */
export async function getEvent(
  eventId: string,
): Promise<CalendarEventDetails | null> {
  if (!eventId) return null;
  const calendar = await getCalendar();
  try {
    const res = await calendar.events.get({
      calendarId: calendarId(),
      eventId,
    });
    const event = res.data;
    // A deleted event may come back as HTTP 200 with status 'cancelled' (during
    // Google's retention window) rather than a 404 — treat it as gone, mirroring
    // the listEndedSince scan filter.
    if (!event.id || event.status === 'cancelled') return null;
    return {
      id: event.id,
      summary: event.summary ?? '',
      startISO: event.start?.dateTime ?? event.start?.date ?? undefined,
      endISO: endISOOf(event),
    };
  } catch (err) {
    if (isNotFoundError(err)) return null;
    throw err;
  }
}

function readPrivate(
  event: calendar_v3.Schema$Event,
  key: string,
): string | undefined {
  const value = event.extendedProperties?.private?.[key];
  return value ?? undefined;
}

function endISOOf(event: calendar_v3.Schema$Event): string | undefined {
  return event.end?.dateTime ?? event.end?.date ?? undefined;
}

/**
 * Lists events that ENDED within [sinceISO, untilISO]. Source of truth for the
 * payment-check cron: includes events Ilanit created manually. Reads the lesson
 * `type` / `student_id` / `group_id` from `extendedProperties.private`.
 *
 * Google's `timeMin/timeMax` filter on events that *overlap* the window, so we
 * additionally keep only events whose end falls inside it; cancelled events and
 * events without an end are skipped.
 */
export async function listEndedSince(
  sinceISO: string,
  untilISO: string,
): Promise<EndedEvent[]> {
  const calendar = await getCalendar();
  const res = await calendar.events.list({
    calendarId: calendarId(),
    timeMin: sinceISO,
    timeMax: untilISO,
    singleEvents: true,
    orderBy: 'startTime',
    showDeleted: false,
    maxResults: 2500,
  });

  const items = res.data.items ?? [];
  const sinceMs = Date.parse(sinceISO);
  const untilMs = Date.parse(untilISO);

  const out: EndedEvent[] = [];
  for (const event of items) {
    if (event.status === 'cancelled') continue;
    if (!event.id) continue;

    const endISO = endISOOf(event);
    if (!endISO) continue;

    const endMs = Date.parse(endISO);
    if (!Number.isNaN(endMs)) {
      if (endMs < sinceMs || endMs > untilMs) continue;
    }

    const rawType = readPrivate(event, 'type');
    const type =
      rawType === 'individual' || rawType === 'group' ? rawType : undefined;

    // All-day events carry a `date` (no `dateTime`) on start/end — they are
    // markers, not timed teaching lessons.
    const allDay = Boolean(event.start?.date) && !event.start?.dateTime;

    out.push({
      id: event.id,
      summary: event.summary ?? '',
      endISO,
      attendeeEmail: event.attendees?.[0]?.email ?? undefined,
      type,
      studentId: readPrivate(event, 'student_id'),
      groupId: readPrivate(event, 'group_id'),
      location: event.location ?? undefined,
      description: event.description ?? undefined,
      allDay,
    });
  }

  return out;
}
