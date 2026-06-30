'use client';

import * as React from 'react';
import { CalendarToolbar } from './CalendarToolbar';
import { WeekView } from './WeekView';
import { DayView } from './DayView';
import { MonthView } from './MonthView';
import { EventDetailsDialog } from './EventDetailsDialog';
import {
  type CalendarView,
  dayKey,
  addDaysKey,
  addMonthsKey,
  startOfWeekKey,
  startOfMonthKey,
  weekDayKeys,
  monthGridKeys,
  eventsInRange,
} from './calendar-lib';
import type { ActionResult } from '../actions';
import type { LessonRow } from '../data';

// Stateful calendar shell: owns the current view + anchor date, derives the
// visible range, filters events client-side, and renders the active view plus
// the click-an-event details dialog. The actual server actions (approve / etc.)
// and the assign-student flow are supplied by the parent (LessonsView) so the
// calendar never reimplements them.

function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [breakpoint]);
  return isMobile;
}

export function CalendarShell({
  lessons,
  onAction,
  onAssign,
  busyId,
}: {
  lessons: LessonRow[];
  onAction: (id: string, fn: () => Promise<ActionResult>) => void;
  onAssign: (lesson: LessonRow) => void;
  busyId: string | null;
}) {
  const todayKey = React.useMemo(() => dayKey(new Date()), []);
  const isMobile = useIsMobile();

  // Default view = שבועי; on phones fall back to יומי automatically (once).
  const [view, setView] = React.useState<CalendarView>('week');
  const mobileForcedRef = React.useRef(false);
  React.useEffect(() => {
    if (isMobile && view === 'week' && !mobileForcedRef.current) {
      mobileForcedRef.current = true;
      setView('day');
    }
  }, [isMobile, view]);

  const [anchorKey, setAnchorKey] = React.useState(todayKey);
  const [showCancelled, setShowCancelled] = React.useState(false);
  const [selected, setSelected] = React.useState<LessonRow | null>(null);

  // Keep the open dialog's lesson in sync after a server action mutates it
  // (the parent re-renders with fresh `lessons`); close it if the row vanished.
  React.useEffect(() => {
    if (!selected) return;
    const fresh = lessons.find((l) => l.id === selected.id) ?? null;
    setSelected(fresh);
  }, [lessons]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Visible range per view ──
  const { rangeStart, rangeEnd } = React.useMemo(() => {
    if (view === 'day') {
      return { rangeStart: anchorKey, rangeEnd: anchorKey };
    }
    if (view === 'week') {
      const keys = weekDayKeys(anchorKey);
      return { rangeStart: keys[0], rangeEnd: keys[keys.length - 1] };
    }
    const cells = monthGridKeys(anchorKey);
    return { rangeStart: cells[0], rangeEnd: cells[cells.length - 1] };
  }, [view, anchorKey]);

  const visibleEvents = React.useMemo(() => {
    const inRange = eventsInRange(lessons, rangeStart, rangeEnd);
    return showCancelled
      ? inRange
      : inRange.filter(
          (l) => l.status !== 'cancelled' && l.status !== 'rejected',
        );
  }, [lessons, rangeStart, rangeEnd, showCancelled]);

  // ── Navigation ──
  function handlePrev() {
    setAnchorKey((k) =>
      view === 'day'
        ? addDaysKey(k, -1)
        : view === 'week'
          ? addDaysKey(k, -7)
          : addMonthsKey(k, -1),
    );
  }
  function handleNext() {
    setAnchorKey((k) =>
      view === 'day'
        ? addDaysKey(k, 1)
        : view === 'week'
          ? addDaysKey(k, 7)
          : addMonthsKey(k, 1),
    );
  }
  function handleToday() {
    setAnchorKey(todayKey);
  }

  function handleViewChange(v: CalendarView) {
    // Re-anchor to the canonical start so labels read cleanly.
    setView(v);
    setAnchorKey((k) =>
      v === 'week'
        ? startOfWeekKey(k)
        : v === 'month'
          ? startOfMonthKey(k)
          : k,
    );
  }

  // Opening a day from the month grid → switch to day view on that date.
  function handleDayClick(key: string) {
    setAnchorKey(key);
    setView('day');
  }

  // The label-anchor passed to the toolbar (canonical start for week/month).
  const labelAnchor =
    view === 'week'
      ? startOfWeekKey(anchorKey)
      : view === 'month'
        ? anchorKey
        : anchorKey;

  return (
    <div className="space-y-4">
      <CalendarToolbar
        view={view}
        onViewChange={handleViewChange}
        anchorKey={labelAnchor}
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={handleToday}
        showCancelled={showCancelled}
        onToggleCancelled={() => setShowCancelled((s) => !s)}
      />

      {/* Week view scrolls horizontally only inside its own container on very
          narrow widths — never breaks the page layout. */}
      <div>
        {view === 'day' && (
          <DayView
            dayKey={anchorKey}
            events={visibleEvents}
            onEventClick={setSelected}
          />
        )}
        {view === 'week' && (
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              <WeekView
                anchorKey={startOfWeekKey(anchorKey)}
                events={visibleEvents}
                todayKey={todayKey}
                onEventClick={setSelected}
              />
            </div>
          </div>
        )}
        {view === 'month' && (
          <MonthView
            anchorKey={anchorKey}
            events={visibleEvents}
            todayKey={todayKey}
            onEventClick={setSelected}
            onDayClick={handleDayClick}
          />
        )}
      </div>

      <EventDetailsDialog
        lesson={selected}
        open={selected !== null}
        onClose={() => setSelected(null)}
        onAction={onAction}
        onAssign={(l) => {
          onAssign(l);
          setSelected(null);
        }}
        busy={selected ? busyId === selected.id : false}
      />
    </div>
  );
}
