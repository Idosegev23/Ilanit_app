'use client';

import * as React from 'react';
import {
  Send,
  X,
  UserCheck,
  UserPlus,
  Search,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  CircleDollarSign,
} from 'lucide-react';
import { Button } from './button';
import { Input } from './input';
import { Label } from './label';
import { cn } from '@/lib/utils';

// Popup for the owner ("שלח לינק לתיאום"): choose an EXISTING student (search +
// select) or add a NEW one (name + phone) → POST /api/booking-link → a success
// state showing the personal link was sent, with a copy button. RTL Hebrew,
// design-system primitives, lucide icons, focus-visible, 44px targets.

export interface BookingLinkStudent {
  id: string;
  name: string;
  phone: string;
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
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [defaultPrice, setDefaultPrice] = React.useState('');

  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [resultUrl, setResultUrl] = React.useState<string | null>(null);
  const [resultSent, setResultSent] = React.useState(true);
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
    setName('');
    setPhone('');
    setDefaultPrice('');
    setError(null);
    setResultUrl(null);
    setResultSent(true);
    setCopied(false);
    setSubmitting(false);
    setTab(students.length > 0 ? 'existing' : 'new');
  }, [students.length]);

  const openDialog = React.useCallback(() => {
    reset();
    setOpen(true);
  }, [reset]);

  const closeDialog = React.useCallback(() => setOpen(false), []);

  // Close on Escape.
  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeDialog();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, closeDialog]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    let body: Record<string, string>;
    if (tab === 'existing') {
      if (!selectedId) {
        setError('יש לבחור תלמיד מהרשימה');
        return;
      }
      body = { studentId: selectedId };
    } else {
      if (!name.trim()) {
        setError('יש להזין שם');
        return;
      }
      if (!phone.trim()) {
        setError('יש להזין מספר טלפון');
        return;
      }
      body = { name: name.trim(), phone: phone.trim() };
      // Optional default private-lesson price (integer shekels). Sent as a hint
      // to the booking-link endpoint; ignored if it doesn't consume the field.
      const priceRaw = defaultPrice.replace(/[^\d]/g, '');
      if (priceRaw !== '') {
        const n = Number(priceRaw);
        if (!Number.isFinite(n) || n < 0) {
          setError('מחיר לא תקין');
          return;
        }
        body.defaultPrice = String(Math.round(n));
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/booking-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? 'שגיאה ביצירת הקישור');
        return;
      }
      setResultUrl(json.url as string);
      setResultSent(json.sent !== false);
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

  return (
    <>
      <Button type="button" variant={triggerVariant} onClick={openDialog} className={className}>
        <Send className="size-4" aria-hidden="true" />
        {triggerLabel}
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="send-link-title"
        >
          <button
            type="button"
            aria-label="סגור"
            className="absolute inset-0 bg-ink/40"
            onClick={closeDialog}
          />

          <div className="relative z-10 w-full max-w-md rounded-t-2xl border border-line bg-surface shadow-pop sm:rounded-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-line p-5 pb-4">
              <h2 id="send-link-title" className="text-lg font-semibold text-ink">
                שליחת לינק לתיאום
              </h2>
              <button
                type="button"
                onClick={closeDialog}
                aria-label="סגור חלון"
                className="flex size-9 items-center justify-center rounded-xl text-muted transition-colors duration-200 hover:bg-primary-50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>

            {/* Success state */}
            {resultUrl ? (
              <div className="flex flex-col items-center gap-4 p-6 text-center">
                <span className="flex size-14 items-center justify-center rounded-full bg-success-soft text-success">
                  <CheckCircle2 className="size-8" aria-hidden="true" />
                </span>
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-ink">
                    {resultSent ? 'הלינק נשלח בוואטסאפ!' : 'הלינק נוצר'}
                  </h3>
                  <p className="text-sm text-muted">
                    {resultSent
                      ? 'התלמיד/ה קיבל/ה הודעת וואטסאפ עם הלינק האישי לתיאום.'
                      : 'שליחת הוואטסאפ נכשלה — אפשר להעתיק את הלינק ולשלוח ידנית.'}
                  </p>
                </div>
                <div className="flex w-full items-center gap-2 rounded-xl border border-line bg-cream/60 p-2">
                  <span dir="ltr" className="flex-1 truncate px-2 text-sm text-ink" title={resultUrl}>
                    {resultUrl}
                  </span>
                  <Button type="button" size="sm" variant="primary" onClick={copyUrl}>
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
                    שליחה לתלמיד נוסף
                  </Button>
                  <Button type="button" className="sm:flex-1" onClick={closeDialog}>
                    סגירה
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4 p-5">
                {/* Tabs */}
                <div
                  role="tablist"
                  aria-label="בחירת סוג תלמיד"
                  className="grid grid-cols-2 gap-1 rounded-xl bg-cream p-1"
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
                      'inline-flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      tab === 'existing'
                        ? 'bg-surface text-primary-600 shadow-soft'
                        : 'text-muted hover:text-ink',
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
                      'inline-flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      tab === 'new'
                        ? 'bg-surface text-primary-600 shadow-soft'
                        : 'text-muted hover:text-ink',
                    )}
                  >
                    <UserPlus className="size-4" aria-hidden="true" />
                    תלמיד חדש
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
                      className="max-h-56 overflow-y-auto rounded-xl border border-line"
                    >
                      {filtered.length === 0 ? (
                        <p className="p-4 text-center text-sm text-muted">לא נמצאו תלמידים</p>
                      ) : (
                        <ul className="divide-y divide-line">
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
                                    'flex w-full items-center justify-between gap-3 px-4 py-3 text-start transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                                    isSel ? 'bg-primary-50' : 'hover:bg-cream/60',
                                  )}
                                >
                                  <span className="truncate font-medium text-ink">{s.name}</span>
                                  <span className="shrink-0 text-sm tabular-nums text-muted" dir="ltr">
                                    {s.phone}
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                )}

                {/* New student */}
                {tab === 'new' && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="link-name" required>
                        שם מלא
                      </Label>
                      <Input
                        id="link-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="שם התלמיד/ה"
                        autoComplete="name"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="link-phone" required>
                        טלפון
                      </Label>
                      <Input
                        id="link-phone"
                        type="tel"
                        dir="ltr"
                        className="text-end"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="050-123-4567"
                        autoComplete="tel"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <Label htmlFor="link-price" className="flex items-center gap-1.5">
                          <CircleDollarSign className="size-3.5 text-muted" aria-hidden="true" />
                          מחיר לשיעור פרטי (₪)
                        </Label>
                        <span className="text-xs text-muted">לא חובה</span>
                      </div>
                      <Input
                        id="link-price"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        dir="ltr"
                        className="text-end tabular-nums"
                        value={defaultPrice}
                        onChange={(e) => setDefaultPrice(e.target.value)}
                        placeholder="150"
                      />
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

                <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row">
                  <Button type="button" variant="ghost" onClick={closeDialog} className="sm:flex-1">
                    ביטול
                  </Button>
                  <Button type="submit" loading={submitting} className="sm:flex-1">
                    <Send className="size-4" aria-hidden="true" />
                    {submitting ? 'שולח…' : 'שליחת הלינק'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
