'use client';

import * as React from 'react';
import { ChevronRight, ChevronLeft, CalendarDays, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CalendarView } from './calendar-lib';
import { dayLabel, weekRangeLabel, monthLabel } from './calendar-lib';

// Toolbar above the calendar: the day/week/month segmented switcher, the date
// navigation (‹ › + היום) with the current-range Hebrew label, and a toggle for
// showing cancelled lessons. Management actions live above this in the header.

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
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      {/* View switcher — segmented control */}
      <div
        className="inline-flex shrink-0 gap-1 rounded-xl bg-primary-50 p-1"
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
                'inline-flex min-h-11 min-w-16 items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition-[background-color,color,box-shadow] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                active
                  ? 'bg-surface text-primary-600 shadow-soft'
                  : 'text-muted hover:text-ink',
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Date navigation */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToday}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-surface px-3.5 py-2 text-sm font-semibold text-ink shadow-soft transition-[background-color,border-color] duration-200 ease-out hover:border-primary-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          <CalendarDays className="size-4" aria-hidden="true" />
          היום
        </button>
        {/* RTL: previous = chevron-right, next = chevron-left */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onPrev}
            aria-label="הקודם"
            className="inline-flex size-11 items-center justify-center rounded-xl border border-line bg-surface text-muted shadow-soft transition-[background-color,border-color,color] duration-200 ease-out hover:border-primary-200 hover:bg-primary-50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <ChevronRight className="size-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onNext}
            aria-label="הבא"
            className="inline-flex size-11 items-center justify-center rounded-xl border border-line bg-surface text-muted shadow-soft transition-[background-color,border-color,color] duration-200 ease-out hover:border-primary-200 hover:bg-primary-50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
          </button>
        </div>
        <h2
          className="min-w-0 flex-1 px-1 text-base font-bold text-ink lg:text-lg"
          aria-live="polite"
        >
          {rangeLabel(view, anchorKey)}
        </h2>
      </div>

      {/* Show/hide cancelled */}
      <button
        type="button"
        onClick={onToggleCancelled}
        aria-pressed={showCancelled}
        className={cn(
          'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-medium shadow-soft transition-[background-color,border-color,color] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
          showCancelled
            ? 'border-primary-200 bg-primary-50 text-primary-600'
            : 'border-line bg-surface text-muted hover:border-primary-200 hover:text-ink',
        )}
        title="הצגה או הסתרה של שיעורים שבוטלו/נדחו"
      >
        {showCancelled ? (
          <Eye className="size-4" aria-hidden="true" />
        ) : (
          <EyeOff className="size-4" aria-hidden="true" />
        )}
        {showCancelled ? 'מציג מבוטלים' : 'מסתיר מבוטלים'}
      </button>
    </div>
  );
}
