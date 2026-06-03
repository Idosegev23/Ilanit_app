'use client';

import * as React from 'react';
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CalendarX2,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// Public booking flow (RTL Hebrew): pick a date → load real free slots → pick a
// slot → fill name + phone (required) + email (recommended) + notes → submit to
// /api/book. On success shows the "pending approval" confirmation.

interface Slot {
  startISO: string;
  endISO: string;
  label: string;
}

function todayISO(): string {
  // local date string; the server interprets the date in Asia/Jerusalem.
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Friendly Hebrew date label (e.g. "יום שלישי, 3 ביוני") for display only.
function formatDateHe(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  try {
    return new Intl.DateTimeFormat('he-IL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(new Date(y, m - 1, d));
  } catch {
    return iso;
  }
}

type Phase = 'pick' | 'form' | 'done';

export function BookingForm() {
  const [date, setDate] = React.useState(todayISO());
  const [slots, setSlots] = React.useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = React.useState(false);
  const [slotsError, setSlotsError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Slot | null>(null);

  const [phase, setPhase] = React.useState<Phase>('pick');
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const loadSlots = React.useCallback(async (d: string) => {
    setLoadingSlots(true);
    setSlotsError(null);
    setSelected(null);
    try {
      const res = await fetch(`/api/availability?date=${encodeURIComponent(d)}`);
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setSlots([]);
        setSlotsError(json.error ?? 'שגיאה בטעינת הזמנים');
        return;
      }
      setSlots(json.slots as Slot[]);
    } catch {
      setSlots([]);
      setSlotsError('שגיאה בטעינת הזמנים');
    } finally {
      setLoadingSlots(false);
    }
  }, []);

  React.useEffect(() => {
    void loadSlots(date);
  }, [date, loadSlots]);

  function pickSlot(slot: Slot) {
    setSelected(slot);
    setPhase('form');
    setFormError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    if (!name.trim()) {
      setFormError('יש להזין שם');
      return;
    }
    if (!phone.trim()) {
      setFormError('יש להזין מספר טלפון');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          phone,
          email: email.trim() || undefined,
          notes: notes.trim() || undefined,
          startISO: selected.startISO,
          endISO: selected.endISO,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setFormError(json.error ?? 'שגיאה בקביעת השיעור');
        if (res.status === 409) {
          // slot taken meanwhile — bounce back to picking
          setPhase('pick');
          void loadSlots(date);
        }
        return;
      }
      setPhase('done');
    } catch {
      setFormError('שגיאה בקביעת השיעור');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Success: "ממתין לאישור" ────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-success-soft text-success">
            <CheckCircle2 className="size-9" aria-hidden="true" />
          </span>
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-ink">הבקשה התקבלה!</h2>
            <p className="text-sm font-medium text-warning">ממתין לאישור</p>
          </div>
          <p className="max-w-sm text-sm leading-relaxed text-muted">
            הבקשה לשיעור ביום{' '}
            <span className="font-medium text-ink">{formatDateHe(date)}</span> בשעה{' '}
            <span className="font-medium text-ink" dir="ltr">
              {selected?.label}
            </span>{' '}
            התקבלה וממתינה לאישור של אילנית.
          </p>
          <p className="max-w-sm text-sm text-muted">
            תקבלו הודעת וואטסאפ ברגע שהשיעור יאושר.
          </p>
          <Button
            variant="secondary"
            className="mt-2"
            onClick={() => {
              setPhase('pick');
              setSelected(null);
              setName('');
              setPhone('');
              setEmail('');
              setNotes('');
            }}
          >
            לקביעת שיעור נוסף
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-6 py-6">
        {/* Date picker */}
        <div className="space-y-1.5">
          <Label htmlFor="book-date">
            <span className="inline-flex items-center gap-2">
              <CalendarDays className="size-4 text-primary-600" aria-hidden="true" />
              בחירת תאריך
            </span>
          </Label>
          <Input
            id="book-date"
            type="date"
            value={date}
            min={todayISO()}
            onChange={(e) => {
              setDate(e.target.value);
              setPhase('pick');
            }}
          />
        </div>

        {/* Slot picking */}
        {phase === 'pick' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-primary-600" aria-hidden="true" />
              <p className="text-sm font-medium text-ink">זמנים פנויים</p>
            </div>

            {loadingSlots && (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3" aria-hidden="true">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-11" />
                ))}
              </div>
            )}

            {!loadingSlots && slotsError && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-3 text-sm text-danger"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{slotsError}</span>
              </div>
            )}

            {!loadingSlots && !slotsError && slots.length === 0 && (
              <EmptyState
                icon={CalendarX2}
                title="אין זמנים פנויים בתאריך זה"
                description="נסו לבחור תאריך אחר — ייתכן שיתפנו מועדים בקרוב."
              />
            )}

            {!loadingSlots && slots.length > 0 && (
              <div
                role="group"
                aria-label="זמנים פנויים"
                className="grid grid-cols-2 gap-2.5 sm:grid-cols-3"
              >
                {slots.map((s) => {
                  const isSelected = selected?.startISO === s.startISO;
                  return (
                    <button
                      key={s.startISO}
                      type="button"
                      onClick={() => pickSlot(s)}
                      aria-pressed={isSelected}
                      dir="ltr"
                      className={cn(
                        'inline-flex h-11 items-center justify-center rounded-full border px-4 text-sm font-medium tabular-nums shadow-soft transition-[background-color,border-color,color,transform] duration-200 ease-out',
                        'hover:bg-primary-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:ring-primary',
                        isSelected
                          ? 'border-primary bg-primary text-primary-fg hover:bg-primary-600'
                          : 'border-line bg-surface text-ink',
                      )}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Booking form */}
        {phase === 'form' && selected && (
          <form className="space-y-4" onSubmit={submit}>
            {/* Selected-slot recap */}
            <div className="flex items-center gap-3 rounded-xl bg-primary-soft px-4 py-3">
              <Clock className="size-5 shrink-0 text-primary-600" aria-hidden="true" />
              <p className="text-sm text-ink">
                המועד שנבחר:{' '}
                <span className="font-semibold" dir="ltr">
                  {selected.label}
                </span>{' '}
                · {formatDateHe(date)}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="book-name" required>
                שם מלא
              </Label>
              <Input
                id="book-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="שם התלמיד/ה"
                autoComplete="name"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="book-phone" required>
                טלפון
              </Label>
              <Input
                id="book-phone"
                type="tel"
                dir="ltr"
                className="text-end"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="050-123-4567"
                autoComplete="tel"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="book-email">
                אימייל{' '}
                <span className="font-normal text-accent-text">(מומלץ)</span>
              </Label>
              <Input
                id="book-email"
                type="email"
                dir="ltr"
                className="text-end"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                autoComplete="email"
                aria-describedby="book-email-help"
              />
              <p id="book-email-help" className="text-xs leading-relaxed text-muted">
                אם תזינו אימייל, השיעור ייכנס אוטומטית ליומן Google שלכם.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="book-notes">הערות</Label>
              <Textarea
                id="book-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="נושא השיעור, בקשות מיוחדות…"
              />
            </div>

            {formError && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-3 text-sm text-danger"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{formError}</span>
              </div>
            )}

            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setPhase('pick');
                  setSelected(null);
                }}
              >
                <ArrowRight className="size-4" aria-hidden="true" />
                חזרה לבחירת מועד
              </Button>
              <Button
                type="submit"
                loading={submitting}
                className="sm:ms-auto"
              >
                {submitting ? 'שולח…' : 'שליחת הבקשה'}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
