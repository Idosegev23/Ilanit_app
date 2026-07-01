'use client';

import * as React from 'react';
import {
  Send,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  MessageCircle,
  ChevronRight,
  Loader2,
  Search,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { Conversation, ChatMessage } from '@/lib/messages';
import type { MessageStatus } from '@/lib/message-log';
import {
  fetchConversations,
  fetchThread,
  sendMessageAction,
  refreshAvatarsAction,
} from './actions';

const POLL_MS = 8000;

const AVATAR_TONES = [
  'bg-primary-soft text-primary-600',
  'bg-accent-soft text-accent-text',
  'bg-success-soft text-success',
  'bg-warning-soft text-warning',
] as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2);
  return parts[0][0] + parts[parts.length - 1][0];
}
function toneFor(name: string): string {
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  return AVATAR_TONES[sum % AVATAR_TONES.length];
}

/** WhatsApp profile picture with an initials fallback. */
function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className="size-10 shrink-0 rounded-xl object-cover shadow-soft"
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold shadow-soft',
        toneFor(name),
      )}
    >
      {initials(name)}
    </span>
  );
}
function timeLabel(iso: string): string {
  try {
    return new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit' }).format(
      new Date(iso),
    );
  } catch {
    return '';
  }
}
function dayLabel(iso: string): string {
  try {
    return new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short' }).format(
      new Date(iso),
    );
  } catch {
    return '';
  }
}

/** Delivery ticks for an OUTBOUND message. */
function StatusTicks({ status }: { status: MessageStatus }) {
  if (status === 'pending')
    return <Clock className="size-3.5 text-primary-fg/70" aria-label="ממתין" />;
  if (status === 'failed')
    return <AlertCircle className="size-3.5 text-danger" aria-label="שליחה נכשלה" />;
  if (status === 'sent')
    return <Check className="size-3.5 text-primary-fg/70" aria-label="נשלח" />;
  if (status === 'delivered')
    return <CheckCheck className="size-3.5 text-primary-fg/70" aria-label="נמסר" />;
  // read
  return <CheckCheck className="size-3.5 text-sky-300" aria-label="נקרא" />;
}

export function MessagesView({
  initialConversations,
}: {
  initialConversations: Conversation[];
}) {
  const [conversations, setConversations] = React.useState<Conversation[]>(initialConversations);
  const [query, setQuery] = React.useState('');
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [thread, setThread] = React.useState<{
    name: string;
    avatarUrl: string | null;
    messages: ChatMessage[];
  } | null>(null);
  const [loadingThread, setLoadingThread] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const selectedIdRef = React.useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  const filtered = React.useMemo(() => {
    const q = query.trim();
    if (!q) return conversations;
    return conversations.filter(
      (c) => c.name.includes(q) || c.contactPhone.includes(q.replace(/[\s-]/g, '')),
    );
  }, [conversations, query]);

  const refreshThread = React.useCallback(async (id: string) => {
    const t = await fetchThread(id);
    if (selectedIdRef.current === id) setThread(t);
  }, []);

  async function openConversation(id: string) {
    setSelectedId(id);
    setError(null);
    setLoadingThread(true);
    setThread(null);
    try {
      const t = await fetchThread(id);
      if (selectedIdRef.current === id) setThread(t);
    } finally {
      setLoadingThread(false);
    }
  }

  // Poll the list (and the open thread) for new messages + status changes.
  React.useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const list = await fetchConversations();
        setConversations(list);
        const id = selectedIdRef.current;
        if (id) await refreshThread(id);
      } catch {
        /* transient — next tick retries */
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [refreshThread]);

  // On mount, pull WhatsApp avatars for students without one cached, then refresh
  // the list so their pictures appear.
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const n = await refreshAvatarsAction();
        if (!cancelled && n > 0) setConversations(await fetchConversations());
      } catch {
        /* non-fatal */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-scroll to the newest message.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread?.messages.length, selectedId]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !selectedId || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await sendMessageAction(selectedId, text);
      if (!res.ok) {
        setError(res.error ?? 'שליחה נכשלה');
        return;
      }
      setDraft('');
      await refreshThread(selectedId);
      setConversations(await fetchConversations());
    } catch {
      setError('שגיאה בשליחה');
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="grid h-[calc(100vh-16rem)] min-h-[28rem] grid-cols-1 lg:grid-cols-[22rem_1fr]">
        {/* ── Conversations list ── */}
        <aside
          className={cn(
            'flex min-h-0 flex-col border-line lg:border-e',
            selectedId ? 'hidden lg:flex' : 'flex',
          )}
        >
          <div className="shrink-0 border-b border-line p-3">
            <div className="relative">
              <Search
                className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="חיפוש שיחה…"
                className="pe-10"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
                <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft/60 text-primary-600">
                  <MessageCircle className="size-6" aria-hidden="true" />
                </span>
                <p className="text-sm font-medium text-ink">אין שיחות עדיין</p>
                <p className="text-xs leading-relaxed text-muted">
                  הודעות שנשלחות לתלמידים (ותשובות שלהם) יופיעו כאן.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-line/70">
                {filtered.map((c) => {
                  const isSel = c.studentId === selectedId;
                  return (
                    <li key={c.studentId}>
                      <button
                        type="button"
                        onClick={() => openConversation(c.studentId)}
                        className={cn(
                          'flex w-full items-center gap-3 px-3.5 py-3 text-start transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                          isSel ? 'bg-primary-50' : 'hover:bg-surface-2/60',
                        )}
                      >
                        <Avatar name={c.name} url={c.avatarUrl} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate font-semibold text-ink">{c.name}</span>
                            <span className="shrink-0 text-[11px] tabular-nums text-muted">
                              {timeLabel(c.lastAt)}
                            </span>
                          </span>
                          <span className="mt-0.5 flex items-center gap-1.5">
                            <span className="truncate text-xs text-muted">
                              {c.lastDirection === 'out' ? 'את/ה: ' : ''}
                              {c.lastBody}
                            </span>
                            {c.inbound > 0 && c.lastDirection === 'in' && (
                              <span className="ms-auto flex size-2 shrink-0 rounded-full bg-primary" aria-label="הודעה נכנסת" />
                            )}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* ── Thread ── */}
        <section
          className={cn(
            'flex min-h-0 flex-col bg-surface-2/30',
            selectedId ? 'flex' : 'hidden lg:flex',
          )}
        >
          {!selectedId ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <span className="flex size-16 items-center justify-center rounded-2xl bg-primary-soft text-primary-600 shadow-soft">
                <MessageCircle className="size-8" aria-hidden="true" />
              </span>
              <p className="text-sm text-muted">בחרי שיחה כדי לראות את ההתכתבות ולשלוח הודעה.</p>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="flex shrink-0 items-center gap-3 border-b border-line bg-surface px-4 py-3">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(null);
                    setThread(null);
                  }}
                  aria-label="חזרה לרשימה"
                  className="flex size-9 items-center justify-center rounded-xl text-muted hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:hidden"
                >
                  <ChevronRight className="size-5" aria-hidden="true" />
                </button>
                <Avatar name={thread?.name ?? ''} url={thread?.avatarUrl ?? null} />
                <span className="truncate font-bold text-ink">{thread?.name ?? '…'}</span>
              </div>

              {/* Messages */}
              <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
                {loadingThread ? (
                  <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    טוען…
                  </div>
                ) : thread && thread.messages.length > 0 ? (
                  thread.messages.map((m) => {
                    const out = m.direction === 'out';
                    return (
                      <div key={m.id} className={cn('flex', out ? 'justify-start' : 'justify-end')}>
                        <div
                          className={cn(
                            'max-w-[78%] rounded-2xl px-3.5 py-2 shadow-soft',
                            out
                              ? 'bg-primary text-primary-fg'
                              : 'border border-line bg-surface text-ink',
                          )}
                        >
                          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                            {m.body}
                          </p>
                          <span
                            className={cn(
                              'mt-1 flex items-center gap-1',
                              out ? 'justify-start text-primary-fg/70' : 'justify-end text-muted',
                            )}
                          >
                            <span className="text-[10px] tabular-nums">
                              {timeLabel(m.createdAt)} · {dayLabel(m.createdAt)}
                            </span>
                            {out && <StatusTicks status={m.status} />}
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-10 text-center text-sm text-muted">
                    אין הודעות עדיין — שלחי הודעה ראשונה למטה.
                  </div>
                )}
              </div>

              {/* Compose */}
              <form onSubmit={send} className="shrink-0 border-t border-line bg-surface p-3">
                {error && (
                  <div
                    role="alert"
                    className="mb-2 flex items-center gap-2 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger"
                  >
                    <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
                    {error}
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void send(e as unknown as React.FormEvent);
                      }
                    }}
                    rows={1}
                    placeholder="כתבי הודעה… (Enter לשליחה)"
                    className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  />
                  <Button type="submit" loading={sending} className="shrink-0" aria-label="שליחה">
                    {!sending && <Send className="size-4" aria-hidden="true" />}
                    שליחה
                  </Button>
                </div>
              </form>
            </>
          )}
        </section>
      </div>
    </Card>
  );
}
