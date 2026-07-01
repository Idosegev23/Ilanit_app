'use client';

import * as React from 'react';
import {
  Plus,
  Check,
  Repeat,
  CalendarDays,
  CalendarPlus,
  AlertCircle,
  Clock,
  CalendarClock,
  CalendarCheck2,
  RefreshCw,
  Wand2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/ui/stat-card';
import { PageHeader } from '@/components/ui/page-header';
import { cn } from '@/lib/utils';
import {
  backfillImportedTitles,
  aiResolveImports,
  type ActionResult,
} from './actions';
import { ManualLessonForm } from './ManualLessonForm';
import { RecurringForm } from './RecurringForm';
import { LessonDialog } from './LessonDialog';
import { AssignStudentDialog } from './AssignStudentDialog';
import { CalendarShell } from './calendar/CalendarShell';
import type { LessonRow, StudentOption, GroupOption } from './data';

type CreateTab = 'manual' | 'recurring';

export function LessonsView({
  lessons,
  studentOptions,
  groupOptions,
}: {
  lessons: LessonRow[];
  studentOptions: StudentOption[];
  groupOptions: GroupOption[];
}) {
  const [error, setError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [tab, setTab] = React.useState<CreateTab>('manual');
  // Bumped each time the dialog opens so the forms remount and their
  // useActionState (and thus the success/error message) starts fresh.
  const [formKey, setFormKey] = React.useState(0);
  const [assignTarget, setAssignTarget] = React.useState<LessonRow | null>(null);
  const [backfilling, setBackfilling] = React.useState(false);
  const [aiResolving, setAiResolving] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [, startTransition] = React.useTransition();

  // ── Summary counts (presentation only — derived from the same rows) ──
  const counts = React.useMemo(() => {
    const c = { all: lessons.length, pending: 0, confirmed: 0 };
    for (const l of lessons) {
      if (l.status === 'pending') c.pending += 1;
      else if (l.status === 'confirmed') c.confirmed += 1;
    }
    return c;
  }, [lessons]);

  const upcomingConfirmed = React.useMemo(() => {
    const now = Date.now();
    return lessons.filter(
      (l) => l.status === 'confirmed' && l.startsAt.getTime() >= now,
    ).length;
  }, [lessons]);

  function handleAction(id: string, fn: () => Promise<ActionResult>) {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? 'שגיאה');
      setBusyId(null);
    });
  }

  function openCreate(initialTab: CreateTab) {
    setTab(initialTab);
    setFormKey((k) => k + 1);
    setDialogOpen(true);
  }

  function handleBackfill() {
    setError(null);
    setNotice(null);
    setBackfilling(true);
    startTransition(async () => {
      const res = await backfillImportedTitles();
      if (!res.ok) {
        setError(res.error ?? 'שגיאה ברענון הכותרות');
      } else {
        setNotice(
          res.updated && res.updated > 0
            ? `עודכנו ${res.updated} כותרות מהיומן`
            : 'כל הכותרות כבר מעודכנות',
        );
      }
      setBackfilling(false);
    });
  }

  function handleAiResolve() {
    setError(null);
    setNotice(null);
    setAiResolving(true);
    startTransition(async () => {
      const res = await aiResolveImports();
      if (!res.ok) {
        setError(res.error ?? 'שגיאה בזיהוי האוטומטי');
      } else {
        const parts = [
          `שויכו ${res.assigned ?? 0} שיעורים`,
          `נוצרו ${res.createdStudents ?? 0} תלמידים`,
          `דולגו ${res.skippedNonLesson ?? 0} אישיים`,
        ];
        if (res.errors && res.errors > 0) parts.push(`${res.errors} שגיאות`);
        setNotice(parts.join(' · '));
      }
      setAiResolving(false);
    });
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="ניהול יומן"
        title="שיעורים"
        subtitle="יומן השיעורים — תצוגה יומית, שבועית או חודשית. אישור, דחייה וביטול שיעורים ויצירת שיעורים חדשים."
        actions={
          <>
            <Button
              variant="primary"
              onClick={handleAiResolve}
              loading={aiResolving}
              disabled={aiResolving}
              title="זיהוי אוטומטי של תלמיד ומקצוע מכותרת היומן, יצירת תלמידים חדשים ושיוך — באמצעות AI"
            >
              <Wand2 className="size-4" aria-hidden="true" />
              זיהוי ושיוך אוטומטי (AI)
            </Button>
            <Button
              variant="ghost"
              onClick={handleBackfill}
              loading={backfilling}
              title="משיכת כותרות לשיעורים שיובאו מהיומן ללא שם"
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              רענן כותרות מהיומן
            </Button>
            <Button variant="secondary" onClick={() => openCreate('manual')}>
              <Plus className="size-4" aria-hidden="true" />
              הוספת שיעור חד-פעמי
            </Button>
            <Button variant="gradient" onClick={() => openCreate('recurring')}>
              <Repeat className="size-4" aria-hidden="true" />
              שיעור קבוע (מחזורי)
            </Button>
          </>
        }
      />

      {/* Summary strip — kills the empty void with at-a-glance hierarchy */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="ממתינים לאישור"
          value={counts.pending}
          icon={Clock}
          tone="accent"
          hint="דורשים החלטה"
        />
        <StatCard
          label="שיעורים קרובים"
          value={upcomingConfirmed}
          icon={CalendarClock}
          tone="primary"
          hint="מאושרים ועתידיים"
        />
        <StatCard
          label="מאושרים"
          value={counts.confirmed}
          icon={CalendarCheck2}
          tone="success"
        />
        <StatCard
          label="סך הכל ביומן"
          value={counts.all}
          icon={CalendarDays}
          tone="primary"
        />
      </div>

      {/* Prominent primary action for existing regulars — a recurring weekly
          series (individual). Auto-scheduled, NOT gated by open-weeks. */}
      <div className="flex flex-col gap-4 rounded-2xl border border-primary-200 bg-gradient-tint p-5 shadow-soft sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span
            className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-warm text-primary-fg shadow-soft"
            aria-hidden="true"
          >
            <Repeat className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-ink">
              הוספת שיעור קבוע (מחזורי)
            </h2>
            <p className="mt-0.5 text-sm text-muted">
              לתלמידים קבועים עם שיעור שבועי — נוצרים אוטומטית ואינם תלויים בפתיחת שבוע.
            </p>
          </div>
        </div>
        <Button
          variant="gradient"
          size="lg"
          onClick={() => openCreate('recurring')}
          className="shrink-0 max-sm:w-full"
        >
          <Repeat className="size-4" aria-hidden="true" />
          הוספת שיעור קבוע
        </Button>
      </div>

      {error && (
        <div
          className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm font-medium text-danger"
          role="alert"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {notice && (
        <div
          className="flex items-center gap-2 rounded-xl border border-success/30 bg-success-soft px-4 py-3 text-sm font-medium text-success"
          role="status"
        >
          <Check className="size-4 shrink-0" aria-hidden="true" />
          {notice}
        </div>
      )}

      {/* The calendar — replaces the old flat list. Day / week / month views. */}
      <Card>
        <CardHeader variant="gradient">
          <div className="flex items-center gap-3">
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-warm text-primary-fg shadow-soft"
              aria-hidden="true"
            >
              <CalendarDays className="size-5" />
            </span>
            <div>
              <CardTitle>יומן שיעורים</CardTitle>
              <p className="text-sm text-muted">
                לחיצה על שיעור פותחת את הפרטים והפעולות
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <CalendarShell
            lessons={lessons}
            onAction={handleAction}
            onAssign={setAssignTarget}
            busyId={busyId}
          />
        </CardContent>
      </Card>

      <LessonDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="יצירת שיעור"
        description="שיעור חד-פעמי או סדרה שבועית חוזרת."
      >
        <div
          className="mb-5 flex gap-1.5 rounded-xl bg-primary-50 p-1"
          role="tablist"
          aria-label="סוג יצירה"
        >
          {(
            [
              { key: 'manual' as const, label: 'חד-פעמי', icon: CalendarPlus },
              { key: 'recurring' as const, label: 'חוזר שבועי', icon: Repeat },
            ]
          ).map(({ key, label, icon: Icon }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(key)}
                className={cn(
                  'flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-[background-color,color,box-shadow] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  active
                    ? 'bg-surface text-primary-600 shadow-soft'
                    : 'text-muted hover:text-ink',
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </div>

        {tab === 'manual' ? (
          <ManualLessonForm key={`manual-${formKey}`} onSuccess={() => setDialogOpen(false)} />
        ) : (
          <RecurringForm
            key={`recurring-${formKey}`}
            studentOptions={studentOptions}
            groupOptions={groupOptions}
            onSuccess={() => setDialogOpen(false)}
          />
        )}
      </LessonDialog>

      <AssignStudentDialog
        open={assignTarget !== null}
        onClose={() => setAssignTarget(null)}
        lessonId={assignTarget?.id ?? null}
        eventTitle={assignTarget?.studentName ?? null}
        studentOptions={studentOptions}
        onAssigned={() => setNotice('השיעור שויך בהצלחה')}
      />
    </div>
  );
}
