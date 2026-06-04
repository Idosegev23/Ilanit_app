import { db } from '@/lib/db';
import {
  students,
  lessons,
  payments,
  receipts,
  groupMembers,
  groups,
  groupBilling,
  type Student,
  type NewStudent,
  type Lesson,
  type Payment,
  type Receipt,
  type GroupBilling,
} from '@/db/schema';
import { and, desc, eq, inArray } from 'drizzle-orm';

// Shared student CRUD + the full "client file" aggregation used by /students/[id].

/**
 * The phone all outbound WhatsApp for a student should go to. For children we
 * have the parent's number in `guardianPhone`; when present it wins, otherwise
 * we fall back to the student's own `phone`. Always E.164.
 *
 * This is the single source of truth for recipient routing — booking links,
 * reminders, payment requests, receipts and group billing must resolve the
 * recipient through here so a child's messages reach the guardian.
 */
export function contactPhoneFor(
  student: Pick<Student, 'phone' | 'guardianPhone'>,
): string {
  const guardian = student.guardianPhone?.trim();
  return guardian ? guardian : student.phone;
}

/** Finds a student by E.164 phone, or null. */
export async function findStudentByPhone(e164: string): Promise<Student | null> {
  const rows = await db.select().from(students).where(eq(students.phone, e164)).limit(1);
  return rows[0] ?? null;
}

/** Creates a student. */
export async function createStudent(data: NewStudent): Promise<Student> {
  const inserted = await db.insert(students).values(data).returning();
  return inserted[0];
}

/** Returns a student by id, or null. */
export async function getStudent(id: string): Promise<Student | null> {
  const rows = await db.select().from(students).where(eq(students.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Lists students (active first), newest within each group. */
export async function listStudents(includeArchived = false): Promise<Student[]> {
  if (includeArchived) {
    return db.select().from(students).orderBy(desc(students.createdAt));
  }
  return db
    .select()
    .from(students)
    .where(eq(students.archived, false))
    .orderBy(desc(students.createdAt));
}

/** Applies a partial patch to a student. */
export async function updateStudent(
  id: string,
  patch: Partial<Omit<Student, 'id' | 'createdAt'>>,
): Promise<Student> {
  const updated = await db.update(students).set(patch).where(eq(students.id, id)).returning();
  return updated[0];
}

export interface StudentMembership {
  groupId: string;
  groupName: string;
  active: boolean;
}

export interface StudentFile {
  student: Student;
  lessons: Lesson[];
  payments: Payment[];
  receipts: Receipt[];
  memberships: StudentMembership[];
  groupBilling: GroupBilling[];
}

/**
 * Aggregates a student's full client file: lessons (all statuses), payments,
 * receipt archive, group memberships, and monthly group billing.
 */
export async function studentFileData(id: string): Promise<StudentFile | null> {
  const student = await getStudent(id);
  if (!student) return null;

  const studentLessons = await db
    .select()
    .from(lessons)
    .where(eq(lessons.studentId, id))
    .orderBy(desc(lessons.startsAt));

  const lessonIds = studentLessons.map((l) => l.id);

  const studentPayments = lessonIds.length
    ? await db.select().from(payments).where(inArray(payments.lessonId, lessonIds))
    : [];

  const paymentIds = studentPayments.map((p) => p.id);

  const studentGroupBilling = await db
    .select()
    .from(groupBilling)
    .where(eq(groupBilling.studentId, id))
    .orderBy(desc(groupBilling.month));

  const billingReceiptIds = studentGroupBilling
    .map((b) => b.receiptId)
    .filter((x): x is string => !!x);

  // receipts linked either via this student's payments or their group billing
  const studentReceipts: Receipt[] = [];
  if (paymentIds.length) {
    studentReceipts.push(
      ...(await db.select().from(receipts).where(inArray(receipts.paymentId, paymentIds))),
    );
  }
  if (billingReceiptIds.length) {
    studentReceipts.push(
      ...(await db.select().from(receipts).where(inArray(receipts.id, billingReceiptIds))),
    );
  }

  const memberRows = await db
    .select({
      groupId: groupMembers.groupId,
      groupName: groups.name,
      active: groupMembers.active,
    })
    .from(groupMembers)
    .innerJoin(groups, eq(groupMembers.groupId, groups.id))
    .where(eq(groupMembers.studentId, id));

  return {
    student,
    lessons: studentLessons,
    payments: studentPayments,
    receipts: studentReceipts,
    memberships: memberRows,
    groupBilling: studentGroupBilling,
  };
}

/** Convenience: looks up an active membership row for a student in a group. */
export async function findMembership(groupId: string, studentId: string) {
  const rows = await db
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.studentId, studentId)))
    .limit(1);
  return rows[0] ?? null;
}
