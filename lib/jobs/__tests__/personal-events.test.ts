import { describe, it, expect } from 'vitest';
import { isNonTeachingEvent } from '@/lib/jobs/calendar-scan';

/*
  לביא and גאי are Ilanit's own children. Their activities sit in the same
  calendar the scan reads, so every week it found "גאי כדורסל", could not
  attribute it to a student, and asked her who it was for. The answer never
  changes.

  The risk in filtering by name is the opposite failure: silently dropping a
  real lesson. So the match is whole-word, and an event the app itself created
  is never dropped no matter what it is called.
*/
const ev = (over: Record<string, unknown> = {}) => ({
  id: 'e1',
  summary: '',
  endISO: '2026-09-22T12:00:00.000Z',
  ...over,
}) as Parameters<typeof isNonTeachingEvent>[0];

describe('personal calendar events', () => {
  it('skips the children’s own activities', () => {
    expect(isNonTeachingEvent(ev({ summary: 'גאי כדורסל' }))).toBe(true);
    expect(isNonTeachingEvent(ev({ summary: 'גאי שחמט' }))).toBe(true);
    expect(isNonTeachingEvent(ev({ summary: 'פסנתר לביא' }))).toBe(true);
    expect(isNonTeachingEvent(ev({ summary: 'עידו ולביא כנס מחוננים' }))).toBe(true);
  });

  it('still imports a real lesson', () => {
    expect(isNonTeachingEvent(ev({ summary: 'שיעור – מילנה' }))).toBe(false);
    expect(isNonTeachingEvent(ev({ summary: 'שיעור – אוריאן רותי זגורי' }))).toBe(false);
  });

  it('matches a whole word, not a fragment', () => {
    // A name buried inside a longer Hebrew word must not drop the event.
    expect(isNonTeachingEvent(ev({ summary: 'שיעור – גאיה לוי' }))).toBe(false);
    expect(isNonTeachingEvent(ev({ summary: 'שיעור – לביאה כהן' }))).toBe(false);
  });

  it('never drops an event the app itself created', () => {
    /*
      The last line of defence: if a student really were called גאי, their
      lesson still carries its studentId and is imported regardless.
    */
    expect(isNonTeachingEvent(ev({ summary: 'שיעור – גאי', studentId: 'stu-1' }))).toBe(false);
    expect(isNonTeachingEvent(ev({ summary: 'גאי כדורסל', groupId: 'grp-1' }))).toBe(false);
  });

  it('keeps the existing rules', () => {
    expect(isNonTeachingEvent(ev({ summary: 'Preply lesson - Rie O.' }))).toBe(true);
    expect(isNonTeachingEvent(ev({ summary: 'חופשה', allDay: true }))).toBe(true);
  });
});
