// Builds a Google Calendar "add event" template link. Opening it pre-fills a new
// event in the RECIPIENT's own calendar — no attendee email or login required —
// so we can drop it into the post-approval WhatsApp and let the student/parent
// add the lesson with one tap.

export interface AddToCalendarParams {
  title: string;
  start: Date;
  end: Date;
  location?: string | null;
  details?: string | null;
}

/** Compact UTC stamp Google Calendar expects, e.g. `20260701T140000Z`. */
function gcalStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * A Google Calendar template URL. `render?action=TEMPLATE&text=…&dates=…` opens
 * the "new event" screen pre-filled with the lesson — works for anyone, with no
 * email invite needed.
 */
export function addToCalendarUrl({
  title,
  start,
  end,
  location,
  details,
}: AddToCalendarParams): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${gcalStamp(start)}/${gcalStamp(end)}`,
  });
  if (location) params.set('location', location);
  if (details) params.set('details', details);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
