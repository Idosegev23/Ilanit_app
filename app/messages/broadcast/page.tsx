import type * as React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { loadAudience, listBroadcasts } from '@/lib/broadcast';
import { BroadcastComposer } from './BroadcastComposer';
import { BroadcastHistory } from './BroadcastHistory';
import type { AudienceRow } from './types';

// Bulk WhatsApp. Recipients are selected per student but delivered per PHONE,
// so siblings under one guardian number receive a single message.

export const dynamic = 'force-dynamic';
export const metadata = { title: 'תפוצה — אילנית' };

export default async function BroadcastPage() {
  const [audience, broadcasts] = await Promise.all([loadAudience(), listBroadcasts()]);

  // Dates cannot cross into a client component, so they travel as ISO strings.
  const rows: AudienceRow[] = audience.map((a) => ({
    id: a.id,
    name: a.name,
    phone: a.phone,
    guardianName: a.guardianName,
    guardianPhone: a.guardianPhone,
    archived: a.archived,
    groups: a.groups,
    nextLessonAt: a.nextLessonAt ? a.nextLessonAt.toISOString() : null,
    lastLessonAt: a.lastLessonAt ? a.lastLessonAt.toISOString() : null,
  }));

  const groupNames = [...new Set(audience.flatMap((a) => a.groups))].sort((x, y) =>
    x.localeCompare(y, 'he'),
  );

  return (
    <div className="stagger space-y-6">
      <PageHeader
        eyebrow="הודעות"
        title="תפוצה"
        subtitle="שליחת הודעה לכמה תלמידים בבת אחת — עם סינון, מיון ותצוגה מקדימה."
        actions={
          <Link
            href="/messages"
            className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-white/70 px-4 text-sm font-semibold text-ink transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
          >
            <ArrowRight className="size-4" aria-hidden="true" />
            חזרה לשיחות
          </Link>
        }
      />
      <div style={{ ['--i' as string]: 1 } as React.CSSProperties}>
        <BroadcastComposer audience={rows} groupNames={groupNames} />
      </div>
      <div style={{ ['--i' as string]: 2 } as React.CSSProperties}>
        <BroadcastHistory
          broadcasts={broadcasts.map((b) => ({
            id: b.id,
            body: b.body,
            status: b.status,
            totalCount: b.totalCount,
            sentCount: b.sentCount,
            failedCount: b.failedCount,
            createdAt: b.createdAt.toISOString(),
          }))}
        />
      </div>
    </div>
  );
}
