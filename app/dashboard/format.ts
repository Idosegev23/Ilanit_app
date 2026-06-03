// Pure presentation helpers for the dashboard (Hebrew labels + formatting).
// Kept framework-free so they can be unit-tested without rendering.

/** Hebrew labels for lesson statuses. */
export const STATUS_LABELS_HE: Record<string, string> = {
  pending: 'ממתינים',
  confirmed: 'מאושרים',
  completed: 'בוצעו',
  rejected: 'נדחו',
  cancelled: 'בוטלו',
};

/** Localized Hebrew status label (falls back to the raw key). */
export function statusLabel(status: string): string {
  return STATUS_LABELS_HE[status] ?? status;
}

/**
 * Splits raw AI insight text into clean bullet lines, stripping any leading
 * bullet/number markers. Empty lines are dropped.
 */
export function toBullets(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*([•\-*]|\d+[.)])\s*/, '').trim())
    .filter((l) => l.length > 0);
}

/**
 * Builds the "lessons by status" summary string for the KPI card, ordered by a
 * stable, human sequence (done → confirmed → pending → others).
 */
export function lessonsByStatusSummary(byStatus: Record<string, number>): string {
  const order = ['completed', 'confirmed', 'pending', 'cancelled', 'rejected'];
  const parts: string[] = [];
  for (const key of order) {
    if (byStatus[key]) parts.push(`${statusLabel(key)} ${byStatus[key]}`);
  }
  return parts.join(' · ') || 'אין שיעורים';
}

/** Formats an instant as a short Hebrew date+time (Asia/Jerusalem). */
export function formatILShort(date: Date): string {
  return new Intl.DateTimeFormat('he-IL', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Jerusalem',
  }).format(date);
}

/** Formats an instant as Hebrew weekday + time, e.g. "רביעי 16:00". */
export function formatILDayTime(date: Date): string {
  return new Intl.DateTimeFormat('he-IL', {
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jerusalem',
  }).format(date);
}
