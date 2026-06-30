// Data-loading helpers for the /lessons screen. Server-only; pulls lessons with
// their student/group names and shapes them for the calendar/list view.

import { db } from '@/lib/db';
import { lessons, students, groups } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';
import { listStudents } from '@/lib/students';

export interface LessonRow {
  id: string;
  type: 'individual' | 'group_session';
  status: 'pending' | 'confirmed' | 'completed' | 'rejected' | 'cancelled';
  startsAt: Date;
  endsAt: Date;
  price: number | null;
  location: string | null;
  studentName: string | null;
  groupName: string | null;
  recurrenceId: string | null;
  notes: string | null;
  needsMatch: boolean;
  source: string;
}

export interface StudentOption {
  id: string;
  name: string;
}

export interface GroupOption {
  id: string;
  name: string;
}

/**
 * Loads every lesson (newest first) with student/group names. Lessons have no
 * archive flag (only students do), so no archive filter is applied — all
 * statuses (pending/confirmed/completed/rejected/cancelled) are returned.
 */
export async function loadLessons(): Promise<LessonRow[]> {
  const rows = await db
    .select({
      id: lessons.id,
      type: lessons.type,
      status: lessons.status,
      startsAt: lessons.startsAt,
      endsAt: lessons.endsAt,
      price: lessons.price,
      location: lessons.location,
      studentName: students.name,
      groupName: groups.name,
      recurrenceId: lessons.recurrenceId,
      notes: lessons.notes,
      bookedByName: lessons.bookedByName,
      needsMatch: lessons.needsMatch,
      source: lessons.source,
    })
    .from(lessons)
    .leftJoin(students, eq(lessons.studentId, students.id))
    .leftJoin(groups, eq(lessons.groupId, groups.id))
    .orderBy(desc(lessons.startsAt));

  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    status: r.status,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    price: r.price,
    location: r.location,
    studentName: r.studentName ?? r.bookedByName ?? null,
    groupName: r.groupName,
    recurrenceId: r.recurrenceId,
    notes: r.notes,
    needsMatch: r.needsMatch,
    source: r.source,
  }));
}

/** Loads active students as form options (id + name). */
export async function loadStudentOptions(): Promise<StudentOption[]> {
  const all = await listStudents();
  return all.map((s) => ({ id: s.id, name: s.name }));
}

/** Loads active groups as form options (id + name). */
export async function loadGroupOptions(): Promise<GroupOption[]> {
  const rows = await db
    .select({ id: groups.id, name: groups.name })
    .from(groups)
    .where(eq(groups.active, true))
    .orderBy(desc(groups.createdAt));
  return rows;
}
