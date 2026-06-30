// Suggests which student an imported calendar event most likely belongs to, by
// matching the event TITLE against student names. Pure + side-effect free so it
// can run on the server (assign suggestion) and be unit-tested directly.
//
// Matching is case-insensitive and order-insensitive on a per-token basis:
//   - exact (normalized) name == title              → strongest
//   - title contains the full student name (or v.v.) → strong
//   - all of the student's name tokens appear in the title (or v.v.) → good
// The first/best match wins; ties keep the earliest student in the list.

export interface NamedStudent {
  id: string;
  name: string;
}

/** Lower-cases, trims, and collapses internal whitespace. */
function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function tokens(s: string): string[] {
  return normalize(s)
    .split(' ')
    .filter((t) => t.length > 0);
}

/**
 * Scores how well a student name matches an event title. Higher is better;
 * 0 means no match. Designed to be stable and explainable rather than fuzzy.
 */
function scoreMatch(title: string, name: string): number {
  const t = normalize(title);
  const n = normalize(name);
  if (!t || !n) return 0;

  if (t === n) return 100;
  // Title contains the full student name. A longer (more specific) name that
  // also fits wins over a shorter one — e.g. "דנה כהן" beats "דנה" for the
  // title "שיעור – דנה כהן". Bonus is bounded so it never reaches the next tier.
  if (t.includes(n)) return 80 + Math.min(n.length, 9);
  if (n.includes(t)) return 70; // title is a substring of the name

  const titleTokens = tokens(title);
  const nameTokens = tokens(name);
  if (nameTokens.length === 0) return 0;

  // All of the student's name tokens appear somewhere in the title.
  const allNameInTitle = nameTokens.every((nt) => titleTokens.includes(nt));
  if (allNameInTitle) return 60;

  // All title tokens appear in the name (e.g. title is just the first name).
  const allTitleInName =
    titleTokens.length > 0 && titleTokens.every((tt) => nameTokens.includes(tt));
  if (allTitleInName) return 50;

  // Partial token overlap — at least one shared whole token.
  const shared = nameTokens.filter((nt) => titleTokens.includes(nt)).length;
  if (shared > 0) return 20 + shared;

  return 0;
}

/**
 * Returns the id of the student whose name best matches the event title, or null
 * when nothing matches. Stable: on equal scores the earliest student wins.
 */
export function suggestStudentIdForTitle(
  title: string | null | undefined,
  students: NamedStudent[],
): string | null {
  if (!title || !title.trim() || students.length === 0) return null;

  let bestId: string | null = null;
  let bestScore = 0;
  for (const s of students) {
    const score = scoreMatch(title, s.name);
    if (score > bestScore) {
      bestScore = score;
      bestId = s.id;
    }
  }
  return bestScore > 0 ? bestId : null;
}
