import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks for cross-module + external deps.
//
// We mock the `googleapis` SDK with capturing spies so we can assert the EXACT
// request shape we send to Google (freeBusy query, events.insert with
// attendees + sendUpdates:'all' + location + reminders, recurrence RRULE,
// events.delete with sendUpdates:'all', and events.list reading
// extendedProperties.private). We also mock `@/lib/google-tokens` (the access
// token source) and `@/lib/env` (calendar id).
// ─────────────────────────────────────────────────────────────────────────────

// Hoisted so the spies exist before the (hoisted) vi.mock factory runs.
const h = vi.hoisted(() => {
  const setCredentials = vi.fn();
  const oauth2ClientInstance = { setCredentials };
  const freebusyQuery = vi.fn();
  const eventsInsert = vi.fn();
  const eventsDelete = vi.fn();
  const eventsList = vi.fn();
  const eventsGet = vi.fn();
  const calendarFactory = vi.fn(() => ({
    freebusy: { query: freebusyQuery },
    events: { insert: eventsInsert, delete: eventsDelete, list: eventsList, get: eventsGet },
  }));
  const OAuth2 = vi.fn(() => oauth2ClientInstance);
  return {
    setCredentials,
    oauth2ClientInstance,
    freebusyQuery,
    eventsInsert,
    eventsDelete,
    eventsList,
    eventsGet,
    calendarFactory,
    OAuth2,
  };
});

const {
  setCredentials,
  oauth2ClientInstance,
  freebusyQuery,
  eventsInsert,
  eventsDelete,
  eventsList,
  eventsGet,
  calendarFactory,
  OAuth2,
} = h;

vi.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: h.OAuth2 },
    calendar: h.calendarFactory,
  },
}));

vi.mock('@/lib/google-tokens', () => ({
  getGoogleAccessToken: vi.fn(async () => 'access-token-123'),
}));

vi.mock('@/lib/env', () => ({
  env: vi.fn(() => ({
    GOOGLE_CALENDAR_ID: 'primary',
    AUTH_GOOGLE_ID: 'client-id',
    AUTH_GOOGLE_SECRET: 'client-secret',
  })),
}));

import {
  freeBusy,
  insertEvent,
  insertRecurringEvent,
  cancelEvent,
  listEndedSince,
  getEvent,
} from '@/lib/google-calendar';
import { getGoogleAccessToken } from '@/lib/google-tokens';

beforeEach(() => {
  setCredentials.mockClear();
  freebusyQuery.mockReset();
  eventsInsert.mockReset();
  eventsDelete.mockReset();
  eventsList.mockReset();
  eventsGet.mockReset();
  calendarFactory.mockClear();
  OAuth2.mockClear();
  (getGoogleAccessToken as unknown as ReturnType<typeof vi.fn>).mockClear();
});

describe('auth wiring', () => {
  it('builds an OAuth2 client with the stored access token before any call', async () => {
    freebusyQuery.mockResolvedValue({ data: { calendars: { primary: { busy: [] } } } });
    await freeBusy('2026-06-10T00:00:00Z', '2026-06-10T23:59:59Z');

    expect(getGoogleAccessToken).toHaveBeenCalledTimes(1);
    expect(setCredentials).toHaveBeenCalledWith({ access_token: 'access-token-123' });
    expect(calendarFactory).toHaveBeenCalledWith({ version: 'v3', auth: oauth2ClientInstance });
  });
});

describe('freeBusy', () => {
  it('queries the freebusy API for the calendar id and returns busy slots', async () => {
    freebusyQuery.mockResolvedValue({
      data: {
        calendars: {
          primary: {
            busy: [
              { start: '2026-06-10T09:00:00Z', end: '2026-06-10T10:00:00Z' },
              { start: '2026-06-10T12:00:00Z', end: '2026-06-10T13:00:00Z' },
            ],
          },
        },
      },
    });

    const slots = await freeBusy('2026-06-10T00:00:00Z', '2026-06-10T23:59:59Z');

    expect(freebusyQuery).toHaveBeenCalledTimes(1);
    const arg = freebusyQuery.mock.calls[0][0];
    expect(arg.requestBody.timeMin).toBe('2026-06-10T00:00:00Z');
    expect(arg.requestBody.timeMax).toBe('2026-06-10T23:59:59Z');
    expect(arg.requestBody.items).toEqual([{ id: 'primary' }]);

    expect(slots).toEqual([
      { start: '2026-06-10T09:00:00Z', end: '2026-06-10T10:00:00Z' },
      { start: '2026-06-10T12:00:00Z', end: '2026-06-10T13:00:00Z' },
    ]);
  });

  it('returns an empty array when the calendar has no busy blocks', async () => {
    freebusyQuery.mockResolvedValue({ data: { calendars: { primary: {} } } });
    const slots = await freeBusy('2026-06-10T00:00:00Z', '2026-06-10T23:59:59Z');
    expect(slots).toEqual([]);
  });

  it('returns an empty array when the calendar key is absent', async () => {
    freebusyQuery.mockResolvedValue({ data: { calendars: {} } });
    const slots = await freeBusy('2026-06-10T00:00:00Z', '2026-06-10T23:59:59Z');
    expect(slots).toEqual([]);
  });
});

describe('insertEvent', () => {
  it('inserts a timed event with attendee, sendUpdates:all, location and reminders', async () => {
    eventsInsert.mockResolvedValue({ data: { id: 'evt-1', htmlLink: 'https://cal/evt-1' } });

    const res = await insertEvent({
      summary: 'שיעור – דנה',
      startISO: '2026-06-10T13:00:00+03:00',
      endISO: '2026-06-10T14:00:00+03:00',
      location: 'רחוב הרצל 1, תל אביב',
      attendeeEmail: 'dana@example.com',
      description: 'שיעור פרטי',
      extendedPrivate: { type: 'individual', student_id: 's-1' },
    });

    expect(res).toEqual({ id: 'evt-1', htmlLink: 'https://cal/evt-1' });
    expect(eventsInsert).toHaveBeenCalledTimes(1);
    const arg = eventsInsert.mock.calls[0][0];

    expect(arg.calendarId).toBe('primary');
    expect(arg.sendUpdates).toBe('all');

    const body = arg.requestBody;
    expect(body.summary).toBe('שיעור – דנה');
    expect(body.location).toBe('רחוב הרצל 1, תל אביב');
    expect(body.description).toBe('שיעור פרטי');
    expect(body.start).toEqual({ dateTime: '2026-06-10T13:00:00+03:00', timeZone: 'Asia/Jerusalem' });
    expect(body.end).toEqual({ dateTime: '2026-06-10T14:00:00+03:00', timeZone: 'Asia/Jerusalem' });
    expect(body.attendees).toEqual([{ email: 'dana@example.com' }]);
    expect(body.reminders.useDefault).toBe(false);
    expect(Array.isArray(body.reminders.overrides)).toBe(true);
    expect(body.reminders.overrides.length).toBeGreaterThan(0);
    expect(body.extendedProperties).toEqual({
      private: { type: 'individual', student_id: 's-1' },
    });
  });

  it('omits attendees when no email is supplied', async () => {
    eventsInsert.mockResolvedValue({ data: { id: 'evt-2' } });

    await insertEvent({
      summary: 'שיעור – יוסי',
      startISO: '2026-06-11T13:00:00+03:00',
      endISO: '2026-06-11T14:00:00+03:00',
    });

    const body = eventsInsert.mock.calls[0][0].requestBody;
    expect(body.attendees).toBeUndefined();
    // still notifies (sendUpdates) so Ilanit sees it on her devices
    expect(eventsInsert.mock.calls[0][0].sendUpdates).toBe('all');
  });

  it('omits location/description/extendedProperties when not provided', async () => {
    eventsInsert.mockResolvedValue({ data: { id: 'evt-3' } });

    await insertEvent({
      summary: 'שיעור',
      startISO: '2026-06-11T13:00:00+03:00',
      endISO: '2026-06-11T14:00:00+03:00',
    });

    const body = eventsInsert.mock.calls[0][0].requestBody;
    expect(body.location).toBeUndefined();
    expect(body.description).toBeUndefined();
    expect(body.extendedProperties).toBeUndefined();
  });

  it('returns an htmlLink of undefined when Google omits it', async () => {
    eventsInsert.mockResolvedValue({ data: { id: 'evt-4' } });
    const res = await insertEvent({
      summary: 'x',
      startISO: '2026-06-11T13:00:00+03:00',
      endISO: '2026-06-11T14:00:00+03:00',
    });
    expect(res).toEqual({ id: 'evt-4', htmlLink: undefined });
  });

  it('throws when Google returns no event id', async () => {
    eventsInsert.mockResolvedValue({ data: {} });
    await expect(
      insertEvent({
        summary: 'x',
        startISO: '2026-06-11T13:00:00+03:00',
        endISO: '2026-06-11T14:00:00+03:00',
      }),
    ).rejects.toThrow();
  });
});

describe('insertRecurringEvent', () => {
  it('inserts an event carrying the RRULE in recurrence[]', async () => {
    eventsInsert.mockResolvedValue({ data: { id: 'rec-1' } });

    const res = await insertRecurringEvent(
      {
        summary: 'מפגש קבוצה – אלגברה',
        startISO: '2026-06-10T17:00:00+03:00',
        endISO: '2026-06-10T18:00:00+03:00',
        location: 'הסטודיו',
        extendedPrivate: { type: 'group', group_id: 'g-1' },
      },
      'RRULE:FREQ=WEEKLY;BYDAY=WE',
    );

    expect(res).toEqual({ id: 'rec-1' });
    const arg = eventsInsert.mock.calls[0][0];
    expect(arg.sendUpdates).toBe('all');
    const body = arg.requestBody;
    expect(body.recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=WE']);
    expect(body.summary).toBe('מפגש קבוצה – אלגברה');
    expect(body.location).toBe('הסטודיו');
    expect(body.extendedProperties).toEqual({ private: { type: 'group', group_id: 'g-1' } });
  });

  it('throws when Google returns no event id for a recurring event', async () => {
    eventsInsert.mockResolvedValue({ data: {} });
    await expect(
      insertRecurringEvent(
        {
          summary: 'x',
          startISO: '2026-06-10T17:00:00+03:00',
          endISO: '2026-06-10T18:00:00+03:00',
        },
        'RRULE:FREQ=WEEKLY',
      ),
    ).rejects.toThrow();
  });
});

describe('cancelEvent', () => {
  it('deletes the event and notifies attendees', async () => {
    eventsDelete.mockResolvedValue({});
    await cancelEvent('evt-1');
    expect(eventsDelete).toHaveBeenCalledTimes(1);
    const arg = eventsDelete.mock.calls[0][0];
    expect(arg.calendarId).toBe('primary');
    expect(arg.eventId).toBe('evt-1');
    expect(arg.sendUpdates).toBe('all');
  });

  it('treats an already-gone event (404/410) as success', async () => {
    eventsDelete.mockRejectedValue({ code: 410, message: 'Resource has been deleted' });
    await expect(cancelEvent('evt-gone')).resolves.toBeUndefined();
  });

  it('propagates non-not-found errors', async () => {
    eventsDelete.mockRejectedValue({ code: 500, message: 'server error' });
    await expect(cancelEvent('evt-x')).rejects.toBeTruthy();
  });
});

describe('listEndedSince', () => {
  it('lists single events in the window and maps extendedProperties.private', async () => {
    eventsList.mockResolvedValue({
      data: {
        items: [
          {
            id: 'e1',
            summary: 'שיעור – דנה',
            end: { dateTime: '2026-06-03T11:00:00+03:00' },
            attendees: [{ email: 'dana@example.com' }],
            extendedProperties: { private: { type: 'individual', student_id: 's-1' } },
          },
          {
            id: 'e2',
            summary: 'מפגש קבוצה',
            end: { dateTime: '2026-06-03T12:30:00+03:00' },
            extendedProperties: { private: { type: 'group', group_id: 'g-9' } },
          },
        ],
      },
    });

    const results = await listEndedSince(
      '2026-06-03T09:00:00+03:00',
      '2026-06-03T13:00:00+03:00',
    );

    expect(eventsList).toHaveBeenCalledTimes(1);
    const arg = eventsList.mock.calls[0][0];
    expect(arg.calendarId).toBe('primary');
    expect(arg.singleEvents).toBe(true);
    expect(arg.orderBy).toBe('startTime');
    expect(arg.timeMin).toBe('2026-06-03T09:00:00+03:00');
    expect(arg.timeMax).toBe('2026-06-03T13:00:00+03:00');

    expect(results).toEqual([
      {
        id: 'e1',
        summary: 'שיעור – דנה',
        endISO: '2026-06-03T11:00:00+03:00',
        attendeeEmail: 'dana@example.com',
        type: 'individual',
        studentId: 's-1',
        groupId: undefined,
      },
      {
        id: 'e2',
        summary: 'מפגש קבוצה',
        endISO: '2026-06-03T12:30:00+03:00',
        attendeeEmail: undefined,
        type: 'group',
        studentId: undefined,
        groupId: 'g-9',
      },
    ]);
  });

  it('filters out events that have not yet ended within the window', async () => {
    eventsList.mockResolvedValue({
      data: {
        items: [
          { id: 'past', summary: 'a', end: { dateTime: '2026-06-03T10:00:00+03:00' } },
          { id: 'future', summary: 'b', end: { dateTime: '2026-06-03T20:00:00+03:00' } },
        ],
      },
    });

    const results = await listEndedSince(
      '2026-06-03T09:00:00+03:00',
      '2026-06-03T13:00:00+03:00',
    );

    expect(results.map((r) => r.id)).toEqual(['past']);
  });

  it('handles all-day events (end.date) and missing extendedProperties', async () => {
    eventsList.mockResolvedValue({
      data: {
        items: [
          { id: 'allday', summary: 'יום מיוחד', end: { date: '2026-06-03' } },
        ],
      },
    });

    const results = await listEndedSince(
      '2026-06-02T00:00:00+03:00',
      '2026-06-04T00:00:00+03:00',
    );

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('allday');
    expect(results[0].type).toBeUndefined();
    expect(results[0].studentId).toBeUndefined();
    expect(results[0].groupId).toBeUndefined();
  });

  it('skips cancelled events and events without an end time', async () => {
    eventsList.mockResolvedValue({
      data: {
        items: [
          { id: 'cancelled', status: 'cancelled', end: { dateTime: '2026-06-03T10:00:00+03:00' } },
          { id: 'noend', summary: 'broken' },
          { id: 'ok', summary: 'good', end: { dateTime: '2026-06-03T10:30:00+03:00' } },
        ],
      },
    });

    const results = await listEndedSince(
      '2026-06-03T09:00:00+03:00',
      '2026-06-03T13:00:00+03:00',
    );

    expect(results.map((r) => r.id)).toEqual(['ok']);
  });

  it('returns an empty array when there are no items', async () => {
    eventsList.mockResolvedValue({ data: {} });
    const results = await listEndedSince(
      '2026-06-03T09:00:00+03:00',
      '2026-06-03T13:00:00+03:00',
    );
    expect(results).toEqual([]);
  });
});

describe('getEvent', () => {
  it('fetches a single event and returns its id, summary and times', async () => {
    eventsGet.mockResolvedValue({
      data: {
        id: 'evt-9',
        summary: 'שיעור – דנה',
        start: { dateTime: '2026-06-10T13:00:00+03:00' },
        end: { dateTime: '2026-06-10T14:00:00+03:00' },
      },
    });

    const res = await getEvent('evt-9');

    expect(eventsGet).toHaveBeenCalledTimes(1);
    const arg = eventsGet.mock.calls[0][0];
    expect(arg.calendarId).toBe('primary');
    expect(arg.eventId).toBe('evt-9');
    expect(res).toEqual({
      id: 'evt-9',
      summary: 'שיעור – דנה',
      startISO: '2026-06-10T13:00:00+03:00',
      endISO: '2026-06-10T14:00:00+03:00',
    });
  });

  it('handles all-day events (start.date/end.date)', async () => {
    eventsGet.mockResolvedValue({
      data: { id: 'allday', summary: 'יום מיוחד', start: { date: '2026-06-03' }, end: { date: '2026-06-04' } },
    });
    const res = await getEvent('allday');
    expect(res).toEqual({
      id: 'allday',
      summary: 'יום מיוחד',
      startISO: '2026-06-03',
      endISO: '2026-06-04',
    });
  });

  it('returns null for an empty event id without calling the API', async () => {
    const res = await getEvent('');
    expect(res).toBeNull();
    expect(eventsGet).not.toHaveBeenCalled();
  });

  it('returns null when the event is gone (404/410)', async () => {
    eventsGet.mockRejectedValue({ code: 404, message: 'Not Found' });
    await expect(getEvent('missing')).resolves.toBeNull();
  });

  it('propagates non-not-found errors', async () => {
    eventsGet.mockRejectedValue({ code: 500, message: 'server error' });
    await expect(getEvent('boom')).rejects.toBeTruthy();
  });
});
