'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  createGroup,
  updateGroup,
  addMember,
  removeMember,
  markBillingPaid,
  markBillingUnpaid,
} from '@/lib/groups';

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

export async function createGroupAction(form: FormData): Promise<void> {
  const group = await createGroup({
    name: str(form, 'name'),
    monthlyPrice: intShekels(form, 'monthlyPrice'),
    location: str(form, 'location'),
    description: str(form, 'description') || undefined,
  });
  revalidatePath('/groups');
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

export async function removeMemberAction(form: FormData): Promise<void> {
  const groupId = str(form, 'groupId');
  const studentId = str(form, 'studentId');
  await removeMember(groupId, studentId);
  revalidatePath(`/groups/${groupId}`);
}

export async function markPaidAction(form: FormData): Promise<void> {
  const billingId = str(form, 'billingId');
  const method = str(form, 'method') || undefined;
  const groupId = str(form, 'groupId');
  const month = str(form, 'month');
  await markBillingPaid(billingId, method);
  revalidatePath(`/groups/${groupId}/billing/${month}`);
}

export async function markUnpaidAction(form: FormData): Promise<void> {
  const billingId = str(form, 'billingId');
  const groupId = str(form, 'groupId');
  const month = str(form, 'month');
  await markBillingUnpaid(billingId);
  revalidatePath(`/groups/${groupId}/billing/${month}`);
}
