'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';

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
    return <p className="text-sm font-medium text-green-700">השיעור שויך לתלמיד/ה בהצלחה. ✅</p>;
  }

  return (
    <form className="space-y-3" onSubmit={submit}>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="assign-student">
          בחירת תלמיד/ה
        </label>
        <select
          id="assign-student"
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <option value="">— בחר/י —</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.phone})
            </option>
          ))}
        </select>
      </div>

      {eventTitle && (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          לזכור שיוך זה לאירועים עתידיים עם הכותרת &quot;{eventTitle}&quot;
        </label>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="submit" disabled={busy}>
        {busy ? 'משייך…' : 'שיוך השיעור'}
      </Button>
    </form>
  );
}
