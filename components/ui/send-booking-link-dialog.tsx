'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import {
  Send,
  X,
  UserCheck,
  UserPlus,
  Search,
  SearchX,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Link2,
  Sparkles,
} from 'lucide-react';
import { Button } from './button';
import { Input } from './input';
import { Label } from './label';
import { cn } from '@/lib/utils';

// Popup for the owner ("שלח לינק לתיאום"). Two paths:
//   • "תלמיד קיים" — pick an existing student → WhatsApp them their personal link.
//   • "הזמנה חדשה" — create a GENERIC invite link with NO fields. Ilanit copies /
//     shares it; the recipient opens it and fills in ALL their own details (name,
//     phone, parent, optional email) before picking a slot.
// RTL Hebrew, design-system primitives, lucide icons, focus-visible, 44px targets.

export interface BookingLinkStudent {
  id: string;
  name: string;
  phone: string;
}

// Deterministic warm avatar tone + initials (matches the students directory).
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

interface SendBookingLinkDialogProps {
  students: BookingLinkStudent[];
  /** Optional trigger label. */
  triggerLabel?: string;
  triggerVariant?: 'primary' | 'secondary';
  className?: string;
}

type Tab = 'existing' | 'new';

export function SendBookingLinkDialog({
  students,
  triggerLabel = 'שלח לינק לתיאום',
  triggerVariant = 'primary',
  className,
}: SendBookingLinkDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState<Tab>(students.length > 0 ? 'existing' : 'new');

  const [query, setQuery] = React.useState('');
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [resultUrl, setResultUrl] = React.useState<string | null>(null);
  const [resultSent, setResultSent] = React.useState(true);
  /** Which tab produced the current result (so success copy can adapt). */
  const [resultTab, setResultTab] = React.useState<Tab>('existing');
  const [copied, setCopied] = React.useState(false);

  const filtered = React.useMemo(() => {
    const q = query.trim();
    if (!q) return students;
    return students.filter(
      (s) => s.name.includes(q) || s.phone.includes(q.replace(/[\s-]/g, '')),
    );
  }, [students, query]);

  const reset = React.useCallback(() => {
    setQuery('');
    setSelectedId(null);
    setError(null);
    setResultUrl(null);
    setResultSent(true);
    setResultTab('existing');
    setCopied(false);
    setSubmitting(false);
    setTab(students.length > 0 ? 'existing' : 'new');
  }, [students.length]);

  const openDialog = React.useCallback(() => {
    reset();
    setOpen(true);
  }, [reset]);

  const closeDialog = React.useCallback(() => setOpen(false), []);

  const panelRef = React.useRef<HTMLDivElement>(null);

  // Close on Escape + trap Tab focus inside the dialog (so keyboard users can't
  // tab out into the page behind the scrim).
  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        closeDialog();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;
      if (e.shiftKey && activeEl === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, closeDialog]);

  // Move initial focus to the first interactive control inside the dialog.
  React.useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const target = panel.querySelector<HTMLElement>(
        'input:not([disabled]), [role="tab"][aria-selected="true"], button:not([disabled])',
      );
      target?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open, resultUrl, tab]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // "הזמנה חדשה" → the PERMANENT public link. It never changes, so there's
    // nothing to create — just surface it to copy / share (again and again).
    if (tab === 'new') {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      setResultUrl(`${origin}/book`);
      setResultSent(false);
      setResultTab('new');
      return;
    }

    // Existing student → mint + WhatsApp their personal link.
    if (!selectedId) {
      setError('יש לבחור תלמיד מהרשימה');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/booking-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: selectedId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? 'שגיאה ביצירת הקישור');
        return;
      }
      setResultUrl(json.url as string);
      setResultSent(json.sent !== false);
      setResultTab('existing');
    } catch {
      setError('שגיאה ביצירת הקישור');
    } finally {
      setSubmitting(false);
    }
  }

  async function copyUrl() {
    if (!resultUrl) return;
    try {
      await navigator.clipboard.writeText(resultUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — no-op
    }
  }

  const isInviteResult = resultTab === 'new';

  return (
    <>
      <Button type="button" variant={triggerVariant} onClick={openDialog} className={className}>
        <Send className="size-4" aria-hidden="true" />
        {triggerLabel}
      </Button>

      {open && typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="send-link-title"
          >
          <button
            type="button"
            aria-label="סגור"
            className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
            onClick={closeDialog}
          />

          <div
            ref={panelRef}
            className="relative z-10 flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-line bg-surface shadow-pop sm:rounded-3xl"
          >
            {/* Gradient header band */}
            <div className="relative shrink-0 overflow-hidden bg-gradient-warm px-6 py-5">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -end-8 -top-10 size-32 rounded-full bg-white/15 blur-2xl"
              />
              <div className="relative flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex size-11 items-center justify-center rounded-2xl bg-white/20 text-white ring-1 ring-white/30">
                    <Send className="size-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 id="send-link-title" className="text-lg font-bold text-white">
                      שליחת לינק לתיאום
                    </h2>
                    <p className="text-sm text-white/80">לינק אישי לתיאום שיעור</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeDialog}
                  aria-label="סגור חלון"
                  className="flex size-9 items-center justify-center rounded-xl text-white/90 transition-colors duration-200 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <X className="size-5" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Success state */}
            {resultUrl ? (
              <div className="flex min-h-0 flex-1 flex-col items-center gap-4 overflow-y-auto p-6 text-center">
                <span className="flex size-16 items-center justify-center rounded-full bg-success-soft text-success ring-4 ring-success-soft/40">
                  <CheckCircle2 className="size-8" aria-hidden="true" />
                </span>
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-ink">
                    {isInviteResult
                      ? 'הקישור הקבוע שלך'
                      : resultSent
                        ? 'הלינק נשלח בוואטסאפ!'
                        : 'הלינק נוצר'}
                  </h3>
                  <p className="text-sm text-muted">
                    {isInviteResult
                      ? 'זה הקישור הקבוע — שמרי אותו ושלחי לכל מי שתרצי, שוב ושוב. כל אחד ממלא בעצמו את הפרטים, בוחר מועד (אפשר כמה שיעורים), והבקשה תגיע אלייך לאישור.'
                      : resultSent
                        ? 'התלמיד/ה קיבל/ה הודעת וואטסאפ עם הלינק האישי לתיאום.'
                        : 'שליחת הוואטסאפ נכשלה — אפשר להעתיק את הלינק ולשלוח ידנית.'}
                  </p>
                </div>
                <div className="flex w-full items-center gap-2 rounded-2xl border border-line bg-surface-2/60 p-2 ps-3">
                  <span dir="ltr" className="flex-1 truncate text-sm text-ink" title={resultUrl}>
                    {resultUrl}
                  </span>
                  <Button type="button" size="md" variant="primary" onClick={copyUrl}>
                    {copied ? (
                      <Check className="size-4" aria-hidden="true" />
                    ) : (
                      <Copy className="size-4" aria-hidden="true" />
                    )}
                    {copied ? 'הועתק' : 'העתק'}
                  </Button>
                </div>
                <div className="flex w-full flex-col gap-2 pt-1 sm:flex-row">
                  <Button type="button" variant="secondary" className="sm:flex-1" onClick={reset}>
                    יצירת קישור נוסף
                  </Button>
                  <Button type="button" className="sm:flex-1" onClick={closeDialog}>
                    סגירה
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
                {/* Tabs */}
                <div
                  role="tablist"
                  aria-label="בחירת סוג קישור"
                  className="grid grid-cols-2 gap-1.5 rounded-2xl border border-line bg-surface-2/50 p-1.5 shadow-soft"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'existing'}
                    onClick={() => {
                      setTab('existing');
                      setError(null);
                    }}
                    className={cn(
                      'inline-flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      tab === 'existing'
                        ? 'bg-gradient-warm text-white shadow-card'
                        : 'text-muted hover:bg-primary-50 hover:text-ink',
                    )}
                  >
                    <UserCheck className="size-4" aria-hidden="true" />
                    תלמיד קיים
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'new'}
                    onClick={() => {
                      setTab('new');
                      setError(null);
                    }}
                    className={cn(
                      'inline-flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      tab === 'new'
                        ? 'bg-gradient-warm text-white shadow-card'
                        : 'text-muted hover:bg-primary-50 hover:text-ink',
                    )}
                  >
                    <UserPlus className="size-4" aria-hidden="true" />
                    הזמנה חדשה
                  </button>
                </div>

                {/* Existing student */}
                {tab === 'existing' && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="link-search">חיפוש תלמיד</Label>
                      <div className="relative">
                        <Search
                          className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted"
                          aria-hidden="true"
                        />
                        <Input
                          id="link-search"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="שם או טלפון…"
                          className="pe-10"
                        />
                      </div>
                    </div>

                    <div
                      role="listbox"
                      aria-label="תלמידים"
                      className="max-h-60 overflow-y-auto rounded-2xl border border-line bg-surface-2/30 p-1.5"
                    >
                      {filtered.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                          <span className="flex size-11 items-center justify-center rounded-full bg-primary-soft/60 text-primary-600 ring-1 ring-primary-100">
                            <SearchX className="size-5" aria-hidden="true" />
                          </span>
                          <p className="text-sm font-medium text-ink">לא נמצאו תלמידים</p>
                          <p className="text-xs text-muted">נסי שם או מספר טלפון אחר, או צרי הזמנה חדשה.</p>
                        </div>
                      ) : (
                        <ul className="space-y-1">
                          {filtered.map((s) => {
                            const isSel = selectedId === s.id;
                            return (
                              <li key={s.id}>
                                <button
                                  type="button"
                                  role="option"
                                  aria-selected={isSel}
                                  onClick={() => setSelectedId(s.id)}
                                  className={cn(
                                    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                                    isSel
                                      ? 'bg-primary-50 ring-1 ring-primary-200'
                                      : 'hover:bg-surface',
                                  )}
                                >
                                  <span
                                    aria-hidden="true"
                                    className={cn(
                                      'flex size-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold shadow-soft',
                                      toneFor(s.name),
                                    )}
                                  >
                                    {initials(s.name)}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate font-medium text-ink">{s.name}</span>
                                    <span
                                      className="block text-xs tabular-nums text-muted"
                                      dir="ltr"
                                    >
                                      {s.phone}
                                    </span>
                                  </span>
                                  {isSel && (
                                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg">
                                      <Check className="size-3.5" aria-hidden="true" />
                                    </span>
                                  )}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                )}

                {/* Permanent public link — no fields; each visitor fills their own. */}
                {tab === 'new' && (
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 rounded-2xl border border-line bg-cream/40 p-4">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-600">
                        <Link2 className="size-5" aria-hidden="true" />
                      </span>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-ink">קישור קבוע לתיאום</p>
                        <p className="text-sm leading-relaxed text-muted">
                          זהו קישור אחד <span className="font-semibold text-ink">קבוע</span> — שלחי
                          אותו לכל מי שתרצי, שוב ושוב. כל אחד פותח, ממלא בעצמו את הפרטים (שם, טלפון,
                          פרטי הורה) ובוחר מועד — אפשר גם כמה שיעורים. הבקשה תגיע אלייך לאישור.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 rounded-xl bg-primary-50 px-3.5 py-2.5 text-xs text-primary-600">
                      <Sparkles className="size-4 shrink-0" aria-hidden="true" />
                      <span>אימייל הוא רשות — רק אם רוצים גם תזכורות במייל.</span>
                    </div>
                  </div>
                )}

                {error && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-3 text-sm text-danger"
                  >
                    <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <span>{error}</span>
                  </div>
                )}
                </div>

                <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-line bg-surface/80 p-5 sm:flex-row">
                  <Button type="button" variant="ghost" onClick={closeDialog} className="sm:flex-1">
                    ביטול
                  </Button>
                  <Button type="submit" loading={submitting} className="sm:flex-[2]">
                    {tab === 'new' ? (
                      <Link2 className="size-4" aria-hidden="true" />
                    ) : (
                      <Send className="size-4" aria-hidden="true" />
                    )}
                    {submitting
                      ? 'שולח…'
                      : tab === 'new'
                        ? 'קבלת הקישור הקבוע'
                        : 'שליחת הלינק'}
                  </Button>
                </div>
              </form>
            )}
          </div>
          </div>,
          document.body,
        )}
    </>
  );
}
