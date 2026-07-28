'use server';

// Standby approval — reached by Ilanit from the WhatsApp alert link (token is the
// authorization, no login, like /p and /m). Places the chosen waitlisted student
// on the freed slot and marks the request fulfilled + the offer filled.

import { findOpenOffer, getActiveStandby, markStandbyFilled } from '@/lib/standby';
import { placeConfirmedLesson } from '@/lib/scheduling';
import { getStudent, findStudentByPhone, createStudent } from '@/lib/students';

export interface ApproveResult {
  ok: boolean;
  error?: string;
}

export async function approveStandby(rawToken: string, standbyId: string): Promise<ApproveResult> {
  const offer = await findOpenOffer(rawToken);
  if (!offer) return { ok: false, error: 'ההצעה כבר טופלה או שאינה תקפה' };

  const standby = await getActiveStandby(standbyId);
  if (!standby) return { ok: false, error: 'הבקשה כבר טופלה או בוטלה' };

  // Resolve the student behind the standby request.
  let student = standby.studentId ? await getStudent(standby.studentId) : null;
  if (!student) {
    student =
      (await findStudentByPhone(standby.phone)) ??
      (await createStudent({ name: standby.name, phone: standby.phone, email: standby.email }));
  }

  const placed = await placeConfirmedLesson({
    student,
    startsAt: offer.startsAt,
    endsAt: offer.endsAt,
    source: 'standby',
  });
  if (!placed.ok) return { ok: false, error: placed.error ?? 'שגיאה בקביעת השיעור' };

  await markStandbyFilled(offer.id, standby.id);
  return { ok: true };
}
