import type * as React from 'react';
import { listConversations } from '@/lib/messages';
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
      />
      <div style={{ ['--i' as string]: 1 } as React.CSSProperties}>
        <MessagesView initialConversations={conversations} />
      </div>
    </div>
  );
}
