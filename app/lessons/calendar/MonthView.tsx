'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { EventBlock } from './EventBlock';
import {
  monthGridKeys,
  eventsOnDay,
  isSameMonthKey,
  weekdayOfKey,
  HE_WEEKDAYS_SHORT,
} from './calendar-lib';
import type { LessonRow } from '../data';

// Month grid: weeks as rows, Sun→Sat columns. RTL puts Sunday on the right.
// Each cell lists up to MAX_VISIBLE events, then a "+N נוספים" overflow button
// that jumps the parent into the day view for that date.

const MAX_VISIBLE = 3;

export function MonthView({
  anchorKey,
  events,
  todayKey,
  onEventClick,
  onDayClick,
}: {
  anchorKey: string;
  events: LessonRow[];
  todayKey: string;
  onEventClick: (lesson: LessonRow) => void;
  /** Open the day view for a given day key (used by overflow + day-number). */
  onDayClick: (key: string) => void;
}) {
  const cells = React.useMemo(() => monthGridKeys(anchorKey), [anchorKey]);

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface" dir="rtl">
      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-line bg-gradient-tint">
        {HE_WEEKDAYS_SHORT.map((label, i) => (
          <div
            key={i}
            className="px-2 py-2 text-center text-xs font-bold text-muted"
          >
            {label}
          </div>
        ))}
      </div>
      {/* Day cells */}
      <div className="grid grid-cols-7">
        {cells.map((key) => {
          const dayEvents = eventsOnDay(events, key);
          const inMonth = isSameMonthKey(key, anchorKey);
          const isToday = key === todayKey;
          const dayNum = Number(key.slice(8, 10));
          // Saturday only — Friday can have lessons, so it is NOT dimmed.
          const isRestDay = weekdayOfKey(key) === 6;
          const visible = dayEvents.slice(0, MAX_VISIBLE);
          const overflow = dayEvents.length - visible.length;
          return (
            <div
              key={key}
              className={cn(
                'flex min-h-24 flex-col gap-1 border-b border-s border-line p-1.5 last:border-s-0 [&:nth-child(7n)]:border-s-0',
                !inMonth && 'bg-cream/40',
                isRestDay && inMonth && 'bg-surface-2/30',
              )}
            >
              <button
                type="button"
                onClick={() => onDayClick(key)}
                className={cn(
                  'inline-flex size-7 shrink-0 items-center justify-center self-end rounded-full text-xs font-bold tabular-nums transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  isToday
                    ? 'bg-primary text-primary-fg'
                    : inMonth
                      ? 'text-ink hover:bg-primary-50'
                      : 'text-muted hover:bg-primary-50',
                )}
                aria-label={`פתח יום ${dayNum}`}
              >
                {dayNum}
              </button>
              <div className="flex min-h-0 flex-1 flex-col gap-0.5">
                {visible.map((lesson) => (
                  <EventBlock
                    key={lesson.id}
                    lesson={lesson}
                    onClick={onEventClick}
                    variant="list"
                  />
                ))}
                {overflow > 0 && (
                  <button
                    type="button"
                    onClick={() => onDayClick(key)}
                    className="mt-px rounded-md px-1.5 py-0.5 text-start text-[11px] font-semibold text-primary-600 transition-colors duration-150 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    +{overflow} נוספים
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
