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
  minutes because I typed it wrong" message a family about a change they never
  noticed — and the fix for that would be her avoiding the edit screen entirely.

  The parent is informed, not asked: she settles any objection with them
  directly, so there is nothing for them to click and no lesson left in limbo
  waiting on a tap.

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
  /** Set when this lesson is one occurrence of a recurring series. */
  recurrenceId?: string | null;
  /** ₪ on this occurrence, so a length change can revisit it. */
  price?: number | null;
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
  /*
    Which occurrences the change applies to. Defaults to this one — a move is
    far more often "not this week" than "from now on", and the safer default is
    the one that touches least.
  */
  const [scope, setScope] = React.useState<'one' | 'following' | 'all'>('one');
  const [price, setPrice] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notified, setNotified] = React.useState(false);
  const [moved, setMoved] = React.useState(1);
  const [skipped, setSkipped] = React.useState(0);

  React.useEffect(() => {
    if (!lesson) return;
    setPhase('edit');
    setDate(lesson.date);
    setTime(lesson.time);
    setDuration(String(lesson.durationMin));
    setScope('one');
    setPrice(lesson.price != null ? String(lesson.price) : '');
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

  const currentPrice = lesson.price != null ? String(lesson.price) : '';
  const priceChanged = price.trim() !== currentPrice;
  const durationChanged = Number(duration) !== lesson.durationMin;
  const changed =
    date !== lesson.date || time !== lesson.time || durationChanged || priceChanged;
  const isRecurring = Boolean(lesson.recurrenceId);

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
        scope,
        // Only sent when she actually changed it, so an untouched field never
        // rewrites prices across a whole series.
        price: priceChanged ? (price.trim() === '' ? null : Number(price)) : undefined,
      });
      if (!res.ok) {
        setError(res.error ?? 'שגיאה בשינוי המועד');
        setPhase('edit');
        return;
      }
      setNotified(Boolean(res.notified));
      setMoved(res.movedCount ?? 1);
      setSkipped(res.skippedConflicts ?? 0);
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

            <div className="space-y-1.5">
              <Label htmlFor="resched-price">מחיר (₪)</Label>
              <Input
                id="resched-price"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                className="tabular-nums text-end"
                dir="ltr"
                placeholder="ללא מחיר"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
              {durationChanged && !priceChanged && (
                /*
                  Halving a lesson without revisiting its price is how a
                  60-minute lesson keeps billing a 120-minute rate.
                */
                <p className="text-xs text-warning">
                  שינית את המשך — כדאי לבדוק שהמחיר עדיין נכון.
                </p>
              )}
            </div>

            {isRecurring && (
              <fieldset className="space-y-2 rounded-2xl border border-line bg-primary-50/60 p-3.5">
                <legend className="px-1 text-sm font-semibold text-ink">
                  זה שיעור קבוע — על מה להחיל?
                </legend>
                {(
                  [
                    ['one', 'רק המופע הזה', 'שאר הסדרה נשארת כמו שהיא.'],
                    [
                      'following',
                      'המופע הזה וכל הבאים',
                      'גם הסדרה עצמה מתעדכנת, כך שמופעים חדשים ייווצרו לפי המועד החדש.',
                    ],
                    [
                      'all',
                      'כל המופעים העתידיים',
                      'כולל מופעים שכבר נקבעו לפני התאריך הזה. שיעורים שכבר התקיימו לא משתנים.',
                    ],
                  ] as const
                ).map(([value, title, hint]) => (
                  <label
                    key={value}
                    className="flex cursor-pointer items-start gap-2.5 rounded-xl px-2 py-1.5 hover:bg-white/70"
                  >
                    <input
                      type="radio"
                      name="resched-scope"
                      className="mt-1 size-4 shrink-0 accent-ink"
                      checked={scope === value}
                      onChange={() => setScope(value)}
                    />
                    <span className="min-w-0 text-sm">
                      <span className="block font-medium text-ink">{title}</span>
                      <span className="block text-xs text-muted">{hint}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}

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
              {isRecurring && scope !== 'one' && (
                <>
                  <br />
                  <span className="font-bold">
                    {scope === 'following'
                      ? 'השינוי יחול על המופע הזה וכל הבאים בסדרה'
                      : 'השינוי יחול על כל המופעים העתידיים בסדרה'}
                  </span>
                  , והסדרה עצמה תתעדכן.
                </>
              )}
              <br />
              לשלוח להורה הודעת עדכון?
            </p>
            {isRecurring && scope !== 'one' && (
              // One message, not one per occurrence — the parent needs to know
              // the standing time changed, not to be told it fourteen times.
              <p className="rounded-xl bg-accent-soft px-3.5 py-2.5 text-xs leading-relaxed text-accent-text">
                תישלח הודעה אחת בלבד, על המופע הזה. את שאר הסדרה כדאי להזכיר לה
                בשיחה.
              </p>
            )}
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
              ההורה יקבל וואטסאפ עם המועד הישן והחדש. זו הודעת עדכון בלבד — אין
              מה לאשר, וכל שינוי נוסף תסגרי איתו ישירות.
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
                שמירה ועדכון ההורה
              </Button>
            </div>
          </div>
        )}

        {phase === 'done' && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <span className="flex size-16 items-center justify-center rounded-full bg-success-soft text-success ring-1 ring-success/20">
              <CheckCircle2 className="size-8" aria-hidden="true" />
            </span>
            <p className="text-lg font-bold text-ink">
              {moved > 1 ? `${moved} מופעים עודכנו` : 'המועד עודכן'}
            </p>
            <p className="max-w-xs text-sm leading-relaxed text-muted">
              {notified
                ? 'נשלחה להורה הודעת עדכון עם המועד החדש.'
                : 'לא נשלחה הודעה להורה.'}
            </p>
            {skipped > 0 && (
              /*
                Never silent: a skipped occurrence is one where somebody else
                already holds the new slot, and she has to decide what to do
                about it.
              */
              <p className="max-w-xs rounded-xl bg-warning-soft px-3.5 py-2.5 text-sm leading-relaxed text-warning">
                {skipped === 1
                  ? 'מופע אחד לא הוזז — כבר יש שיעור אחר במועד החדש באותו שבוע.'
                  : `${skipped} מופעים לא הוזזו — כבר יש שיעורים אחרים במועד החדש באותם שבועות.`}
              </p>
            )}
            <Button variant="secondary" size="lg" onClick={onClose}>
              סגירה
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
