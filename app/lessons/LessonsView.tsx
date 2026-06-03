'use client';

import * as React from 'react';
import {
  Plus,
  Check,
  X,
  Ban,
  Repeat,
  MapPin,
  CalendarDays,
  CalendarPlus,
  AlertCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusPill, type StatusKind } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { cn, formatShekels } from '@/lib/utils';
import { formatILDateTime } from '@/lib/time';
import {
  approveLesson,
  rejectLesson,
  cancelLesson,
  type ActionResult,
} from './actions';
import { ManualLessonForm } from './ManualLessonForm';
import { RecurringForm } from './RecurringForm';
import { LessonDialog } from './LessonDialog';
import type { LessonRow, StudentOption, GroupOption } from './data';

const FILTERS: Array<{ key: 'all' | LessonRow['status']; label: string }> = [
  { key: 'all', label: 'הכל' },
  { key: 'pending', label: 'ממתינים' },
  { key: 'confirmed', label: 'מאושרים' },
  { key: 'completed', label: 'בוצעו' },
  { key: 'cancelled', label: 'בוטלו' },
];

// lesson.status is a subset of StatusKind, so the pill map handles it directly.
function lessonStatusKind(status: LessonRow['status']): StatusKind {
  return status as StatusKind;
}

function groupByDay(rows: LessonRow[]): Array<{ day: string; items: LessonRow[] }> {
  const map = new Map<string, LessonRow[]>();
  for (const r of rows) {
    const day = formatILDateTime(r.startsAt).slice(0, 10); // dd/MM/yyyy
    const arr = map.get(day) ?? [];
    arr.push(r);
    map.set(day, arr);
  }
  return Array.from(map.entries()).map(([day, items]) => ({ day, items }));
}

function LessonItem({
  lesson,
  onAction,
  busy,
}: {
  lesson: LessonRow;
  onAction: (id: string, fn: () => Promise<ActionResult>) => void;
  busy: boolean;
}) {
  const isGroup = lesson.type === 'group_session';
  const title = isGroup
    ? `קבוצה: ${lesson.groupName ?? '—'}`
    : `שיעור: ${lesson.studentName ?? '—'}`;
  const time = formatILDateTime(lesson.startsAt).slice(11); // HH:mm

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-3.5 last:border-0">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-ink">{title}</span>
          <StatusPill status={lessonStatusKind(lesson.status)} />
          {lesson.recurrenceId && (
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              <Repeat className="size-3.5" aria-hidden="true" />
              חוזר
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
          <span className="tabular-nums" dir="ltr">
            {time}
          </span>
          {lesson.price != null && (
            <>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{formatShekels(lesson.price)}</span>
            </>
          )}
          {lesson.location && (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                {lesson.location}
              </span>
            </>
          )}
        </div>
        {lesson.notes && <p className="mt-1 text-xs text-muted/90">{lesson.notes}</p>}
      </div>
      <div className="flex shrink-0 gap-2">
        {lesson.status === 'pending' && (
          <>
            <Button
              size="md"
              loading={busy}
              onClick={() => onAction(lesson.id, () => approveLesson(lesson.id))}
            >
              <Check className="size-4" aria-hidden="true" />
              אשר
            </Button>
            <Button
              size="md"
              variant="secondary"
              disabled={busy}
              onClick={() => onAction(lesson.id, () => rejectLesson(lesson.id))}
            >
              <X className="size-4" aria-hidden="true" />
              דחה
            </Button>
          </>
        )}
        {lesson.status === 'confirmed' && (
          <Button
            size="md"
            variant="danger"
            loading={busy}
            onClick={() => onAction(lesson.id, () => cancelLesson(lesson.id))}
          >
            <Ban className="size-4" aria-hidden="true" />
            בטל
          </Button>
        )}
      </div>
    </div>
  );
}

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
  const [filter, setFilter] = React.useState<'all' | LessonRow['status']>('all');
  const [error, setError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [tab, setTab] = React.useState<CreateTab>('manual');
  // Bumped each time the dialog opens so the forms remount and their
  // useActionState (and thus the success/error message) starts fresh.
  const [formKey, setFormKey] = React.useState(0);
  const [, startTransition] = React.useTransition();

  const visible =
    filter === 'all' ? lessons : lessons.filter((l) => l.status === filter);
  const days = groupByDay(visible);

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="שיעורים"
        subtitle="יומן השיעורים — אישור, דחייה, ביטול ויצירת שיעורים"
        actions={
          <Button onClick={() => openCreate('manual')}>
            <Plus className="size-4" aria-hidden="true" />
            שיעור חדש
          </Button>
        }
      />

      {error && (
        <div
          className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger"
          role="alert"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>יומן שיעורים</CardTitle>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => openCreate('recurring')}
            >
              <Repeat className="size-4" aria-hidden="true" />
              שיעור חוזר
            </Button>
          </div>
          <div
            className="mt-3 flex flex-wrap gap-1.5"
            role="group"
            aria-label="סינון שיעורים"
          >
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    'inline-flex min-h-11 items-center rounded-full px-4 py-2.5 text-sm font-medium transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                    active
                      ? 'bg-primary text-primary-fg shadow-soft'
                      : 'text-muted hover:bg-primary-50 hover:text-ink',
                  )}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </CardHeader>
        <CardContent>
          {days.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="אין שיעורים להצגה"
              description="לא נמצאו שיעורים בסינון הנוכחי. אפשר ליצור שיעור חדש או לשנות את הסינון."
              action={
                <Button onClick={() => openCreate('manual')}>
                  <Plus className="size-4" aria-hidden="true" />
                  שיעור חדש
                </Button>
              }
            />
          ) : (
            <div className="space-y-6">
              {days.map(({ day, items }) => (
                <div key={day}>
                  <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-ink">
                    <CalendarDays className="size-4 text-primary-600" aria-hidden="true" />
                    <span className="tabular-nums" dir="ltr">
                      {day}
                    </span>
                  </h3>
                  {items.map((lesson) => (
                    <LessonItem
                      key={lesson.id}
                      lesson={lesson}
                      onAction={handleAction}
                      busy={busyId === lesson.id}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
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
                  'flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  active
                    ? 'bg-surface text-ink shadow-soft'
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
    </div>
  );
}
