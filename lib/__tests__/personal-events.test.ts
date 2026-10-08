import { describe, it, expect, afterEach } from 'vitest';
import { isOverlappable, isPersonalEvent } from '@/lib/personal-events';

/*
  "גאי כדורסל", "גוצה פסנתר", "גאי שחמט" are the children's activities, and the
  Preply entries are their son's English lessons. Two consequences, and only one
  of them used to exist: such an entry must not be imported as a lesson, and a
  lesson must be bookable straight over it. The second is what kept hours
  invisible — to Ilanit when moving a lesson, and to parents on the booking page.
*/
const ORIGINAL = process.env.PERSONAL_EVENT_NAMES;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.PERSONAL_EVENT_NAMES;
  else process.env.PERSONAL_EVENT_NAMES = ORIGINAL;
});

describe('the family’s own entries can be scheduled over', () => {
  for (const summary of ['גאי כדורסל', 'גוצה פסנתר', 'גאי שחמט', 'פסנתר לביא']) {
    it(`"${summary}" does not hold a slot`, () => {
      expect(isOverlappable({ summary })).toBe(true);
      expect(isPersonalEvent({ summary })).toBe(true);
    });
  }

  it('a Preply lesson does not hold a slot either', () => {
    expect(isOverlappable({ summary: 'Preply lesson - Alexa F.' })).toBe(true);
    // …including when the platform is named in the location instead.
    expect(isOverlappable({ summary: 'שיעור', location: 'Preply' })).toBe(true);
  });

  it('an ordinary commitment still holds its slot', () => {
    expect(isOverlappable({ summary: 'פגישה אצל רופא' })).toBe(false);
    expect(isOverlappable({ summary: 'שיעור – מילנה' })).toBe(false);
  });

  it('a whole day off still blocks', () => {
    // A day away is a real absence; the family activities are all timed.
    expect(isOverlappable({ summary: 'גאי כדורסל', allDay: true })).toBe(false);
  });

  it('never frees a slot held by a real lesson', () => {
    /*
      The backstop if a student ever shares a first name with one of the
      children: an event the app created carries its student.
    */
    expect(isOverlappable({ summary: 'גאי כדורסל', studentId: 'stu-1' })).toBe(false);
    expect(isOverlappable({ summary: 'גוצה פסנתר', groupId: 'grp-1' })).toBe(false);
  });

  it('matches a whole word, not a fragment', () => {
    expect(isPersonalEvent({ summary: 'שיעור – גאיה לוי' })).toBe(false);
    expect(isPersonalEvent({ summary: 'שיעור – לביאה כהן' })).toBe(false);
    // …but a Hebrew prefix still counts as the same name.
    expect(isPersonalEvent({ summary: 'עידו וגוצה בקונצרט' })).toBe(true);
  });

  it('takes its names from configuration', () => {
    process.env.PERSONAL_EVENT_NAMES = 'דני';
    expect(isPersonalEvent({ summary: 'גאי כדורסל' })).toBe(false);
    expect(isPersonalEvent({ summary: 'דני חוג' })).toBe(true);
  });
});
