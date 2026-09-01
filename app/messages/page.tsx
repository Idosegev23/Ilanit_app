import type * as React from 'react';
import { listConversations } from '@/lib/messages';
import Link from 'next/link';
import { Megaphone } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { MessagesView } from './MessagesView';

// In-app WhatsApp INBOX. Server-fetches the initial conversation list (grouped by
// student), then hands off to the client inbox which polls for new messages and
// delivery/read status, and sends free-text messages from the system.

export const dynamic = 'force-dynamic';
export const metadata = { title: 'הודעות — אילנית' };

export default async function MessagesPage() {
  const conversations = await listConversations();

  return (
    <div className="stagger space-y-6">
      <PageHeader
        title="הודעות"
        subtitle="התכתבות בוואטסאפ עם התלמידים — שליחה, קבלה, וסטטוס נשלח/נמסר/נקרא."
        actions={
          <Link
            href="/messages/broadcast"
            className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-fg shadow-glow transition hover:-translate-y-px hover:bg-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
          >
            <Megaphone className="size-4" aria-hidden="true" />
            תפוצה
          </Link>
        }
      />
      <div style={{ ['--i' as string]: 1 } as React.CSSProperties}>
        <MessagesView initialConversations={conversations} />
      </div>
    </div>
  );
}
