'use client';

import * as React from 'react';
import { Repeat, AlertTriangle, UserPlus, Users, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { LessonDialog } from './LessonDialog';
import { replaceLesson } from './actions';
import type { StudentOption } from './data';
import type { LessonRow } from './data';
import { formatILDateTime } from '@/lib/time';

// Replace a lesson on its slot: the original student cancelled (told Ilanit), so
// she picks a DIFFERENT student — existing from the list, or a brand-new one —
// and confirms. The replacement is booked on the SAME slot and the original is
// cancelled (its student gets a cancellation message). Confirm → replaceLesson.

type Mode = 'existing' | 'new';

export function ReplaceLessonDialog({
  open,
  onClose,
  lesson,
  studentOptions,
  onReplaced,
}: {
  open: boolean;
  onClose: () => void;
  lesson: LessonRow | null;
  studentOptions: StudentOption[];
  onReplaced: () => void;
}) {
  const [mode, setMode] = React.useState<Mode>('existing');
  const [studentId, setStudentId] = React.useState('');
  const [newName, setNewName] = React.useState('');
  const [newPhone, setNewPhone] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setMode('existing');
      setStudentId('');
      setNewName('');
      setNewPhone('');
      setError(null);
      setBusy(false);
    }
  }, [open, lesson?.id]);

  // Don't offer the original student as their own replacement.
  const options = React.useMemo(
    () => studentOptions.filter((s) => s.name !== lesson?.studentName),
    [studentOptions, lesson?.studentName],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!lesson) return;

    if (mode === 'existing' && !studentId) {
      setError('יש לבחור תלמיד/ה מהרשימה');
      return;
    }
    if (mode === 'new' && (!newName.trim() || !newPhone.trim())) {
      setError('יש להזין שם וטלפון');
      return;
    }

    setBusy(true);
    setError(null);
    const res = await replaceLesson(
      mode === 'existing'
        ? { originalLessonId: lesson.id, studentId }
        : { originalLessonId: lesson.id, newStudentName: newName, newStudentPhone: newPhone },
    );
    if (!res.ok) {
      setError(res.error ?? 'שגיאה בהחלפת השיעור');
      setBusy(false);
      return;
    }
    setBusy(false);
    onReplaced();
    onClose();
  }

  return (
    <LessonDialog
      open={open}
      onClose={onClose}
      title="החלפת שיעור"
      description="קביעת תלמיד/ה אחר/ת על אותה משבצת — השיעור המקורי יבוטל."
    >
      <form className="space-y-4" onSubmit={submit}>
        {/* Original lesson being replaced */}
        {lesson && (
          <div className="rounded-2xl border border-white/70 bg-white/70 px-4 py-3 shadow-soft backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              מחליפים את
            </p>
            <p className="mt-1 text-sm font-bold text-ink">
              {lesson.studentName ?? 'שיעור'}
              {' · '}
              <span dir="ltr" className="tabular-nums">
                {formatILDateTime(lesson.startsAt)}
              </span>
            </p>
          </div>
        )}

        {/* Mode toggle: existing student vs new */}
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { m: 'existing' as const, icon: Users, label: 'תלמיד/ה קיים/ת' },
              { m: 'new' as const, icon: UserPlus, label: 'הוסף חדש/ה' },
            ]
          ).map(({ m, icon: Icon, label }) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              aria-pressed={mode === m}
              className={cn(
                'flex min-h-11 items-center justify-center gap-1.5 rounded-full border px-3 py-2.5 text-sm font-semibold transition-[background-color,border-color,color,box-shadow] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                mode === m
                  ? 'border-primary-300 bg-primary-200 text-ink shadow-card'
                  : 'border-line bg-white/70 text-muted backdrop-blur hover:bg-white hover:text-ink',
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        {mode === 'existing' ? (
          <div className="space-y-1.5">
            <Label htmlFor="replace-student" required>
              בחירת תלמיד/ה
            </Label>
            <Select
              id="replace-student"
              value={studentId}
              error={Boolean(error) && !studentId}
              onChange={(e) => {
                setStudentId(e.target.value);
                if (error) setError(null);
              }}
            >
              <option value="">— בחר/י —</option>
              {options.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="replace-name" required>
                שם התלמיד/ה
              </Label>
              <Input
                id="replace-name"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  if (error) setError(null);
                }}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="replace-phone" required>
                טלפון
              </Label>
              <Input
                id="replace-phone"
                type="tel"
                inputMode="tel"
                dir="ltr"
                value={newPhone}
                onChange={(e) => {
                  setNewPhone(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="05X-XXXXXXX"
              />
            </div>
          </div>
        )}

        <div className="flex items-start gap-2.5 rounded-2xl border border-primary-200 bg-primary-50 px-3.5 py-3 text-sm text-ink shadow-soft">
          <Info className="mt-0.5 size-4 shrink-0 text-primary-700" aria-hidden="true" />
          <span>
            השיעור החדש ייקבע על אותה משבצת והתלמיד/ה יקבל/ת אישור. השיעור המקורי יבוטל,
            יוסר מהיומן, והתלמיד/ה המקורי/ת יקבל/ת הודעה על הביטול.
          </span>
        </div>

        {error && (
          <div
            role="alert"
            className="flex animate-fade-in items-start gap-2 rounded-2xl border border-danger bg-danger-soft p-3.5 shadow-soft"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
            <p className="text-sm font-semibold text-danger">{error}</p>
          </div>
        )}

        <div className="flex flex-col gap-2 pt-1 sm:flex-row">
          <Button type="submit" variant="primary" size="lg" className="flex-1" loading={busy}>
            {!busy && <Repeat className="size-5" aria-hidden="true" />}
            החלף שיעור
          </Button>
          <Button type="button" variant="secondary" size="lg" disabled={busy} onClick={onClose}>
            ביטול
          </Button>
        </div>
      </form>
    </LessonDialog>
  );
}
