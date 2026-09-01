'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, X, AlertCircle, Send, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { rescheduleLessonAction } from './actions';

/*
  Moving a lesson.

  Two steps on purpose. Ilanit picks the new time and saves; only then is she
  asked whether to tell the parent. Bundling the two would make "move it five
  minutes because I typed it wrong" send a message asking a family to confirm a
  change they never noticed — and the fix for that would be her avoiding the
  edit screen entirely.

  Times step in quarter hours, which is how she actually schedules.
*/

export interface RescheduleTarget {
  id: string;
  studentName: string;
  /** yyyy-MM-dd */
  date: string;
  /** HH:mm */
  time: string;
  durationMin: number;
}

type Phase = 'edit' | 'ask' | 'done';

export function RescheduleDialog({
  lesson,
  onClose,
}: {
  lesson: RescheduleTarget | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [phase, setPhase] = React.useState<Phase>('edit');
  const [date, setDate] = React.useState('');
  const [time, setTime] = React.useState('');
  const [duration, setDuration] = React.useState('');
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notified, setNotified] = React.useState(false);

  React.useEffect(() => {
    if (!lesson) return;
    setPhase('edit');
    setDate(lesson.date);
    setTime(lesson.time);
    setDuration(String(lesson.durationMin));
    setNote('');
    setError(null);
    setNotified(false);
  }, [lesson]);

  React.useEffect(() => {
    if (!lesson) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [lesson, onClose]);

  if (!lesson) return null;

  const changed = date !== lesson.date || time !== lesson.time || Number(duration) !== lesson.durationMin;

  async function save(notifyParent: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await rescheduleLessonAction({
        lessonId: lesson!.id,
        date,
        time,
        durationMin: Number(duration) || lesson!.durationMin,
        notifyParent,
        note: note.trim() || undefined,
      });
      if (!res.ok) {
        setError(res.error ?? 'שגיאה בשינוי המועד');
        setPhase('edit');
        return;
      }
      setNotified(Boolean(res.notified));
      setPhase('done');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="סגירה"
        className="absolute inset-0 bg-ink opacity-40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="resched-title"
        className="glass-strong relative z-10 w-full max-w-md rounded-t-3xl p-6 shadow-pop animate-scale-in sm:rounded-3xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-ink shadow-glow"
            >
              <CalendarClock className="size-5" />
            </span>
            <div>
              <h3 id="resched-title" className="text-lg font-extrabold tracking-tight text-ink">
                שינוי מועד
              </h3>
              <p className="text-sm text-muted">{lesson.studentName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגירה"
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-white hover:text-ink"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        {phase === 'edit' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="resched-date">תאריך</Label>
                <Input
                  id="resched-date"
                  type="date"
                  className="date-field"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="resched-time">שעה</Label>
                <Input
                  id="resched-time"
                  type="time"
                  // 15-minute granularity: the arrows and the picker step in
                  // quarter hours, which is how lessons are actually placed.
                  step={900}
                  className="tabular-nums"
                  dir="ltr"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="resched-duration">משך (דק׳)</Label>
              <Input
                id="resched-duration"
                type="number"
                inputMode="numeric"
                min={5}
                step={5}
                className="tabular-nums text-end"
                dir="ltr"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>

            {error && (
              <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-3 text-sm text-danger">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {error}
              </p>
            )}

            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row">
              <Button variant="ghost" size="lg" className="sm:flex-1" onClick={onClose}>
                ביטול
              </Button>
              <Button
                variant="ink"
                size="lg"
                className="sm:flex-[2]"
                disabled={!changed}
                onClick={() => setPhase('ask')}
              >
                שמירת המועד החדש
              </Button>
            </div>
          </div>
        )}

        {phase === 'ask' && (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-ink">
              המועד ישתנה ל־
              <span className="font-bold"> {date} בשעה {time}</span>.
              <br />
              לשלוח להורה הודעה עם בקשת אישור?
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="resched-note">הערה להורה (לא חובה)</Label>
              <Textarea
                id="resched-note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="למשל: מצטערת על השינוי, יצא לי משהו דחוף."
              />
            </div>
            <p className="rounded-xl bg-surface-2/70 px-3.5 py-2.5 text-xs leading-relaxed text-muted">
              ההורה יקבל וואטסאפ עם המועד הישן והחדש, ושני כפתורים — מתאים לי / לא
              מתאים. התשובה תגיע אלייך.
            </p>

            {error && (
              <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-3 text-sm text-danger">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {error}
              </p>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button
                variant="secondary"
                size="lg"
                className="sm:flex-1"
                loading={busy}
                onClick={() => save(false)}
              >
                שמירה בלבד
              </Button>
              <Button
                variant="ink"
                size="lg"
                className="sm:flex-[2]"
                loading={busy}
                onClick={() => save(true)}
              >
                <Send className="size-4" aria-hidden="true" />
                שמירה ושליחה להורה
              </Button>
            </div>
          </div>
        )}

        {phase === 'done' && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <span className="flex size-16 items-center justify-center rounded-full bg-success-soft text-success ring-1 ring-success/20">
              <CheckCircle2 className="size-8" aria-hidden="true" />
            </span>
            <p className="text-lg font-bold text-ink">המועד עודכן</p>
            <p className="max-w-xs text-sm leading-relaxed text-muted">
              {notified
                ? 'נשלחה הודעה להורה עם בקשת אישור. התשובה תגיע אלייך בוואטסאפ.'
                : 'לא נשלחה הודעה להורה.'}
            </p>
            <Button variant="secondary" size="lg" onClick={onClose}>
              סגירה
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
