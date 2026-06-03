'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatShekels } from '@/lib/utils';
import { formatILDateTime } from '@/lib/time';
import {
  approveLesson,
  rejectLesson,
  cancelLesson,
  type ActionResult,
} from './actions';
import { ManualLessonForm } from './ManualLessonForm';
import { RecurringForm } from './RecurringForm';
import type { LessonRow, StudentOption, GroupOption } from './data';

const STATUS_LABELS: Record<LessonRow['status'], string> = {
  pending: 'ממתין לאישור',
  confirmed: 'מאושר',
  completed: 'בוצע',
  rejected: 'נדחה',
  cancelled: 'בוטל',
};

const STATUS_STYLES: Record<LessonRow['status'], string> = {
  pending: 'bg-amber-100 text-amber-800',
  confirmed: 'bg-emerald-100 text-emerald-800',
  completed: 'bg-slate-100 text-slate-700',
  rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-500 line-through',
};

const FILTERS: Array<{ key: 'all' | LessonRow['status']; label: string }> = [
  { key: 'all', label: 'הכל' },
  { key: 'pending', label: 'ממתינים' },
  { key: 'confirmed', label: 'מאושרים' },
  { key: 'completed', label: 'בוצעו' },
  { key: 'cancelled', label: 'בוטלו' },
];

function StatusBadge({ status }: { status: LessonRow['status'] }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
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
  onAction: (fn: () => Promise<ActionResult>) => void;
  busy: boolean;
}) {
  const title =
    lesson.type === 'group_session'
      ? `קבוצה: ${lesson.groupName ?? '—'}`
      : `שיעור: ${lesson.studentName ?? '—'}`;
  const time = formatILDateTime(lesson.startsAt).slice(11); // HH:mm

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 py-3 last:border-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-900">{title}</span>
          <StatusBadge status={lesson.status} />
          {lesson.recurrenceId && (
            <span className="text-xs text-slate-400">חוזר</span>
          )}
        </div>
        <div className="mt-1 text-sm text-slate-500">
          {time}
          {lesson.price != null && ` · ${formatShekels(lesson.price)}`}
          {lesson.location && ` · ${lesson.location}`}
        </div>
        {lesson.notes && <div className="mt-1 text-xs text-slate-400">{lesson.notes}</div>}
      </div>
      <div className="flex shrink-0 gap-2">
        {lesson.status === 'pending' && (
          <>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => onAction(() => approveLesson(lesson.id))}
            >
              אשר
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => onAction(() => rejectLesson(lesson.id))}
            >
              דחה
            </Button>
          </>
        )}
        {lesson.status === 'confirmed' && (
          <Button
            size="sm"
            variant="destructive"
            disabled={busy}
            onClick={() => onAction(() => cancelLesson(lesson.id))}
          >
            בטל
          </Button>
        )}
      </div>
    </div>
  );
}

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
  const [busy, setBusy] = React.useState(false);
  const [, startTransition] = React.useTransition();

  const visible = filter === 'all' ? lessons : lessons.filter((l) => l.status === filter);
  const days = groupByDay(visible);

  function handleAction(fn: () => Promise<ActionResult>) {
    setError(null);
    setBusy(true);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? 'שגיאה');
      setBusy(false);
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <ManualLessonForm />
        <RecurringForm studentOptions={studentOptions} groupOptions={groupOptions} />
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>יומן שיעורים</CardTitle>
          <div className="mt-3 flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  filter === f.key
                    ? 'bg-brand text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {days.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">אין שיעורים להצגה.</p>
          ) : (
            <div className="space-y-6">
              {days.map(({ day, items }) => (
                <div key={day}>
                  <h3 className="mb-1 text-sm font-semibold text-slate-700">{day}</h3>
                  {items.map((lesson) => (
                    <LessonItem
                      key={lesson.id}
                      lesson={lesson}
                      onAction={handleAction}
                      busy={busy}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
