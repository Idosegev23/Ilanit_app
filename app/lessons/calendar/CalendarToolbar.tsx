'use client';

import * as React from 'react';
import { ChevronRight, ChevronLeft, CalendarDays, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CalendarView } from './calendar-lib';
import { dayLabel, weekRangeLabel, monthLabel } from './calendar-lib';

// Toolbar above the calendar: the day/week/month segmented switcher, the date
// navigation (‹ › + היום) with the current-range Hebrew label, and a toggle for
// showing cancelled lessons. Management actions live above this in the header.
//
// v4: one glass bar that stacks into two comfortable rows on a phone —
//   row 1  [‹][›][היום]   ← range label →
//   row 2  [ יומי | שבועי | חודשי ]           [👁]
// and collapses to a single row from `lg`. Every control clears 44px; the
// long-form labels on `היום` and the cancelled toggle fold into icon-only
// buttons below `sm` (their Hebrew text is preserved in aria-label/title).

const VIEW_OPTIONS: Array<{ key: CalendarView; label: string }> = [
  { key: 'day', label: 'יומי' },
  { key: 'week', label: 'שבועי' },
  { key: 'month', label: 'חודשי' },
];

function rangeLabel(view: CalendarView, anchorKey: string): string {
  if (view === 'day') return dayLabel(anchorKey);
  if (view === 'week') return weekRangeLabel(anchorKey);
  return monthLabel(anchorKey);
}

export function CalendarToolbar({
  view,
  onViewChange,
  anchorKey,
  onPrev,
  onNext,
  onToday,
  showCancelled,
  onToggleCancelled,
}: {
  view: CalendarView;
  onViewChange: (v: CalendarView) => void;
  anchorKey: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  showCancelled: boolean;
  onToggleCancelled: () => void;
}) {
  // Shared recipe for the free-standing glass controls (nav arrows, היום, eye).
  const control =
    'inline-flex items-center justify-center rounded-full border border-white/70 bg-white/80 shadow-soft backdrop-blur transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out hover:-translate-y-px hover:border-primary-300 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-surface';

  const cancelledLabel = showCancelled ? 'מציג מבוטלים' : 'מסתיר מבוטלים';

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/60 bg-white/70 p-2.5 shadow-soft backdrop-blur-xl sm:p-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
      {/* ── Date navigation + the live range label ── */}
      <div className="flex min-w-0 items-center gap-2">
        {/* RTL: previous = chevron-right, next = chevron-left */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onPrev}
            aria-label="הקודם"
            className={cn(control, 'size-11 text-muted hover:text-ink')}
          >
            <ChevronRight className="size-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onNext}
            aria-label="הבא"
            className={cn(control, 'size-11 text-muted hover:text-ink')}
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          onClick={onToday}
          aria-label="היום"
          title="היום"
          className={cn(
            control,
            'size-11 shrink-0 gap-1.5 text-sm font-semibold text-ink sm:w-auto sm:px-4',
          )}
        >
          <CalendarDays className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">היום</span>
        </button>
        <h2
          className="min-w-0 flex-1 text-start text-base font-extrabold tracking-tight tabular-nums text-ink sm:text-lg"
          aria-live="polite"
        >
          {rangeLabel(view, anchorKey)}
        </h2>
      </div>

      {/* ── View switcher + cancelled toggle ── */}
      <div className="flex items-center gap-2">
        {/* Segmented control. The active pill is INK-on-white rather than a
            pink tint: at this size a blush chip on a blush track is a 1.2:1
            difference and "which view am I on" stops reading at a glance. */}
        <div
          className="flex flex-1 gap-1 rounded-full border border-white/70 bg-primary-50 p-1 lg:flex-none"
          role="group"
          aria-label="תצוגת יומן"
        >
          {VIEW_OPTIONS.map((opt) => {
            const active = view === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                aria-pressed={active}
                onClick={() => onViewChange(opt.key)}
                className={cn(
                  'inline-flex min-h-11 flex-1 items-center justify-center rounded-full px-3 text-sm font-semibold transition-[background-color,color,box-shadow] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-surface lg:flex-none lg:min-w-20 lg:px-4',
                  active
                    ? 'bg-ink text-white shadow-card'
                    : 'text-muted hover:text-ink',
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Show/hide cancelled — icon-only on a phone, the Hebrew label rides
            along in aria-label so nothing is lost. */}
        <button
          type="button"
          onClick={onToggleCancelled}
          aria-pressed={showCancelled}
          aria-label={cancelledLabel}
          className={cn(
            control,
            'size-11 shrink-0 gap-1.5 text-sm font-semibold sm:w-auto sm:px-4',
            showCancelled
              ? 'border-primary-300 bg-primary-50 text-primary-700'
              : 'text-muted hover:text-ink',
          )}
          title="הצגה או הסתרה של שיעורים שבוטלו/נדחו"
        >
          {showCancelled ? (
            <Eye className="size-4" aria-hidden="true" />
          ) : (
            <EyeOff className="size-4" aria-hidden="true" />
          )}
          <span className="hidden sm:inline">{cancelledLabel}</span>
        </button>
      </div>
    </div>
  );
}
