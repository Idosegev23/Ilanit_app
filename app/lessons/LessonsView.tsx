'use client';

import * as React from 'react';
import type { CSSProperties } from 'react';
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
import { ReplaceLessonDialog } from './ReplaceLessonDialog';
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
  const [replaceTarget, setReplaceTarget] = React.useState<LessonRow | null>(null);
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
    <div className="space-y-6 sm:space-y-8">
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
            {/* The single highest-emphasis action on the page → `ink`. Pink is
                reserved for the AI action and the hero band below, so the
                blush never becomes wallpaper. */}
            <Button variant="ink" onClick={() => openCreate('recurring')}>
              <Repeat className="size-4" aria-hidden="true" />
              שיעור קבוע (מחזורי)
            </Button>
          </>
        }
      />

      {/* Summary strip — kills the empty void with at-a-glance hierarchy */}
      <div className="stagger grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          style={{ '--i': 0 } as CSSProperties}
          label="ממתינים לאישור"
          value={counts.pending}
          icon={Clock}
          tone="accent"
          hint="דורשים החלטה"
        />
        <StatCard
          style={{ '--i': 1 } as CSSProperties}
          label="שיעורים קרובים"
          value={upcomingConfirmed}
          icon={CalendarClock}
          tone="primary"
          hint="מאושרים ועתידיים"
        />
        <StatCard
          style={{ '--i': 2 } as CSSProperties}
          label="מאושרים"
          value={counts.confirmed}
          icon={CalendarCheck2}
          tone="success"
        />
        <StatCard
          style={{ '--i': 3 } as CSSProperties}
          label="סך הכל ביומן"
          value={counts.all}
          icon={CalendarDays}
          tone="primary"
        />
      </div>

      {/* Prominent primary action for existing regulars — a recurring weekly
          series (individual). Auto-scheduled, NOT gated by open-weeks.
          Glass hero band: the `.blob` behind it sits at z-0, so the content
          layer is explicitly raised to z-10. */}
      <Card className="rise relative isolate overflow-hidden">
        <span aria-hidden="true" className="blob -top-20 -start-16 size-56 bg-primary" />
        <span aria-hidden="true" className="blob -bottom-24 -end-10 size-48 bg-accent" />
        <div className="relative z-10 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-start gap-3">
            <span
              className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-warm text-primary-fg shadow-glow"
              aria-hidden="true"
            >
              <Repeat className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-extrabold tracking-tight text-ink">
                הוספת שיעור קבוע (מחזורי)
              </h2>
              <p className="mt-1 text-sm text-muted">
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
      </Card>

      {error && (
        <div
          className="flex animate-fade-in items-center gap-2.5 rounded-2xl border border-danger bg-danger-soft px-4 py-3.5 text-sm font-semibold text-danger shadow-soft"
          role="alert"
        >
          <AlertCircle className="size-5 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {notice && (
        <div
          className="flex animate-fade-in items-center gap-2.5 rounded-2xl border border-success bg-success-soft px-4 py-3.5 text-sm font-semibold text-success shadow-soft"
          role="status"
        >
          <Check className="size-5 shrink-0" aria-hidden="true" />
          {notice}
        </div>
      )}

      {/* The calendar — replaces the old flat list. Day / week / month views.
          The shell stays glass; the dense grids inside opt into solid surfaces
          so a moving aurora never sits behind small time labels. */}
      <Card className="rise overflow-hidden">
        <CardHeader variant="gradient" className="p-5 pb-4 sm:p-6 sm:pb-4">
          <div className="flex items-center gap-3">
            <span
              className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-warm text-primary-fg shadow-glow"
              aria-hidden="true"
            >
              <CalendarDays className="size-5" />
            </span>
            <div className="min-w-0">
              <CardTitle className="text-xl">יומן שיעורים</CardTitle>
              <p className="text-sm text-muted">
                לחיצה על שיעור פותחת את הפרטים והפעולות
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-4 sm:p-5 sm:pt-5">
          <CalendarShell
            lessons={lessons}
            onAction={handleAction}
            onAssign={setAssignTarget}
            onReplace={setReplaceTarget}
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
          className="mb-5 flex gap-1 rounded-full border border-white/60 bg-primary-50 p-1 shadow-soft"
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
                  'flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2.5 text-sm font-semibold transition-[background-color,color,box-shadow] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                  active
                    ? 'bg-surface text-primary-700 shadow-card ring-1 ring-inset ring-white/70'
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
          <ManualLessonForm
            key={`manual-${formKey}`}
            studentOptions={studentOptions}
            onSuccess={() => setDialogOpen(false)}
          />
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

      <ReplaceLessonDialog
        open={replaceTarget !== null}
        onClose={() => setReplaceTarget(null)}
        lesson={replaceTarget}
        studentOptions={studentOptions}
        onReplaced={() => setNotice('השיעור הוחלף בהצלחה')}
      />
    </div>
  );
}
