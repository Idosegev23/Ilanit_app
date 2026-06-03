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
  Clock,
  User,
  Users,
  CalendarClock,
  CalendarCheck2,
  StickyNote,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusPill, type StatusKind } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
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

const HE_WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

interface DayGroup {
  key: string; // dd/MM/yyyy
  date: Date;
  dayNum: string; // dd
  monthShort: string; // MM
  weekday: string; // Hebrew weekday name
  relative: string | null; // היום / מחר / אתמול
  items: LessonRow[];
}

function relativeDayLabel(target: Date, today: Date): string | null {
  const ms = 24 * 60 * 60 * 1000;
  const startOf = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((startOf(target) - startOf(today)) / ms);
  if (diff === 0) return 'היום';
  if (diff === 1) return 'מחר';
  if (diff === -1) return 'אתמול';
  return null;
}

function groupByDay(rows: LessonRow[]): DayGroup[] {
  const today = new Date();
  const map = new Map<string, LessonRow[]>();
  for (const r of rows) {
    const day = formatILDateTime(r.startsAt).slice(0, 10); // dd/MM/yyyy
    const arr = map.get(day) ?? [];
    arr.push(r);
    map.set(day, arr);
  }
  return Array.from(map.entries()).map(([day, items]) => {
    const date = items[0].startsAt;
    const [dd, mm] = day.split('/');
    return {
      key: day,
      date,
      dayNum: dd,
      monthShort: mm,
      weekday: HE_WEEKDAYS[date.getDay()] ?? '',
      relative: relativeDayLabel(date, today),
      items,
    };
  });
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
  const TypeIcon = isGroup ? Users : User;
  const isActionable = lesson.status === 'pending' || lesson.status === 'confirmed';
  const dimmed = lesson.status === 'rejected' || lesson.status === 'cancelled';

  return (
    <div
      className={cn(
        'group relative flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-surface p-4 shadow-soft transition-[transform,box-shadow,border-color] duration-200 ease-out motion-safe:hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-card',
        dimmed && 'opacity-70',
      )}
    >
      {/* Type icon chip */}
      <span
        className={cn(
          'flex size-11 shrink-0 items-center justify-center rounded-xl shadow-soft',
          isGroup
            ? 'bg-accent-soft text-accent-text'
            : 'bg-primary-soft text-primary-600',
        )}
        aria-hidden="true"
      >
        <TypeIcon className="size-5" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-semibold text-ink">{title}</span>
          <StatusPill status={lessonStatusKind(lesson.status)} />
          {lesson.recurrenceId && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-muted">
              <Repeat className="size-3.5" aria-hidden="true" />
              חוזר
            </span>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          <span className="inline-flex items-center gap-1.5 font-medium text-ink">
            <Clock className="size-3.5 text-muted" aria-hidden="true" />
            <span className="tabular-nums" dir="ltr">
              {time}
            </span>
          </span>
          {lesson.price != null && (
            <span className="inline-flex items-center gap-1 tabular-nums font-medium text-ink">
              {formatShekels(lesson.price)}
            </span>
          )}
          {lesson.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
              {lesson.location}
            </span>
          )}
        </div>
        {lesson.notes && (
          <p className="mt-2 inline-flex items-start gap-1.5 rounded-lg bg-cream px-2.5 py-1.5 text-xs leading-relaxed text-muted">
            <StickyNote className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {lesson.notes}
          </p>
        )}
      </div>

      {isActionable && (
        <div className="flex shrink-0 gap-2 max-sm:w-full">
          {lesson.status === 'pending' && (
            <>
              <Button
                size="md"
                loading={busy}
                className="max-sm:flex-1"
                onClick={() => onAction(lesson.id, () => approveLesson(lesson.id))}
              >
                <Check className="size-4" aria-hidden="true" />
                אשר
              </Button>
              <Button
                size="md"
                variant="secondary"
                disabled={busy}
                className="max-sm:flex-1"
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
              className="max-sm:flex-1"
              onClick={() => onAction(lesson.id, () => cancelLesson(lesson.id))}
            >
              <Ban className="size-4" aria-hidden="true" />
              בטל
            </Button>
          )}
        </div>
      )}
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

  // ── Summary counts (presentation only — derived from the same rows) ──
  const counts = React.useMemo(() => {
    const c: Record<'all' | LessonRow['status'], number> = {
      all: lessons.length,
      pending: 0,
      confirmed: 0,
      completed: 0,
      rejected: 0,
      cancelled: 0,
    };
    for (const l of lessons) c[l.status] += 1;
    return c;
  }, [lessons]);

  const upcomingConfirmed = React.useMemo(() => {
    const now = Date.now();
    return lessons.filter(
      (l) => l.status === 'confirmed' && l.startsAt.getTime() >= now,
    ).length;
  }, [lessons]);

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
    <div className="space-y-8">
      <PageHeader
        eyebrow="ניהול יומן"
        title="שיעורים"
        subtitle="אישור, דחייה וביטול שיעורים — ויצירת שיעורים חד-פעמיים וסדרות חוזרות."
        actions={
          <>
            <Button variant="secondary" onClick={() => openCreate('recurring')}>
              <Repeat className="size-4" aria-hidden="true" />
              שיעור חוזר
            </Button>
            <Button onClick={() => openCreate('manual')}>
              <Plus className="size-4" aria-hidden="true" />
              שיעור חדש
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

      {error && (
        <div
          className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm font-medium text-danger"
          role="alert"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      <Card>
        <CardHeader variant="gradient">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span
                className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-warm text-primary-fg shadow-soft"
                aria-hidden="true"
              >
                <CalendarDays className="size-5" />
              </span>
              <div>
                <CardTitle>יומן שיעורים</CardTitle>
                <p className="text-sm text-muted">לפי תאריך, מהקרוב לרחוק</p>
              </div>
            </div>
          </div>
          <div
            className="mt-4 flex flex-wrap gap-1.5"
            role="group"
            aria-label="סינון שיעורים"
          >
            {FILTERS.map((f) => {
              const active = filter === f.key;
              const count = counts[f.key];
              return (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    'inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition-[background-color,color,box-shadow] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                    active
                      ? 'bg-primary text-primary-fg shadow-soft'
                      : 'bg-surface/70 text-muted hover:bg-primary-50 hover:text-ink',
                  )}
                >
                  {f.label}
                  <span
                    className={cn(
                      'inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums',
                      active
                        ? 'bg-primary-fg/20 text-primary-fg'
                        : 'bg-primary-50 text-primary-600',
                    )}
                  >
                    {count}
                  </span>
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
            <div className="space-y-8">
              {days.map(({ key, dayNum, monthShort, weekday, relative, items }) => (
                <section key={key} aria-label={`${weekday} ${key}`}>
                  {/* Day header — a "date chip" rail that anchors the group */}
                  <div className="mb-3 flex items-center gap-3">
                    <div className="flex shrink-0 flex-col items-center justify-center rounded-xl border border-line bg-gradient-tint px-3 py-1.5 shadow-soft">
                      <span className="text-lg font-bold leading-none tabular-nums text-primary-600">
                        {dayNum}
                      </span>
                      <span className="mt-0.5 text-[10px] font-medium tabular-nums text-muted">
                        {monthShort}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-ink">{weekday}</h3>
                        {relative && (
                          <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary-600">
                            {relative}
                          </span>
                        )}
                      </div>
                      <p className="text-xs tabular-nums text-muted" dir="ltr">
                        {key}
                      </p>
                    </div>
                    <span
                      className="ms-auto inline-flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium tabular-nums text-muted"
                      aria-hidden="true"
                    >
                      {items.length}
                    </span>
                  </div>
                  <div className="space-y-2.5 border-s-2 border-line ps-4">
                    {items.map((lesson) => (
                      <LessonItem
                        key={lesson.id}
                        lesson={lesson}
                        onAction={handleAction}
                        busy={busyId === lesson.id}
                      />
                    ))}
                  </div>
                </section>
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
    </div>
  );
}
