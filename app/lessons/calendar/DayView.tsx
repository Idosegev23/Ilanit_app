'use client';

import * as React from 'react';
import { CalendarDays } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { EventBlock } from './EventBlock';
import {
  eventsOnDay,
  deriveTimeBounds,
  layoutDayEvents,
  minutesOfDay,
  dayKey as dayKeyOf,
  type TimeBounds,
} from './calendar-lib';
import type { LessonRow } from '../data';

// Single-day view: a taller time grid with (mostly) full-width event blocks.
// Overlapping events still split into side-by-side columns. This is also the
// mobile fallback for the week view, and the surface this screen is used on
// most — it has to be excellent at 390px.
//
// The card is `solid`, not glass: a moving aurora behind a dense hour grid
// destroys the legibility of 11px time labels.

const ROW_PX = 64;

/**
 * "Now", refreshed once a minute. Starts null so the server render and the
 * first client render agree — the indicator fades in after hydration.
 */
function useNow(): Date | null {
  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** Fractional position (0–1) of `now` inside the visible window, or null. */
function nowFraction(now: Date | null, bounds: TimeBounds): number | null {
  if (!now) return null;
  const start = bounds.startHour * 60;
  const end = bounds.endHour * 60;
  const min = minutesOfDay(now);
  if (min < start || min > end) return null;
  return (min - start) / Math.max(1, end - start);
}

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

  const now = useNow();
  const isToday = now !== null && dayKeyOf(now) === dayKey;
  const nowAt = isToday ? nowFraction(now, bounds) : null;

  if (dayEvents.length === 0) {
    return (
      <Card
        solid
        className="flex animate-fade-in flex-col items-center justify-center gap-4 px-6 py-16 text-center"
      >
        <span
          className="flex size-16 items-center justify-center rounded-full bg-primary-soft text-primary-700 shadow-soft ring-1 ring-inset ring-white/70"
          aria-hidden="true"
        >
          <CalendarDays className="size-7" />
        </span>
        <p className="text-base font-semibold text-ink">אין שיעורים ביום זה</p>
      </Card>
    );
  }

  return (
    <Card solid className="animate-fade-in overflow-hidden">
      <div className="flex" dir="rtl">
        {/* Hour gutter — a soft blush rail so the time column reads as chrome
            rather than as another data row. */}
        <div
          className="shrink-0 border-e border-line bg-surface-2"
          style={{ width: 56 }}
        >
          {hours.map((h, i) => (
            <div
              key={h}
              className="relative border-b border-line"
              style={{ height: ROW_PX }}
            >
              <span
                className={cn(
                  'absolute inline-block w-full pe-2 text-end text-[11px] font-semibold tabular-nums text-muted',
                  // The very first label would be clipped by the card's
                  // rounded overflow if it hung above its row.
                  i === 0 ? 'top-1' : '-top-2',
                )}
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
                'absolute inset-x-0 border-b border-line',
                i === 0 && 'border-t',
              )}
              style={{ top: i * ROW_PX, height: ROW_PX }}
            />
          ))}
          {/* Half-hour hairlines — quiet rhythm that makes a 30-minute block
              readable without adding another solid rule. */}
          {hours.map((_, i) => (
            <div
              key={`half-${i}`}
              className="pointer-events-none absolute inset-x-0 border-b border-dashed border-line"
              style={{ top: i * ROW_PX + ROW_PX / 2 }}
              aria-hidden="true"
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
          {/* Now indicator */}
          {nowAt !== null && (
            <div
              className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
              style={{ top: `${nowAt * 100}%` }}
              aria-hidden="true"
            >
              <span className="-ms-1 size-2.5 shrink-0 rounded-full bg-danger shadow-soft ring-2 ring-white" />
              <span className="h-px flex-1 bg-danger" />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
