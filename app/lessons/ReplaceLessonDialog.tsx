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
          <div className="rounded-xl border border-line bg-cream/60 px-4 py-3">
            <p className="text-xs font-medium text-muted">מחליפים את</p>
            <p className="mt-0.5 text-sm font-semibold text-ink">
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
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors duration-150',
                mode === m
                  ? 'border-primary-300 bg-primary-50 text-primary-700 shadow-soft'
                  : 'border-line bg-surface text-muted hover:bg-surface-2',
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

        <div className="flex items-start gap-2 rounded-xl bg-primary-soft/50 px-3.5 py-2.5 text-sm text-primary-600">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            השיעור החדש ייקבע על אותה משבצת והתלמיד/ה יקבל/ת אישור. השיעור המקורי יבוטל,
            יוסר מהיומן, והתלמיד/ה המקורי/ת יקבל/ת הודעה על הביטול.
          </span>
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-danger/20 bg-danger-soft p-3"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        <div className="flex gap-2">
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
