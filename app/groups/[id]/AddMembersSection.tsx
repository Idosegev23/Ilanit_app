'use client';

import * as React from 'react';
import { UserPlus, User, Phone, ShieldCheck, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { addChildMemberAction, addMemberAction } from '@/app/groups/actions';

export interface AddableStudent {
  id: string;
  name: string;
  phone: string;
}

/**
 * Member-enrolment section for a group. Surfaces capacity: when the group is at
 * (or over) its `maxMembers` cap, a warning banner is shown and enrolment asks
 * for confirmation before submitting — but it is NEVER hard-blocked, so the
 * owner can override and add beyond the cap.
 *
 * The two existing flows are preserved: (1) add a NEW child by name + parent
 * phone (the registrant→student mechanism), and (2) enrol an existing student.
 */
export function AddMembersSection({
  groupId,
  activeCount,
  maxMembers,
  monthlyPriceLabel,
  addableStudents,
}: {
  groupId: string;
  activeCount: number;
  maxMembers: number;
  monthlyPriceLabel: string;
  addableStudents: AddableStudent[];
}) {
  const atCapacity = activeCount >= maxMembers;

  // When at capacity, confirm before letting the form submit (override).
  function confirmIfFull(e: React.FormEvent<HTMLFormElement>) {
    if (!atCapacity) return;
    const ok =
      typeof window === 'undefined' ||
      window.confirm(
        `הקבוצה מלאה (${activeCount}/${maxMembers}). להוסיף בכל זאת ולחרוג מהמכסה?`,
      );
    if (!ok) e.preventDefault();
  }

  return (
    <>
      {atCapacity && (
        <div
          className="flex items-start gap-2 rounded-xl border border-accent/40 bg-accent-soft/60 px-3.5 py-3 text-sm font-medium text-accent-text"
          role="alert"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            הקבוצה מלאה — {activeCount}/{maxMembers} רשומים. אפשר עדיין להוסיף, אך
            תהיה חריגה מהמכסה.
          </span>
        </div>
      )}

      {/* Primary path: add a NEW child by name + the parent's phone. Creates the
         student record (the child) with the guardian fields, so all of the
         child's WhatsApp routes to the parent's phone. */}
      <form
        action={addChildMemberAction}
        onSubmit={confirmIfFull}
        className="space-y-3 border-t border-line pt-5"
      >
        <input type="hidden" name="groupId" value={groupId} />
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary-soft text-primary-600">
            <UserPlus className="size-4" aria-hidden="true" />
          </span>
          הוספת ילד/ה לקבוצה
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="childName" required className="flex items-center gap-1.5">
              <User className="size-3.5 text-muted" aria-hidden="true" />
              שם הילד/ה
            </Label>
            <Input
              id="childName"
              name="childName"
              required
              placeholder="שם הילד/ה"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="guardianPhone" required className="flex items-center gap-1.5">
              <Phone className="size-3.5 text-muted" aria-hidden="true" />
              טלפון הורה
            </Label>
            <Input
              id="guardianPhone"
              name="guardianPhone"
              type="tel"
              dir="ltr"
              className="text-end"
              required
              placeholder="050-123-4567"
              autoComplete="tel"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="guardianName">שם הורה (אופציונלי)</Label>
          <Input
            id="guardianName"
            name="guardianName"
            placeholder="שם ההורה"
            autoComplete="off"
          />
        </div>
        <p className="flex items-start gap-1.5 text-xs text-muted">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          כל ההודעות (חיוב וקבלות) יישלחו לטלפון ההורה.
        </p>
        <Button type="submit" className="w-full sm:w-auto">
          <UserPlus className="size-4" aria-hidden="true" />
          הוספת הילד/ה
        </Button>
      </form>

      {/* Secondary path: enrol an existing student record. */}
      {addableStudents.length > 0 && (
        <form
          action={addMemberAction}
          onSubmit={confirmIfFull}
          className="flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-end"
        >
          <input type="hidden" name="groupId" value={groupId} />
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="studentId">או: הוספת תלמיד/ה קיים/ת</Label>
            <Select id="studentId" name="studentId" defaultValue="">
              <option value="" disabled>
                בחרי תלמיד/ה…
              </option>
              {addableStudents.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.phone})
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" variant="secondary" className="sm:w-auto">
            <UserPlus className="size-4" aria-hidden="true" />
            הוספה
          </Button>
        </form>
      )}

      <p className="flex items-start gap-2 rounded-xl bg-accent-soft px-3.5 py-3 text-xs leading-relaxed text-accent-text">
        <UserPlus className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          כל חברה מחויבת <span className="font-semibold tabular-nums">{monthlyPriceLabel}</span>{' '}
          החיוב נוצר אוטומטית ב-1 לכל חודש לכל חברה פעילה.
        </span>
      </p>
    </>
  );
}
