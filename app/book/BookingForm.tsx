'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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

  if (phase === 'done') {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>הבקשה התקבלה! 🌟</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-700">
            בקשתך לשיעור ב-{selected?.label} בתאריך {date} התקבלה וממתינה לאישור של אילנית.
          </p>
          <p className="mt-2 text-sm text-slate-600">תקבל/י הודעת וואטסאפ ברגע שהשיעור יאושר.</p>
          <Button
            className="mt-4"
            variant="outline"
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
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>קביעת שיעור</CardTitle>
      </CardHeader>
      <CardContent>
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="book-date">
          בחירת תאריך
        </label>
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

        {phase === 'pick' && (
          <div className="mt-4">
            <p className="mb-2 text-sm font-medium text-slate-700">זמנים פנויים</p>
            {loadingSlots && <p className="text-sm text-slate-500">טוען זמנים…</p>}
            {!loadingSlots && slotsError && (
              <p className="text-sm text-red-600">{slotsError}</p>
            )}
            {!loadingSlots && !slotsError && slots.length === 0 && (
              <p className="text-sm text-slate-500">אין זמנים פנויים בתאריך זה. נסו תאריך אחר.</p>
            )}
            {!loadingSlots && slots.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {slots.map((s) => (
                  <Button
                    key={s.startISO}
                    variant="outline"
                    onClick={() => pickSlot(s)}
                    type="button"
                  >
                    {s.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}

        {phase === 'form' && selected && (
          <form className="mt-4 space-y-3" onSubmit={submit}>
            <p className="text-sm text-slate-700">
              המועד שנבחר: <strong>{selected.label}</strong> בתאריך {date}
            </p>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="book-name">
                שם מלא <span className="text-red-600">*</span>
              </label>
              <Input
                id="book-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="שם התלמיד/ה"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="book-phone">
                טלפון <span className="text-red-600">*</span>
              </label>
              <Input
                id="book-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="050-123-4567"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="book-email">
                אימייל <span className="text-slate-400">(מומלץ)</span>
              </label>
              <Input
                id="book-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="כדי לקבל הזמנה ליומן שלך"
              />
              <p className="mt-1 text-xs text-slate-500">
                אם תזינו אימייל, השיעור ייכנס אוטומטית ליומן Google שלכם.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="book-notes">
                הערות
              </label>
              <textarea
                id="book-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="flex min-h-[64px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                placeholder="נושא השיעור, בקשות מיוחדות…"
              />
            </div>

            {formError && <p className="text-sm text-red-600">{formError}</p>}

            <div className="flex gap-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? 'שולח…' : 'קביעת השיעור'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setPhase('pick');
                  setSelected(null);
                }}
              >
                חזרה לבחירת מועד
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
