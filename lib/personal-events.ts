/*
  Calendar entries that belong to Ilanit's family rather than to her teaching.

  Two separate consequences follow, and they used to live in two files that
  could drift apart: such an entry must not be imported as a lesson, AND it must
  not hold a slot — a lesson can be booked straight over it.

  "גאי כדורסל", "גוצה פסנתר", "גאי שחמט" are the children's activities.
  "Preply lesson - …" are their son's private English lessons. Neither is a
  commitment of hers.
*/

const DEFAULT_PERSONAL_NAMES = ['לביא', 'גאי', 'גוצה'];
const DEFAULT_OVERLAPPABLE_MARKERS = ['preply'];

/** The children's names, as they appear in calendar titles. */
export function personalNames(): string[] {
  const raw = process.env.PERSONAL_EVENT_NAMES;
  const list = raw ? raw.split(',') : DEFAULT_PERSONAL_NAMES;
  return list.map((n) => n.trim()).filter(Boolean);
}

/** Lower-case substrings that mark somebody else's commitment. */
export function overlappableMarkers(): string[] {
  const raw = process.env.OVERLAPPABLE_EVENT_MARKERS;
  const list = raw ? raw.split(',') : DEFAULT_OVERLAPPABLE_MARKERS;
  return list.map((m) => m.trim().toLowerCase()).filter(Boolean);
}

/**
 * True when `name` appears in `text` as its own word.
 *
 * Hebrew has no \b, so a word edge is "not a Hebrew letter" — except that the
 * one-letter prefixes ו/ב/ל/ה/מ/ש/כ attach directly to a word, so "ולביא" is
 * still לביא. Allowing exactly one of those keeps "עידו ולביא" matching while
 * "לביאה" stays a different name.
 *
 * Whole-word matching matters in both directions here: a filter that swallowed
 * a real lesson would drop it silently, with no prompt left to notice it by.
 */
export function mentionsName(text: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const notHebrew = '[^\\u0590-\\u05FF]';
  const start = `(^|${notHebrew})[\\u05D5\\u05D1\\u05DC\\u05D4\\u05DE\\u05E9\\u05DB]?`;
  return new RegExp(`${start}${escaped}($|${notHebrew})`).test(text);
}

export interface TitledEvent {
  summary?: string;
  description?: string;
  /** Some Preply entries carry the marker here rather than in the title. */
  location?: string;
  allDay?: boolean;
  /** Set when the app itself created the event. */
  studentId?: string;
  groupId?: string;
}

/** True when the title names one of the children. */
export function isPersonalEvent(e: TitledEvent): boolean {
  const title = `${e.summary ?? ''} ${e.description ?? ''}`;
  return personalNames().some((n) => mentionsName(title, n));
}

/**
 * True when the entry carries a marker like "preply".
 *
 * Location is included: some of those entries name the platform there and not
 * in the title. Personal NAMES are deliberately not matched against location —
 * a street or venue could share a child's name, and a false match there would
 * silently drop a real lesson.
 */
export function hasOverlappableMarker(e: TitledEvent): boolean {
  const hay = `${e.summary ?? ''} ${e.description ?? ''} ${e.location ?? ''}`.toLowerCase();
  return overlappableMarkers().some((m) => hay.includes(m));
}

/**
 * True when a lesson may be scheduled straight over this entry.
 *
 * An event the APP created is never overlappable, whatever it is called: it
 * carries its student or group, so it is a real lesson. That is the backstop if
 * a student ever shares a first name with one of the children.
 *
 * An all-day entry still blocks. A day off is a real absence, and the family
 * activities this exists for are all timed.
 */
export function isOverlappable(e: TitledEvent): boolean {
  if (e.studentId || e.groupId) return false;
  if (e.allDay) return false;
  return hasOverlappableMarker(e) || isPersonalEvent(e);
}
