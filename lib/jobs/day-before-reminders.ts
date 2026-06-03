import { db } from '@/lib/db';
import {
  lessons,
  students,
  groups,
  groupMembers,
  type Lesson,
} from '@/db/schema';
import { and, eq, gte, inArray, lt } from 'drizzle-orm';
import { env } from '@/lib/env';
import { getSettings } from '@/lib/settings';
import { notify } from '@/lib/notifications/dispatch';
import {
  nowIL,
  startOfDayIL,
  toILDateStr,
  toILTimeStr,
  formatILDateTime,
} from '@/lib/time';

// (א) Day-before reminders. For every lesson/group-session that starts
// TOMORROW (Asia/Jerusalem), notify the relevant recipient with a type-aware
// template and send Ilanit a single daily summary. All sends are idempotent
// via message_log (keyed by template + a stable relatedId).

export interface DayBeforeResult {
  studentReminders: number;
  groupMemberReminders: number;
  ilanitSummarySent: boolean;
}

/** Adds whole days to an instant. */
function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Sends day-before reminders for tomorrow's lessons and group sessions.
 *
 * - Individual confirmed lessons → reminder to the student (`reminder_day_before_individual`).
 * - Group sessions → reminder to every ACTIVE member (`reminder_day_before_group`).
 * - Ilanit → one summary of all of tomorrow's events (`reminder_day_before_ilanit`).
 *
 * Idempotent: a member/student reminder uses relatedId `<lessonId>:<studentId>`,
 * the Ilanit summary uses relatedId `summary:<tomorrowDate>`.
 */
export async function runDayBeforeReminders(): Promise<DayBeforeResult> {
  const settings = await getSettings();
  const ilanitPhone = env().ILANIT_PHONE;

  const now = nowIL();
  // Tomorrow's window [startOfDay(tomorrow), startOfDay(day after tomorrow))
  const tomorrowStart = startOfDayIL(addDays(now, 1));
  const dayAfterStart = startOfDayIL(addDays(now, 2));
  const tomorrowDateStr = toILDateStr(tomorrowStart);

  // Fetch tomorrow's lessons that are still live (confirmed individual lessons
  // and any group session). pending/rejected/cancelled/completed are excluded.
  const tomorrowLessons = await db
    .select()
    .from(lessons)
    .where(
      and(
        gte(lessons.startsAt, tomorrowStart),
        lt(lessons.startsAt, dayAfterStart),
        inArray(lessons.status, ['confirmed']),
      ),
    );

  let studentReminders = 0;
  let groupMemberReminders = 0;

  // Pre-fetch students referenced by individual lessons.
  const studentIds = tomorrowLessons
    .filter((l) => l.type === 'individual' && l.studentId)
    .map((l) => l.studentId as string);
  const studentRows = studentIds.length
    ? await db.select().from(students).where(inArray(students.id, studentIds))
    : [];
  const studentById = new Map(studentRows.map((s) => [s.id, s]));

  // Pre-fetch groups referenced by group sessions.
  const groupIds = tomorrowLessons
    .filter((l) => l.type === 'group_session' && l.groupId)
    .map((l) => l.groupId as string);
  const groupRows = groupIds.length
    ? await db.select().from(groups).where(inArray(groups.id, groupIds))
    : [];
  const groupById = new Map(groupRows.map((g) => [g.id, g]));

  const summaryLines: string[] = [];

  for (const lesson of tomorrowLessons) {
    const when = formatILDateTime(lesson.startsAt);
    const timeStr = toILTimeStr(lesson.startsAt);
    const location = lesson.location ?? settings.locationAddress;

    if (lesson.type === 'individual') {
      const student = lesson.studentId ? studentById.get(lesson.studentId) : undefined;
      if (student) {
        await notify(
          'reminder_day_before_individual',
          student.phone,
          { studentName: student.name, datetime: when, location },
          `${lesson.id}:${student.id}`,
          lesson.id,
        );
        studentReminders++;
        summaryLines.push(`${timeStr} — ${student.name} (פרטי)`);
      }
    } else if (lesson.type === 'group_session') {
      const group = lesson.groupId ? groupById.get(lesson.groupId) : undefined;
      if (group) {
        const members = await db
          .select({ student: students })
          .from(groupMembers)
          .innerJoin(students, eq(groupMembers.studentId, students.id))
          .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.active, true)));

        for (const { student } of members) {
          await notify(
            'reminder_day_before_group',
            student.phone,
            { studentName: student.name, groupName: group.name, datetime: when, location },
            `${lesson.id}:${student.id}`,
            lesson.id,
          );
          groupMemberReminders++;
        }
        summaryLines.push(`${timeStr} — קבוצת "${group.name}" (${members.length} חברים)`);
      }
    }
  }

  let ilanitSummarySent = false;
  if (summaryLines.length > 0) {
    const summary = summaryLines
      .sort()
      .map((line) => `• ${line}`)
      .join('\n');
    const res = await notify(
      'reminder_day_before_ilanit',
      ilanitPhone,
      { date: tomorrowDateStr, summary },
      `summary:${tomorrowDateStr}`,
    );
    ilanitSummarySent = res.ok && !res.skipped;
  }

  return { studentReminders, groupMemberReminders, ilanitSummarySent };
}

export type { Lesson };
