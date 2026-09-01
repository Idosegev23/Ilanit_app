'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { History, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { retryFailuresAction, sendBatchAction } from './actions';

export interface BroadcastRow {
  id: string;
  body: string;
  status: 'draft' | 'sending' | 'done';
  totalCount: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
}

/*
  Past broadcasts, and the recovery path for the ones that did not fully land.
  "Retry" flips only the FAILED recipients back to pending and drains them —
  everyone who already received the message is untouched, which is the whole
  reason delivery state lives per recipient rather than per broadcast.
*/
export function BroadcastHistory({ broadcasts }: { broadcasts: BroadcastRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);

  async function retry(id: string) {
    setBusy(id);
    try {
      const res = await retryFailuresAction(id);
      if (res.ok && res.requeued > 0) {
        for (;;) {
          const batch = await sendBatchAction(id, 5);
          if (!batch.ok || batch.done) break;
        }
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (broadcasts.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="עוד לא נשלחו תפוצות"
        description="תפוצות שתשלחי יופיעו כאן, עם מי קיבל ומה נכשל."
      />
    );
  }

  return (
    <Card>
      <CardHeader variant="tint">
        <CardTitle>תפוצות קודמות</CardTitle>
      </CardHeader>
      <CardBody className="space-y-2.5">
        {broadcasts.map((b) => (
          <div
            key={b.id}
            className="rounded-2xl border border-line bg-white/70 p-3.5"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="line-clamp-2 min-w-0 flex-1 text-sm leading-relaxed text-ink">
                {b.body}
              </p>
              <span className="shrink-0 text-xs tabular-nums text-muted" dir="ltr">
                {new Date(b.createdAt).toLocaleDateString('he-IL')}
              </span>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <Badge tone="success">
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
                {b.sentCount} נשלחו
              </Badge>
              {b.failedCount > 0 && (
                <Badge tone="danger">
                  <AlertCircle className="size-3.5" aria-hidden="true" />
                  {b.failedCount} נכשלו
                </Badge>
              )}
              {b.status === 'sending' && <Badge tone="warning">בשליחה</Badge>}
              {b.failedCount > 0 && (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busy === b.id}
                  onClick={() => retry(b.id)}
                  className="ms-auto"
                >
                  <RefreshCw className="size-3.5" aria-hidden="true" />
                  שליחה חוזרת לכושלים
                </Button>
              )}
            </div>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}
