import { notFound } from 'next/navigation';
import type { Lesson, Payment, Receipt, GroupBilling } from '@/db/schema';
import { studentFileData } from '@/lib/students';
import { getSettings } from '@/lib/settings';
import { formatILDateTime } from '@/lib/time';
import type { StatusKind } from '@/components/ui/badge';
import { StudentFileClient, type StudentFileVM } from './student-file-client';

export const dynamic = 'force-dynamic';

function monthLabel(month: GroupBilling['month']): string {
  // month is a date string (yyyy-MM-dd, first of month).
  return String(month).slice(0, 7); // yyyy-MM
}

// Full client file: details + private-lesson price, lesson history (all
// statuses), payment history, the receipt archive (PDF download links from
// Blob), and group memberships + monthly billing. Aggregation happens here
// (RSC); data is pre-formatted into a plain serializable view-model and handed
// to the tabbed client component.
export default async function StudentFilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [file, settings] = await Promise.all([studentFileData(id), getSettings()]);
  if (!file) notFound();

  const { student, lessons, payments, receipts, memberships, groupBilling } = file;
  const paymentByLesson = new Map<string, Payment>(payments.map((p) => [p.lessonId, p]));

  const vm: StudentFileVM = {
    student: {
      id: student.id,
      name: student.name,
      phone: student.phone,
      email: student.email,
      guardianName: student.guardianName,
      guardianPhone: student.guardianPhone,
      receiptLabel: student.receiptLabel,
      defaultPrice: student.defaultPrice,
      defaultDurationMin: student.defaultDurationMin,
      notes: student.notes,
      archived: student.archived,
    },
    lessons: lessons.map((l: Lesson) => {
      const pay = paymentByLesson.get(l.id);
      return {
        id: l.id,
        when: formatILDateTime(l.startsAt),
        status: l.status as StatusKind,
        price: l.price,
        payStatus: pay ? (pay.status as StatusKind) : null,
      };
    }),
    payments: payments.map((p: Payment) => ({
      id: p.id,
      amount: p.amount,
      status: p.status as StatusKind,
      method: p.method,
      paidAt: p.paidAt ? formatILDateTime(p.paidAt) : null,
    })),
    receipts: receipts.map((r: Receipt) => ({
      id: r.id,
      number: r.morningDocNumber,
      amount: r.amount,
      pdfUrl: r.pdfUrl,
    })),
    memberships: memberships.map((m) => ({
      groupId: m.groupId,
      groupName: m.groupName,
      active: m.active,
    })),
    groupBilling: groupBilling.map((b: GroupBilling) => ({
      id: b.id,
      month: monthLabel(b.month),
      amount: b.amount,
      status: b.status as StatusKind,
    })),
    settingsDefaultPrice: settings.defaultPrivatePrice,
  };

  return <StudentFileClient file={vm} />;
}
