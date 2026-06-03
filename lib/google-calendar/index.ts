// Typed STUB — implemented by feature agent B1 (Calendar).
// OAuth client via getGoogleAccessToken(); freeBusy / insertEvent /
// insertRecurringEvent / cancelEvent / listEndedSince. Group markers via
// extendedProperties.

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
}

export async function freeBusy(
  _timeMin: string,
  _timeMax: string,
): Promise<FreeBusySlot[]> {
  throw new Error('NOT_IMPLEMENTED: freeBusy');
}

export async function insertEvent(
  _e: EventInput,
): Promise<{ id: string; htmlLink?: string }> {
  throw new Error('NOT_IMPLEMENTED: insertEvent');
}

export async function insertRecurringEvent(
  _e: EventInput,
  _rrule: string,
): Promise<{ id: string }> {
  throw new Error('NOT_IMPLEMENTED: insertRecurringEvent');
}

export async function cancelEvent(_eventId: string): Promise<void> {
  throw new Error('NOT_IMPLEMENTED: cancelEvent');
}

export async function listEndedSince(
  _sinceISO: string,
  _untilISO: string,
): Promise<EndedEvent[]> {
  throw new Error('NOT_IMPLEMENTED: listEndedSince');
}
