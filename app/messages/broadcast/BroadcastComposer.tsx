'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Send, AlertCircle, CheckCircle2, Eye, RotateCcw, X } from 'lucide-react';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { RecipientPicker } from './RecipientPicker';
import { createBroadcastAction, sendBatchAction } from './actions';
import type { AudienceRow } from './types';
import { cn } from '@/lib/utils';

const NAME_TOKEN = '{שם}';
/** Recipients per request. Small enough that each round-trip stays quick. */
const BATCH_SIZE = 5;

type Phase = 'compose' | 'confirm' | 'sending' | 'done';

interface Progress {
  total: number;
  sent: number;
  failed: number;
}

export function BroadcastComposer({
  audience,
  groupNames,
}: {
  audience: AudienceRow[];
  groupNames: string[];
}) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [body, setBody] = React.useState('');
  const [phase, setPhase] = React.useState<Phase>('compose');
  const [error, setError] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState<Progress>({ total: 0, sent: 0, failed: 0 });
  const [unreachable, setUnreachable] = React.useState<string[]>([]);
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);

  const selectedRows = React.useMemo(
    () => audience.filter((s) => selected.has(s.id)),
    [audience, selected],
  );

  /** Distinct phones — the real number of messages. */
  const messageCount = React.useMemo(() => {
    const phones = new Set<string>();
    for (const s of selectedRows) {
      const p = s.guardianPhone?.trim() || s.phone?.trim();
      if (p) phones.add(p);
    }
    return phones.size;
  }, [selectedRows]);

  const previewName = selectedRows[0]?.name ?? 'נועה';
  const preview = body.split(NAME_TOKEN).join(previewName);
  const canSend = body.trim().length > 0 && messageCount > 0;

  function insertNameToken() {
    const el = bodyRef.current;
    if (!el) {
      setBody((b) => b + NAME_TOKEN);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + NAME_TOKEN + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      const caret = start + NAME_TOKEN.length;
      el.setSelectionRange(caret, caret);
    });
  }

  /*
    Drives the send from the client, one batch per request. The server sends a
    handful at a time and reports what remains, so each round-trip stays short,
    the progress bar reflects real deliveries, and losing the connection halfway
    leaves the remaining recipients pending rather than lost.
  */
  async function runSend() {
    setError(null);
    setPhase('sending');

    const created = await createBroadcastAction(body, [...selected]);
    if (!created.ok || !created.broadcastId) {
      setError(created.error ?? 'שגיאה ביצירת התפוצה');
      setPhase('compose');
      return;
    }
    setUnreachable(created.unreachable ?? []);
    setProgress({ total: created.recipientCount ?? 0, sent: 0, failed: 0 });

    let guard = 0;
    // Bounded so a server that never drains the queue cannot spin forever.
    const maxRounds = Math.ceil((created.recipientCount ?? 0) / BATCH_SIZE) + 5;
    for (;;) {
      const batch = await sendBatchAction(created.broadcastId, BATCH_SIZE);
      if (!batch.ok) {
        setError(batch.error ?? 'שגיאה בשליחה');
        break;
      }
      setProgress((p) => ({ ...p, sent: p.sent + batch.sent, failed: p.failed + batch.failed }));
      if (batch.done) break;
      if (++guard > maxRounds) {
        setError('השליחה נעצרה באמצע — אפשר להמשיך מההיסטוריה');
        break;
      }
    }
    setPhase('done');
    router.refresh();
  }

  // ── Sending / finished ────────────────────────────────────────────────
  if (phase === 'sending' || phase === 'done') {
    const pct = progress.total ? Math.round(((progress.sent + progress.failed) / progress.total) * 100) : 0;
    return (
      <Card className="shadow-pop">
        <CardBody className="space-y-5 py-10 text-center">
          <span
            className={cn(
              'mx-auto flex size-20 items-center justify-center rounded-full ring-1',
              phase === 'done'
                ? 'bg-success-soft text-success ring-success/20'
                : 'bg-primary-soft text-primary-700 ring-primary-200',
            )}
          >
            {phase === 'done' ? (
              <CheckCircle2 className="size-9" aria-hidden="true" />
            ) : (
              <Send className="size-9 animate-pulse" aria-hidden="true" />
            )}
          </span>

          <div>
            <h3 className="text-2xl font-extrabold tracking-tight text-ink">
              {phase === 'done' ? 'התפוצה הסתיימה' : 'שולח…'}
            </h3>
            <p className="mt-1 text-sm text-muted">
              {progress.sent + progress.failed} מתוך {progress.total}
            </p>
          </div>

          <div
            className="mx-auto h-2.5 w-full max-w-sm overflow-hidden rounded-full bg-primary-100"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            <Badge tone="success">נשלחו {progress.sent}</Badge>
            {progress.failed > 0 && <Badge tone="danger">נכשלו {progress.failed}</Badge>}
            {unreachable.length > 0 && (
              <Badge tone="warning">{unreachable.length} ללא טלפון</Badge>
            )}
          </div>

          {error && (
            <p role="alert" className="mx-auto max-w-sm text-sm text-danger">
              {error}
            </p>
          )}

          {phase === 'done' && (
            <Button
              variant="secondary"
              size="lg"
              onClick={() => {
                setPhase('compose');
                setSelected(new Set());
                setBody('');
                setProgress({ total: 0, sent: 0, failed: 0 });
                setUnreachable([]);
                setError(null);
              }}
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              תפוצה חדשה
            </Button>
          )}
        </CardBody>
      </Card>
    );
  }

  // ── Compose ───────────────────────────────────────────────────────────
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader variant="tint">
            <CardTitle>נמענים</CardTitle>
          </CardHeader>
          <CardBody>
            <RecipientPicker
              audience={audience}
              groupNames={groupNames}
              selected={selected}
              onChange={setSelected}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader variant="tint">
            <CardTitle>ההודעה</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            <Textarea
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={7}
              placeholder={`שלום ${NAME_TOKEN}! רציתי לעדכן ש…`}
              aria-label="תוכן ההודעה"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={insertNameToken}>
                הוספת {NAME_TOKEN}
              </Button>
              <span className="text-xs text-muted">{body.length} תווים</span>
            </div>

            <div className="rounded-2xl border border-line bg-white/70 p-3.5">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary-700">
                <Eye className="size-3.5" aria-hidden="true" />
                תצוגה מקדימה — {previewName}
              </p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
                {preview || <span className="text-muted">ההודעה תופיע כאן…</span>}
              </p>
            </div>

            {error && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-3 text-sm text-danger"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {error}
              </p>
            )}

            <Button
              type="button"
              variant="ink"
              size="lg"
              className="w-full"
              disabled={!canSend}
              onClick={() => setPhase('confirm')}
            >
              <Send className="size-4" aria-hidden="true" />
              שליחה ל-{messageCount} נמענים
            </Button>
          </CardBody>
        </Card>
      </div>

      {phase === 'confirm' && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <button
            type="button"
            aria-label="סגירה"
            className="absolute inset-0 bg-ink opacity-40 backdrop-blur-sm"
            onClick={() => setPhase('compose')}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="glass-strong relative z-10 w-full max-w-md rounded-t-3xl p-6 shadow-pop animate-scale-in sm:rounded-3xl"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <h3 id="confirm-title" className="text-xl font-extrabold tracking-tight text-ink">
                לשלוח ל-{messageCount} נמענים?
              </h3>
              <button
                type="button"
                onClick={() => setPhase('compose')}
                aria-label="סגירה"
                className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-white hover:text-ink"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>

            <p className="text-sm leading-relaxed text-muted">
              {selected.size} תלמידים נבחרו, ויישלחו <strong className="text-ink">{messageCount}</strong>{' '}
              הודעות — אחים שחולקים מספר מקבלים הודעה אחת.
            </p>
            <p className="mt-2 text-sm font-semibold text-danger">
              אי אפשר לבטל הודעות שנשלחו.
            </p>

            <div className="mt-4 max-h-40 overflow-y-auto rounded-2xl border border-line bg-white/70 p-3.5">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{preview}</p>
            </div>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
              <Button
                variant="ghost"
                size="lg"
                className="sm:flex-1"
                onClick={() => setPhase('compose')}
              >
                ביטול
              </Button>
              <Button variant="ink" size="lg" className="sm:flex-[2]" onClick={runSend}>
                <Send className="size-4" aria-hidden="true" />
                שליחה עכשיו
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
