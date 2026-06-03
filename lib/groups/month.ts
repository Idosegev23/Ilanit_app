// Month helpers for group billing. The billing month key is a first-of-month
// `yyyy-MM-dd` date string (matches `group_billing.month`). For display we show
// a `MM/yyyy` label. Pure string handling — no timezone math needed because the
// month key is already a calendar date with no time component.

/** Hebrew-friendly month label, e.g. `06/2026`, from `yyyy-MM` or `yyyy-MM-dd`. */
export function toILMonthStr(monthISO: string): string {
  const m = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(monthISO.trim());
  if (!m) throw new Error(`invalid month: ${monthISO} (expected yyyy-MM)`);
  return `${m[2]}/${m[1]}`;
}

/** First-of-month date string `yyyy-MM-01` from `yyyy-MM` or `yyyy-MM-dd`. */
export function toMonthKey(monthISO: string): string {
  const m = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(monthISO.trim());
  if (!m) throw new Error(`invalid month: ${monthISO} (expected yyyy-MM)`);
  return `${m[1]}-${m[2]}-01`;
}
