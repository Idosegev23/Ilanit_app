'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
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
//
// Cell tinting is deliberately split across two hue families so the three
// states never get confused with one another: white = a normal day of this
// month, peach = Saturday (rest day), blush = a day belonging to the adjacent
// month. Today keeps the ink pill, which beats every tint.

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
    <Card solid className="animate-fade-in overflow-hidden" dir="rtl">
      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-line bg-gradient-tint">
        {HE_WEEKDAYS_SHORT.map((label, i) => (
          <div
            key={i}
            className="px-2 py-2.5 text-center text-[11px] font-bold tracking-wide text-muted"
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
                'flex min-h-24 flex-col gap-1 border-b border-s border-line p-1.5 last:border-s-0 sm:min-h-28 [&:nth-child(7n)]:border-s-0',
                isRestDay && inMonth && 'bg-accent-soft',
                !inMonth && 'bg-primary-50',
              )}
            >
              {/* 44px hit area with a 28px visual pill inside it — the grid
                  stays dense without shrinking the tap target. */}
              <button
                type="button"
                onClick={() => onDayClick(key)}
                className="group inline-flex size-11 shrink-0 items-center justify-center self-end rounded-full transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-1 focus-visible:ring-offset-surface"
                aria-label={`פתח יום ${dayNum}`}
              >
                <span
                  className={cn(
                    'inline-flex size-7 items-center justify-center rounded-full text-xs font-bold tabular-nums transition-colors duration-200 ease-out',
                    isToday
                      ? 'bg-ink text-white shadow-card'
                      : inMonth
                        ? 'text-ink group-hover:bg-primary-100'
                        : 'text-muted group-hover:bg-primary-100',
                  )}
                >
                  {dayNum}
                </span>
              </button>
              <div className="flex min-h-0 flex-1 flex-col gap-1">
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
                    className="inline-flex min-h-8 items-center justify-center rounded-full px-2 text-[11px] font-bold text-primary-700 transition-colors duration-200 ease-out hover:bg-primary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-1 focus-visible:ring-offset-surface"
                  >
                    +{overflow} נוספים
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
