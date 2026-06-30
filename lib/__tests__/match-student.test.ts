import { describe, it, expect } from 'vitest';
import { suggestStudentIdForTitle } from '@/lib/match-student';

// The title-suggestion matcher used by the in-app assign dialog. Matches an
// imported event's TITLE against active student names (case-insensitive,
// token-based), preferring the strongest, most specific match.

const STUDENTS = [
  { id: 's1', name: 'דנה כהן' },
  { id: 's2', name: 'יוסי לוי' },
  { id: 's3', name: 'Maya Gold' },
];

describe('suggestStudentIdForTitle', () => {
  it('matches an exact title to the student', () => {
    expect(suggestStudentIdForTitle('דנה כהן', STUDENTS)).toBe('s1');
  });

  it('matches when the title CONTAINS the full student name', () => {
    expect(suggestStudentIdForTitle('שיעור – דנה כהן', STUDENTS)).toBe('s1');
  });

  it('matches a first-name-only title (title is a substring of the name)', () => {
    expect(suggestStudentIdForTitle('יוסי', STUDENTS)).toBe('s2');
  });

  it('is case-insensitive', () => {
    expect(suggestStudentIdForTitle('lesson with maya gold', STUDENTS)).toBe('s3');
  });

  it('matches when all name tokens appear in the title out of order', () => {
    expect(suggestStudentIdForTitle('כהן דנה — שיעור פרטי', STUDENTS)).toBe('s1');
  });

  it('returns null when nothing matches', () => {
    expect(suggestStudentIdForTitle('פגישה עם רואה חשבון', STUDENTS)).toBeNull();
  });

  it('returns null for an empty/blank title', () => {
    expect(suggestStudentIdForTitle('', STUDENTS)).toBeNull();
    expect(suggestStudentIdForTitle('   ', STUDENTS)).toBeNull();
    expect(suggestStudentIdForTitle(null, STUDENTS)).toBeNull();
  });

  it('returns null when there are no students', () => {
    expect(suggestStudentIdForTitle('דנה כהן', [])).toBeNull();
  });

  it('prefers the more specific (full-name) match over a partial token overlap', () => {
    const students = [
      { id: 'a', name: 'דנה' }, // would partially match on the token "דנה"
      { id: 'b', name: 'דנה כהן' }, // full-name contained in the title
    ];
    expect(suggestStudentIdForTitle('שיעור – דנה כהן', students)).toBe('b');
  });
});
