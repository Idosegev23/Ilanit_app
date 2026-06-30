'use client';

import * as React from 'react';
import { CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EventBlock } from './EventBlock';
import {
  eventsOnDay,
  deriveTimeBounds,
  layoutDayEvents,
  type TimeBounds,
} from './calendar-lib';
import type { LessonRow } from '../data';

// Single-day view: a taller time grid with (mostly) full-width event blocks.
// Overlapping events still split into side-by-side columns. This is also the
// mobile fallback for the week view.

const ROW_PX = 64;

export function DayView({
  dayKey,
  events,
  onEventClick,
}: {
  dayKey: string;
  events: LessonRow[];
  onEventClick: (lesson: LessonRow) => void;
}) {
  const dayEvents = eventsOnDay(events, dayKey);
  const bounds: TimeBounds = React.useMemo(
    () => deriveTimeBounds(dayEvents),
    [dayEvents],
  );
  const positioned = layoutDayEvents(dayEvents, bounds);
  const hours: number[] = [];
  for (let h = bounds.startHour; h < bounds.endHour; h++) hours.push(h);
  const totalHeight = hours.length * ROW_PX;

  if (dayEvents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line bg-surface px-6 py-16 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary-600">
          <CalendarDays className="size-6" aria-hidden="true" />
        </span>
        <p className="text-sm font-medium text-muted">
          אין שיעורים ביום זה
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex" dir="rtl">
        {/* Hour gutter */}
        <div className="shrink-0" style={{ width: 56 }}>
          {hours.map((h) => (
            <div
              key={h}
              className="relative border-b border-line/60"
              style={{ height: ROW_PX }}
            >
              <span
                className="absolute -top-2 inline-block w-full pe-2 text-end text-xs tabular-nums text-muted"
                dir="ltr"
              >
                {String(h).padStart(2, '0')}:00
              </span>
            </div>
          ))}
        </div>
        {/* Track */}
        <div className="relative flex-1" style={{ height: totalHeight }}>
          {hours.map((_, i) => (
            <div
              key={i}
              className={cn(
                'absolute inset-x-0 border-b border-line/50',
                i === 0 && 'border-t',
              )}
              style={{ top: i * ROW_PX, height: ROW_PX }}
            />
          ))}
          {positioned.map((p) => {
            const widthPct = 100 / p.cols;
            return (
              <EventBlock
                key={p.lesson.id}
                lesson={p.lesson}
                onClick={onEventClick}
                variant="grid"
                style={{
                  top: `${p.top * 100}%`,
                  height: `${p.height * 100}%`,
                  insetInlineStart: `calc(${p.col * widthPct}% + 4px)`,
                  width: `calc(${widthPct}% - 8px)`,
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
