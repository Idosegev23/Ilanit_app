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

/** Parses maxMembers (capacity) — defaults to 6 when blank/invalid. */
function maxMembersOf(form: FormData): number {
  const raw = str(form, 'maxMembers');
  if (!raw) return 6;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return 6;
  return n;
}

/**
 * Parses the (possibly repeated) weekly schedule slot fields into an array of
 * `WeeklyScheduleInput`. The form posts parallel arrays `weekday[]`,
 * `startTime[]`, `durationMin[]` (one entry per slot row). A slot is kept only
 * when both its weekday and start time are present; blank rows are ignored so a
 * group with no schedule (or only some rows filled) still works. Each kept slot
 * becomes its own `recurrences kind=group` series (multi-day groups).
 */
function scheduleSlotsOf(form: FormData): WeeklyScheduleInput[] {
  const weekdays = form.getAll('weekday').map((v) => String(v).trim());
  const startTimes = form.getAll('startTime').map((v) => String(v).trim());
  const durations = form.getAll('durationMin').map((v) => String(v).trim());

  const slots: WeeklyScheduleInput[] = [];
  const rowCount = Math.max(weekdays.length, startTimes.length, durations.length);
  for (let i = 0; i < rowCount; i++) {
    const weekdayRaw = weekdays[i] ?? '';
    const startTime = startTimes[i] ?? '';
    const durationRaw = durations[i] ?? '';
    if (weekdayRaw === '' || !startTime) continue; // incomplete row — skip
    const weekday = Number(weekdayRaw);
    // A group session is 50 minutes; the form defaults to it, and this is the
    // fallback for a row submitted without one.
    const durationMin = durationRaw ? Number(durationRaw) : 50;
    if (!Number.isInteger(durationMin) || durationMin <= 0) {
      throw new Error('invalid session duration');
    }
    slots.push({ weekday, startTime, durationMin });
  }
  return slots;
}

/**
 * Creates a group, optionally with one OR MORE recurring weekly session slots.
 * Each filled "מפגש שבועי קבוע" row generates its own weekly group series
 * (`recurrences kind=group`, not gated by open-weeks), so a group meeting twice
 * a week lands both weekly series on the calendar.
 */
export async function createGroupAction(form: FormData): Promise<void> {
  const slots = scheduleSlotsOf(form);

  const { group } = await createGroupWithSchedule(
    {
      name: str(form, 'name'),
      monthlyPrice: intShekels(form, 'monthlyPrice'),
      location: str(form, 'location'),
      description: str(form, 'description') || undefined,
      maxMembers: maxMembersOf(form),
    },
    slots,
  );
  revalidatePath('/groups');
  revalidatePath('/lessons');
  // ?created=1 so the destination can confirm what was saved. Creating a group
  // also generates its sessions, which is too much to happen behind a redirect
  // that lands on a page looking like any other.
  redirect(`/groups/${group.id}?created=1`);
}

export async function updateGroupAction(form: FormData): Promise<void> {
  const id = str(form, 'id');
  await updateGroup(id, {
    name: str(form, 'name'),
    monthlyPrice: intShekels(form, 'monthlyPrice'),
    location: str(form, 'location'),
    description: str(form, 'description') || null,
    maxMembers: maxMembersOf(form),
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
