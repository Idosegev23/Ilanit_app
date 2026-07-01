import { db } from '@/lib/db';
import { students, type Student } from '@/db/schema';
import { and, eq, isNull, isNotNull, or } from 'drizzle-orm';
import { getAvatar } from '@/lib/whatsapp/provider';
import { contactPhoneFor } from '@/lib/students';

// Pulls WhatsApp profile pictures for students by phone (GreenAPI getAvatar) and
// caches the URL on the student. This is an OUTBOUND call, so it works without
// the inbound webhook. URLs are refreshed lazily (never-fetched first).

/** Fetches + caches the WhatsApp avatar for one student (by contact phone). */
export async function refreshAvatarFor(
  student: Pick<Student, 'id' | 'phone' | 'guardianPhone'>,
): Promise<string | null> {
  const phone = contactPhoneFor(student);
  if (!phone) return null;
  const { url } = await getAvatar(phone);
  await db
    .update(students)
    .set({ avatarUrl: url, avatarFetchedAt: new Date() })
    .where(eq(students.id, student.id));
  return url;
}

/**
 * Refreshes avatars for up to `limit` students that have never been fetched yet
 * (avatarFetchedAt IS NULL) and have some contact phone. Returns how many were
 * processed. Sequential to stay gentle on GreenAPI rate limits.
 */
export async function refreshMissingAvatars(limit = 25): Promise<number> {
  const rows = await db
    .select({
      id: students.id,
      phone: students.phone,
      guardianPhone: students.guardianPhone,
    })
    .from(students)
    .where(
      and(
        isNull(students.avatarFetchedAt),
        or(isNotNull(students.phone), isNotNull(students.guardianPhone)),
      ),
    )
    .limit(limit);

  let n = 0;
  for (const s of rows) {
    await refreshAvatarFor(s);
    n += 1;
  }
  return n;
}
