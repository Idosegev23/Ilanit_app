'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  createGroupWithSchedule,
  updateGroup,
  addMember,
  addChildMember,
  removeMember,
  markBillingPaid,
  markBillingUnpaid,
  type WeeklyScheduleInput,
} from '@/lib/groups';
import { normalizePhoneIL } from '@/lib/utils';

// Server actions for the Groups UI. All form posts route through here; pages
// stay server components. Money fields are parsed to integer shekels.

function str(form: FormData, key: string): string {
  return String(form.get(key) ?? '').trim();
}

function intShekels(form: FormData, key: string): number {
  const raw = str(form, key).replace(/[^\d-]/g, '');
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`invalid amount for ${key}`);
  return Math.round(n);
}

/**
 * Creates a group, optionally with a recurring weekly session schedule. When
 * the "מפגש שבועי קבוע" fields are filled, the group's weekly sessions are
 * auto-generated (`recurrences kind=group`, not gated by open-weeks).
 */
export async function createGroupAction(form: FormData): Promise<void> {
  const weekdayRaw = str(form, 'weekday');
  const startTime = str(form, 'startTime');
  const durationRaw = str(form, 'durationMin');

  let schedule: WeeklyScheduleInput | undefined;
  // A schedule is included only when both a weekday and a start time are given.
  if (weekdayRaw !== '' && startTime) {
    const weekday = Number(weekdayRaw);
    const durationMin = durationRaw ? Number(durationRaw) : 60;
    if (!Number.isInteger(durationMin) || durationMin <= 0) {
      throw new Error('invalid session duration');
    }
    schedule = { weekday, startTime, durationMin };
  }

  const { group } = await createGroupWithSchedule(
    {
      name: str(form, 'name'),
      monthlyPrice: intShekels(form, 'monthlyPrice'),
      location: str(form, 'location'),
      description: str(form, 'description') || undefined,
    },
    schedule,
  );
  revalidatePath('/groups');
  revalidatePath('/lessons');
  redirect(`/groups/${group.id}`);
}

export async function updateGroupAction(form: FormData): Promise<void> {
  const id = str(form, 'id');
  await updateGroup(id, {
    name: str(form, 'name'),
    monthlyPrice: intShekels(form, 'monthlyPrice'),
    location: str(form, 'location'),
    description: str(form, 'description') || null,
    active: str(form, 'active') === 'on',
  });
  revalidatePath(`/groups/${id}`);
  revalidatePath('/groups');
}

export async function addMemberAction(form: FormData): Promise<void> {
  const groupId = str(form, 'groupId');
  const studentId = str(form, 'studentId');
  if (studentId) {
    await addMember(groupId, studentId);
  }
  revalidatePath(`/groups/${groupId}`);
}

/**
 * Adds a NEW child to a group by capturing the child's name + the parent
 * (guardian) phone. Creates the student record (writing the guardian fields)
 * and enrols them; all of the child's outbound WhatsApp will route to the
 * parent's phone (`contactPhoneFor`).
 */
export async function addChildMemberAction(form: FormData): Promise<void> {
  const groupId = str(form, 'groupId');
  const childName = str(form, 'childName');
  const guardianPhoneRaw = str(form, 'guardianPhone');
  const guardianName = str(form, 'guardianName') || undefined;
  if (childName && guardianPhoneRaw) {
    await addChildMember(groupId, {
      childName,
      guardianPhone: normalizePhoneIL(guardianPhoneRaw),
      guardianName,
    });
  }
  revalidatePath(`/groups/${groupId}`);
}

export async function removeMemberAction(form: FormData): Promise<void> {
  const groupId = str(form, 'groupId');
  const studentId = str(form, 'studentId');
  await removeMember(groupId, studentId);
  revalidatePath(`/groups/${groupId}`);
}

export async function markPaidAction(form: FormData): Promise<void> {
  const billingId = str(form, 'billingId');
  const method = str(form, 'method') || undefined;
  const description = str(form, 'description') || undefined;
  const groupId = str(form, 'groupId');
  const month = str(form, 'month');
  await markBillingPaid(billingId, method, description);
  revalidatePath(`/groups/${groupId}/billing/${month}`);
}

export async function markUnpaidAction(form: FormData): Promise<void> {
  const billingId = str(form, 'billingId');
  const groupId = str(form, 'groupId');
  const month = str(form, 'month');
  await markBillingUnpaid(billingId);
  revalidatePath(`/groups/${groupId}/billing/${month}`);
}
