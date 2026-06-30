'use client';

import * as React from 'react';
import { UserCheck, AlertTriangle, Sparkles, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { LessonDialog } from './LessonDialog';
import { suggestStudentIdForTitle } from '@/lib/match-student';
import { assignStudentToLesson, createAndAssignStudentToLesson } from './actions';
import type { StudentOption } from './data';

// Inline assign dialog for a needs_match (calendar-imported) lesson. Shows the
// event TITLE, pre-selects the student whose name best matches it (via the
// shared title-matching helper), and lets the owner confirm or pick another.
// Confirm → assignStudentToLesson server action.

export function AssignStudentDialog({
  open,
  onClose,
  lessonId,
  eventTitle,
  studentOptions,
  onAssigned,
}: {
  open: boolean;
  onClose: () => void;
  lessonId: string | null;
  eventTitle: string | null;
  studentOptions: StudentOption[];
  onAssigned: () => void;
}) {
  // The suggested student id (best title match), recomputed per open.
  const suggestedId = React.useMemo(
    () => suggestStudentIdForTitle(eventTitle, studentOptions),
    [eventTitle, studentOptions],
  );

  const [studentId, setStudentId] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Pre-select the suggestion each time the dialog opens for a lesson.
  React.useEffect(() => {
    if (open) {
      setStudentId(suggestedId ?? '');
      setError(null);
      setBusy(false);
    }
  }, [open, lessonId, suggestedId]);

  const suggestedName =
    suggestedId != null
      ? studentOptions.find((s) => s.id === suggestedId)?.name ?? null
      : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!lessonId) return;
    if (!studentId) {
      setError('יש לבחור תלמיד/ה');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await assignStudentToLesson(lessonId, studentId);
    if (!res.ok) {
      setError(res.error ?? 'שגיאה בשיוך השיעור');
      setBusy(false);
      return;
    }
    setBusy(false);
    onAssigned();
    onClose();
  }

  // When no existing student matches the title, offer to create one from the
  // title and assign it in a single step (reuses the find-or-create helper).
  const createName = (eventTitle ?? '').trim();
  const showCreate = !suggestedName && createName.length > 0;

  async function createAndAssign() {
    if (!lessonId || !createName) return;
    setBusy(true);
    setError(null);
    const res = await createAndAssignStudentToLesson(lessonId, createName);
    if (!res.ok) {
      setError(res.error ?? 'שגיאה ביצירת ושיוך התלמיד/ה');
      setBusy(false);
      return;
    }
    setBusy(false);
    onAssigned();
    onClose();
  }

  return (
    <LessonDialog
      open={open}
      onClose={onClose}
      title="שיוך תלמיד/ה לשיעור"
      description="שיעור שיובא מהיומן — בחרי את התלמיד/ה שאליו הוא שייך."
    >
      <form className="space-y-4" onSubmit={submit}>
        {eventTitle && (
          <div className="rounded-xl border border-line bg-cream/60 px-4 py-3">
            <p className="text-xs font-medium text-muted">כותרת מהיומן</p>
            <p className="mt-0.5 truncate text-sm font-semibold text-ink" title={eventTitle}>
              {eventTitle}
            </p>
          </div>
        )}

        {suggestedName && (
          <div
            className="flex items-start gap-2 rounded-xl border border-primary-200 bg-primary-50 px-3 py-2.5 text-sm text-ink"
            role="note"
          >
            <Sparkles className="mt-0.5 size-4 shrink-0 text-primary-600" aria-hidden="true" />
            <span>
              הצעה אוטומטית לפי הכותרת:{' '}
              <span className="font-semibold text-primary-600">{suggestedName}</span>
            </span>
          </div>
        )}

        {showCreate && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-accent/30 bg-accent-soft/40 px-3 py-2.5 text-sm text-ink">
            <span className="min-w-0 flex-1">
              לא נמצא תלמיד/ה תואם/ת לכותרת. אפשר ליצור חדש/ה ולשייך מיד.
            </span>
            <Button
              type="button"
              variant="secondary"
              size="md"
              disabled={busy}
              onClick={createAndAssign}
            >
              <UserPlus className="size-4" aria-hidden="true" />
              צור ושייך: {createName}
            </Button>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="assign-lesson-student" required>
            בחירת תלמיד/ה
          </Label>
          <Select
            id="assign-lesson-student"
            value={studentId}
            error={Boolean(error) && !studentId}
            onChange={(e) => {
              setStudentId(e.target.value);
              if (error) setError(null);
            }}
          >
            <option value="">— בחר/י —</option>
            {studentOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.id === suggestedId ? ' ⭐' : ''}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted">
            לא ברשימה? אפשר להוסיף תלמיד/ה חדש/ה במסך התלמידים ולשייך לאחר מכן.
          </p>
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
            {!busy && <UserCheck className="size-5" aria-hidden="true" />}
            שייך תלמיד
          </Button>
          <Button type="button" variant="secondary" size="lg" disabled={busy} onClick={onClose}>
            ביטול
          </Button>
        </div>
      </form>
    </LessonDialog>
  );
}
