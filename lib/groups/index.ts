import { db } from '@/lib/db';
import {
  groups,
  groupMembers,
  groupBilling,
  students,
  receipts,
  type Group,
  type NewGroup,
  type GroupMember,
  type GroupBilling,
} from '@/db/schema';
import { and, asc, desc, eq } from 'drizzle-orm';
import { getSettings } from '@/lib/settings';
import { getStudent } from '@/lib/students';
import { createReceipt } from '@/lib/morning';
import { notify } from '@/lib/notifications/dispatch';
import { sendFileByUrl } from '@/lib/whatsapp/provider';
import { env } from '@/lib/env';
import { toILMonthStr } from '@/lib/groups/month';

// ─────────────────────────────────────────────────────────────────────────────
// Learning groups: group CRUD, membership management, prepaid monthly billing,
// payment confirmation (→ Morning receipt + Blob PDF + WhatsApp attachment), and
// the monthly billing roster. Money is integer shekels. Cross-module providers
// (morning, whatsapp, notifications) are mocked in unit tests.
// ─────────────────────────────────────────────────────────────────────────────

export interface GroupWithCount extends Group {
  memberCount: number;
}

/** Lists groups (active first, newest within), with active-member counts. */
export async function listGroups(includeInactive = false): Promise<GroupWithCount[]> {
  const rows = includeInactive
    ? await db.select().from(groups).orderBy(desc(groups.active), desc(groups.createdAt))
    : await db
        .select()
        .from(groups)
        .where(eq(groups.active, true))
        .orderBy(desc(groups.createdAt));

  const result: GroupWithCount[] = [];
  for (const g of rows) {
    const members = await db
      .select({ id: groupMembers.id })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, g.id), eq(groupMembers.active, true)));
    result.push({ ...g, memberCount: members.length });
  }
  return result;
}

/** Returns a single group by id, or null. */
export async function getGroup(id: string): Promise<Group | null> {
  const rows = await db.select().from(groups).where(eq(groups.id, id)).limit(1);
  return rows[0] ?? null;
}

export interface CreateGroupInput {
  name: string;
  monthlyPrice: number; // ₪ integer
  location: string;
  description?: string;
}

/** Creates a group. Monthly price is normalized to integer shekels. */
export async function createGroup(input: CreateGroupInput): Promise<Group> {
  const name = input.name.trim();
  const location = input.location.trim();
  if (!name) throw new Error('group name is required');
  if (!location) throw new Error('group location is required');
  if (!Number.isFinite(input.monthlyPrice) || input.monthlyPrice < 0) {
    throw new Error('monthlyPrice must be a non-negative integer (shekels)');
  }

  const values: NewGroup = {
    name,
    monthlyPrice: Math.round(input.monthlyPrice),
    location,
    description: input.description?.trim() || null,
  };
  const inserted = await db.insert(groups).values(values).returning();
  return inserted[0];
}

export type UpdateGroupPatch = Partial<{
  name: string;
  monthlyPrice: number;
  location: string;
  description: string | null;
  active: boolean;
}>;

/** Applies a partial patch to a group. */
export async function updateGroup(id: string, patch: UpdateGroupPatch): Promise<Group> {
  const set: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error('group name is required');
    set.name = name;
  }
  if (patch.location !== undefined) {
    const location = patch.location.trim();
    if (!location) throw new Error('group location is required');
    set.location = location;
  }
  if (patch.monthlyPrice !== undefined) {
    if (!Number.isFinite(patch.monthlyPrice) || patch.monthlyPrice < 0) {
      throw new Error('monthlyPrice must be a non-negative integer (shekels)');
    }
    set.monthlyPrice = Math.round(patch.monthlyPrice);
  }
  if (patch.description !== undefined) {
    set.description = patch.description?.trim() || null;
  }
  if (patch.active !== undefined) set.active = patch.active;

  if (Object.keys(set).length === 0) {
    const current = await getGroup(id);
    if (!current) throw new Error(`group not found: ${id}`);
    return current;
  }

  const updated = await db.update(groups).set(set).where(eq(groups.id, id)).returning();
  if (!updated[0]) throw new Error(`group not found: ${id}`);
  return updated[0];
}

export interface GroupMemberRow {
  membershipId: string;
  studentId: string;
  name: string;
  phone: string;
  active: boolean;
  joinedAt: Date;
}

/** Lists members of a group (active first), joined to student details. */
export async function listMembers(
  groupId: string,
  includeInactive = false,
): Promise<GroupMemberRow[]> {
  const base = db
    .select({
      membershipId: groupMembers.id,
      studentId: students.id,
      name: students.name,
      phone: students.phone,
      active: groupMembers.active,
      joinedAt: groupMembers.joinedAt,
    })
    .from(groupMembers)
    .innerJoin(students, eq(groupMembers.studentId, students.id));

  const rows = includeInactive
    ? await base.where(eq(groupMembers.groupId, groupId)).orderBy(asc(students.name))
    : await base
        .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.active, true)))
        .orderBy(asc(students.name));

  return rows;
}

/**
 * Adds a student to a group. Idempotent: if a membership row already exists it
 * is re-activated rather than duplicated (the (group, student) pair is unique).
 */
export async function addMember(groupId: string, studentId: string): Promise<GroupMember> {
  const existing = await db
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.studentId, studentId)))
    .limit(1);

  if (existing[0]) {
    if (existing[0].active) return existing[0];
    const reactivated = await db
      .update(groupMembers)
      .set({ active: true })
      .where(eq(groupMembers.id, existing[0].id))
      .returning();
    return reactivated[0];
  }

  const inserted = await db
    .insert(groupMembers)
    .values({ groupId, studentId, active: true })
    .returning();
  return inserted[0];
}

/**
 * Removes a student from a group by deactivating the membership (soft remove,
 * preserving billing history). Returns true if a membership was deactivated.
 */
export async function removeMember(groupId: string, studentId: string): Promise<boolean> {
  const updated = await db
    .update(groupMembers)
    .set({ active: false })
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.studentId, studentId)))
    .returning({ id: groupMembers.id });
  return updated.length > 0;
}

// ── Monthly billing ──────────────────────────────────────────────────────────

/**
 * Normalizes a month argument to a first-of-month `yyyy-MM-01` date string used
 * as the `group_billing.month` key. Accepts `yyyy-MM` or any `yyyy-MM-dd`.
 */
function normalizeMonth(monthISO: string): string {
  const m = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(monthISO.trim());
  if (!m) throw new Error(`invalid month: ${monthISO} (expected yyyy-MM)`);
  return `${m[1]}-${m[2]}-01`;
}

/**
 * Generates prepaid monthly billing rows for every active member of every
 * active group, for the given month. Amount is a snapshot of the group's
 * monthly price. Idempotent: existing (group, student, month) rows are skipped
 * (the unique index guarantees no duplicates). Each newly-billed member gets a
 * WhatsApp group-billing message, and Ilanit gets a roster link per group.
 * Returns the number of billing rows created.
 */
export async function generateMonthlyBilling(monthISO: string): Promise<{ created: number }> {
  const month = normalizeMonth(monthISO);
  const monthLabel = toILMonthStr(month);
  const appUrl = env().NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  const ilanitPhone = env().ILANIT_PHONE;

  const activeGroups = await db.select().from(groups).where(eq(groups.active, true));

  let created = 0;
  for (const group of activeGroups) {
    const members = await db
      .select({
        studentId: students.id,
        name: students.name,
        phone: students.phone,
      })
      .from(groupMembers)
      .innerJoin(students, eq(groupMembers.studentId, students.id))
      .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.active, true)));

    let groupCreated = 0;
    for (const member of members) {
      const existing = await db
        .select({ id: groupBilling.id })
        .from(groupBilling)
        .where(
          and(
            eq(groupBilling.groupId, group.id),
            eq(groupBilling.studentId, member.studentId),
            eq(groupBilling.month, month),
          ),
        )
        .limit(1);
      if (existing[0]) continue;

      const inserted = await db
        .insert(groupBilling)
        .values({
          groupId: group.id,
          studentId: member.studentId,
          month,
          amount: group.monthlyPrice,
          status: 'due',
        })
        .returning();
      const billing = inserted[0];
      created += 1;
      groupCreated += 1;

      // Notify the member (idempotent via message-log keyed by billing id).
      await notify(
        'group_billing_member',
        member.phone,
        {
          studentName: member.name,
          groupName: group.name,
          month: monthLabel,
          amount: group.monthlyPrice,
        },
        `group_billing:${billing.id}`,
      );
    }

    // Roster link to Ilanit, once per group that had any new billing this month.
    if (groupCreated > 0) {
      const rosterUrl = `${appUrl}/groups/${group.id}/billing/${month.slice(0, 7)}`;
      await notify(
        'group_roster_ilanit',
        ilanitPhone,
        { groupName: group.name, month: monthLabel, rosterUrl },
        `group_roster:${group.id}:${month}`,
      );
    }
  }

  return { created };
}

/**
 * Marks a monthly group-billing row as paid: produces a Morning receipt (PDF on
 * Blob), records a `receipts` row linked to the billing, sends the PDF to the
 * member as a WhatsApp attachment, and links the receipt back onto the billing.
 * Idempotent: a billing row already `paid` is a no-op.
 */
export async function markBillingPaid(billingId: string, method?: string): Promise<void> {
  const rows = await db
    .select()
    .from(groupBilling)
    .where(eq(groupBilling.id, billingId))
    .limit(1);
  const billing = rows[0];
  if (!billing) throw new Error(`group billing not found: ${billingId}`);
  if (billing.status === 'paid') return; // idempotent

  const normalizedMethod = normalizeMethod(method);
  const group = await getGroup(billing.groupId);
  const student = await getStudent(billing.studentId);
  if (!group) throw new Error(`group not found: ${billing.groupId}`);
  if (!student) throw new Error(`student not found: ${billing.studentId}`);

  const settings = await getSettings();
  const docType = settings.morningDocType ?? 'receipt';
  const monthLabel = toILMonthStr(billing.month);

  // Morning receipt → official doc + PDF on Blob.
  const receipt = await createReceipt({
    clientName: student.name,
    clientPhone: student.phone,
    amount: billing.amount,
    description: `תשלום חודשי — קבוצת "${group.name}" (${monthLabel})`,
    method: normalizedMethod,
  });

  // Persist the receipt copy (kept in the student's client file via group billing).
  const insertedReceipt = await db
    .insert(receipts)
    .values({
      groupBillingId: billing.id,
      morningDocId: receipt.docId,
      morningDocNumber: receipt.docNumber,
      docType,
      amount: billing.amount,
      pdfUrl: receipt.pdfUrl,
      status: 'created',
    })
    .returning();
  const receiptRow = insertedReceipt[0];

  // Mark billing paid + link receipt.
  await db
    .update(groupBilling)
    .set({
      status: 'paid',
      method: normalizedMethod,
      paidAt: new Date(),
      receiptId: receiptRow.id,
    })
    .where(eq(groupBilling.id, billing.id));

  // Send the receipt PDF as a real WhatsApp attachment to the member.
  const filename = `receipt-${receipt.docNumber}.pdf`;
  const caption = `קבלה עבור התשלום החודשי לקבוצת "${group.name}" (${monthLabel}). תודה!`;
  const sent = await sendFileByUrl(student.phone, receipt.pdfUrl, filename, caption);

  await db
    .update(receipts)
    .set(
      sent.ok
        ? { status: 'sent', sentAt: new Date() }
        : { status: 'failed' },
    )
    .where(eq(receipts.id, receiptRow.id));
}

/** Marks a billing row unpaid again (roster correction). No external side-effects. */
export async function markBillingUnpaid(billingId: string): Promise<void> {
  const rows = await db
    .select({ id: groupBilling.id })
    .from(groupBilling)
    .where(eq(groupBilling.id, billingId))
    .limit(1);
  if (!rows[0]) throw new Error(`group billing not found: ${billingId}`);
  await db
    .update(groupBilling)
    .set({ status: 'due', method: null, paidAt: null })
    .where(eq(groupBilling.id, billingId));
}

export interface RosterEntry {
  billingId: string;
  studentId: string;
  name: string;
  status: string;
  amount: number;
}

/**
 * Returns the billing roster for a group in a month: one entry per billed
 * member with their payment status and amount.
 */
export async function rosterFor(groupId: string, monthISO: string): Promise<RosterEntry[]> {
  const month = normalizeMonth(monthISO);
  const rows = await db
    .select({
      billingId: groupBilling.id,
      studentId: students.id,
      name: students.name,
      status: groupBilling.status,
      amount: groupBilling.amount,
    })
    .from(groupBilling)
    .innerJoin(students, eq(groupBilling.studentId, students.id))
    .where(and(eq(groupBilling.groupId, groupId), eq(groupBilling.month, month)))
    .orderBy(asc(students.name));
  return rows;
}

type PaymentMethod = 'bit' | 'cash' | 'transfer' | 'other';

function normalizeMethod(method?: string): PaymentMethod | undefined {
  if (!method) return undefined;
  return (['bit', 'cash', 'transfer', 'other'] as const).includes(method as PaymentMethod)
    ? (method as PaymentMethod)
    : 'other';
}
