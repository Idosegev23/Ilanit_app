'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { EventBlock } from './EventBlock';
import {
  weekDayKeys,
  eventsOnDay,
  deriveTimeBounds,
  layoutDayEvents,
  minutesOfDay,
  HE_WEEKDAYS_LONG,
  HE_WEEKDAYS_SHORT,
  weekdayOfKey,
  dayKey,
  type TimeBounds,
} from './calendar-lib';
import type { LessonRow } from '../data';

// Week grid: 7 day columns Sunday→Saturday. RTL means Sunday sits on the RIGHT
// (achieved by ordering columns Sun→Sat inside a dir="rtl" flow). A time gutter
// runs down the side; events are absolutely positioned within each day column.
//
// Solid surface, not glass — see the note in DayView. The wrapper in
// CalendarShell gives this a horizontal scroll container so the seven columns
// never squeeze the page.

const ROW_PX = 56; // height of one hour row
const HEADER_PX = 56; // day-name row — kept in step between gutter and columns

/** "Now", refreshed once a minute; null until hydration (see DayView). */
function useNow(): Date | null {
  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function HourLabels({ bounds }: { bounds: TimeBounds }) {
  const hours: number[] = [];
  for (let h = bounds.startHour; h < bounds.endHour; h++) hours.push(h);
  return (
    <div
      className="shrink-0 border-e border-line bg-surface-2"
      style={{ width: 52 }}
    >
      {/* header spacer aligns with the day-name row */}
      <div className="border-b border-line" style={{ height: HEADER_PX }} />
      {hours.map((h, i) => (
        <div
          key={h}
          className="relative border-b border-line"
          style={{ height: ROW_PX }}
        >
          <span
            className={cn(
              'absolute inline-block w-full pe-1.5 text-end text-[11px] font-semibold tabular-nums text-muted',
              i === 0 ? 'top-0.5' : '-top-2',
            )}
            dir="ltr"
          >
            {String(h).padStart(2, '0')}:00
          </span>
        </div>
      ))}
    </div>
  );
}

export function WeekView({
  anchorKey,
  events,
  todayKey,
  onEventClick,
}: {
  anchorKey: string;
  events: LessonRow[];
  todayKey: string;
  onEventClick: (lesson: LessonRow) => void;
}) {
  const dayKeys = weekDayKeys(anchorKey);
  const bounds = React.useMemo(() => deriveTimeBounds(events), [events]);
  const totalHeight = (bounds.endHour - bounds.startHour) * ROW_PX;

  const now = useNow();
  const nowAt = React.useMemo(() => {
    if (!now) return null;
    const start = bounds.startHour * 60;
    const end = bounds.endHour * 60;
    const min = minutesOfDay(now);
    if (min < start || min > end) return null;
    return (min - start) / Math.max(1, end - start);
  }, [now, bounds]);

  return (
    <Card solid className="animate-fade-in overflow-hidden">
      <div className="flex" dir="rtl">
        <HourLabels bounds={bounds} />
        {/* Day columns — first DOM child (ראשון) lands on the right under RTL */}
        <div className="grid flex-1 grid-cols-7">
          {dayKeys.map((key) => {
            const dayEvents = eventsOnDay(events, key);
            const positioned = layoutDayEvents(dayEvents, bounds);
            const wd = weekdayOfKey(key);
            const isToday = key === todayKey;
            const dayNum = Number(key.slice(8, 10));
            return (
              <div
                key={key}
                className={cn(
                  'min-w-0 border-s border-line first:border-s-0',
                  // Saturday — rest day, warmed with the peach family so it
                  // never reads as "selected" the way a blush tint would.
                  wd === 6 && 'bg-accent-soft',
                )}
              >
                {/* Day header */}
                <div
                  className={cn(
                    'relative flex flex-col items-center justify-center gap-0.5 border-b border-line',
                    isToday ? 'bg-primary-200' : 'bg-gradient-tint',
                  )}
                  style={{ height: HEADER_PX }}
                >
                  <span
                    className={cn(
                      'text-[11px] font-semibold',
                      isToday ? 'text-ink' : 'text-muted',
                    )}
                  >
                    <span className="hidden sm:inline">
                      {HE_WEEKDAYS_LONG[wd]}
                    </span>
                    <span className="sm:hidden">{HE_WEEKDAYS_SHORT[wd]}</span>
                  </span>
                  <span
                    className={cn(
                      'inline-flex size-7 items-center justify-center rounded-full text-sm font-extrabold tabular-nums text-ink',
                      isToday && 'bg-ink text-white shadow-card',
                    )}
                  >
                    {dayNum}
                  </span>
                </div>
                {/* Time column */}
                <div
                  className={cn('relative', isToday && 'bg-primary-50')}
                  style={{ height: totalHeight }}
                >
                  {/* Saturday rest-day watermark (only when the day has no events) */}
                  {wd === 6 && dayEvents.length === 0 && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <span className="text-xs font-semibold text-muted">
                        מנוחה
                      </span>
                    </div>
                  )}
                  {/* hour gridlines */}
                  {Array.from({
                    length: bounds.endHour - bounds.startHour,
                  }).map((_, i) => (
                    <div
                      key={i}
                      className="absolute inset-x-0 border-b border-line"
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
                          // RTL: offset from the inline-start edge.
                          insetInlineStart: `${p.col * widthPct}%`,
                          width: `calc(${widthPct}% - 2px)`,
                        }}
                      />
                    );
                  })}
                  {/* Now indicator — only in today's column */}
                  {isToday && nowAt !== null && (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
                      style={{ top: `${nowAt * 100}%` }}
                      aria-hidden="true"
                    >
                      <span className="-ms-1 size-2 shrink-0 rounded-full bg-danger shadow-soft ring-2 ring-white" />
                      <span className="h-px flex-1 bg-danger" />
                    </div>
                  )}
                  {dayEvents.length === 0 && (
                    <span className="sr-only">אין שיעורים ביום זה</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

export { dayKey };
