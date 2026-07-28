'use client';

import * as React from 'react';
import { UserCheck, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

// Student picker for /m/[token]. Posts the chosen student to /api/assign; the
// single-use token is consumed server-side. Optionally remembers an alias
// (event title) so future imports auto-match.

interface StudentOption {
  id: string;
  name: string;
  phone: string;
}

export function AssignForm({
  token,
  students,
  eventTitle,
}: {
  token: string;
  students: StudentOption[];
  eventTitle: string | null;
}) {
  const [studentId, setStudentId] = React.useState('');
  const [remember, setRemember] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!studentId) {
      setError('יש לבחור תלמיד/ה');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          studentId,
          alias:
            remember && eventTitle ? { type: 'title', value: eventTitle } : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? 'אירעה שגיאה');
        return;
      }
      setDone(true);
    } catch {
      setError('אירעה שגיאה');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div
        role="status"
        className="relative flex flex-col items-center gap-4 overflow-hidden rounded-3xl border border-white/70 bg-success-soft px-6 py-11 text-center shadow-pop animate-scale-in"
      >
        <span
          aria-hidden="true"
          className="absolute inset-x-0 -top-px h-1 bg-success/70"
        />
        <span
          className="flex size-20 items-center justify-center rounded-full bg-white/70 shadow-card ring-1 ring-white/70"
          aria-hidden="true"
        >
          <span className="flex size-14 items-center justify-center rounded-full bg-success text-white">
            <CheckCircle2 className="size-8" />
          </span>
        </span>
        <p className="text-2xl font-extrabold tracking-tight text-success">
          השיעור שויך בהצלחה
        </p>
        <p className="max-w-xs text-sm leading-relaxed text-ink">
          השיעור מחובר כעת לתיק התלמיד/ה.
        </p>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="space-y-1.5">
        <Label htmlFor="assign-student" required>
          בחירת תלמיד/ה
        </Label>
        <Select
          id="assign-student"
          value={studentId}
          error={Boolean(error) && !studentId}
          onChange={(e) => {
            setStudentId(e.target.value);
            if (error) setError(null);
          }}
        >
          <option value="">— בחר/י —</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.phone})
            </option>
          ))}
        </Select>
      </div>

      {eventTitle && (
        <label className="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-xl border border-white/60 bg-white/60 p-3.5 text-sm leading-relaxed text-ink shadow-soft backdrop-blur transition-colors duration-200 ease-out hover:bg-primary-50 has-[:checked]:border-primary-300 has-[:checked]:bg-primary-50">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="mt-1 size-4 shrink-0 cursor-pointer rounded border-line accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
          />
          <span>
            לזכור שיוך זה לאירועים עתידיים עם הכותרת &quot;{eventTitle}&quot;
          </span>
        </label>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl bg-danger-soft p-3.5 ring-1 ring-danger/20"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
        {!busy && <UserCheck className="size-5" aria-hidden="true" />}
        שיוך השיעור
      </Button>
    </form>
  );
}
