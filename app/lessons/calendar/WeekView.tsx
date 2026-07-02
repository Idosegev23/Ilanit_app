'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { EventBlock } from './EventBlock';
import {
  weekDayKeys,
  eventsOnDay,
  deriveTimeBounds,
  layoutDayEvents,
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

const ROW_PX = 56; // height of one hour row

function HourLabels({ bounds }: { bounds: TimeBounds }) {
  const hours: number[] = [];
  for (let h = bounds.startHour; h < bounds.endHour; h++) hours.push(h);
  return (
    <div className="shrink-0" style={{ width: 48 }}>
      {/* header spacer aligns with the day-name row */}
      <div className="h-12 border-b border-line" />
      {hours.map((h) => (
        <div
          key={h}
          className="relative border-b border-line/60"
          style={{ height: ROW_PX }}
        >
          <span
            className="absolute -top-2 inline-block w-full pe-1 text-end text-[11px] tabular-nums text-muted"
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

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
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
                  wd === 6 && 'bg-surface-2/40', // Saturday — rest day
                )}
              >
                {/* Day header */}
                <div
                  className={cn(
                    'flex h-12 flex-col items-center justify-center border-b border-line',
                    isToday && 'bg-primary-soft',
                  )}
                >
                  <span className="text-[11px] font-medium text-muted">
                    <span className="hidden sm:inline">
                      {HE_WEEKDAYS_LONG[wd]}
                    </span>
                    <span className="sm:hidden">{HE_WEEKDAYS_SHORT[wd]}</span>
                  </span>
                  <span
                    className={cn(
                      'mt-0.5 inline-flex size-6 items-center justify-center rounded-full text-sm font-bold tabular-nums',
                      isToday
                        ? 'bg-primary text-primary-fg'
                        : 'text-ink',
                    )}
                  >
                    {dayNum}
                  </span>
                </div>
                {/* Time column */}
                <div
                  className={cn('relative', isToday && 'bg-primary-soft/30')}
                  style={{ height: totalHeight }}
                >
                  {/* Saturday rest-day watermark (only when the day has no events) */}
                  {wd === 6 && dayEvents.length === 0 && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <span className="text-xs font-medium text-muted/70">מנוחה</span>
                    </div>
                  )}
                  {/* hour gridlines */}
                  {Array.from({
                    length: bounds.endHour - bounds.startHour,
                  }).map((_, i) => (
                    <div
                      key={i}
                      className="absolute inset-x-0 border-b border-line/50"
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
                  {dayEvents.length === 0 && (
                    <span className="sr-only">אין שיעורים ביום זה</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export { dayKey };
