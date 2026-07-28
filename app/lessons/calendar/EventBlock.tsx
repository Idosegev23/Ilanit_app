'use client';

import * as React from 'react';
import {
  User,
  Users,
  UserPlus,
  Repeat,
  Clock,
  CheckCircle2,
  Ban,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { eventVisual, timeLabel } from './calendar-lib';
import type { LessonRow } from '../data';

/*
  The signature element of the lessons screen: one lesson, rendered either as a
  positioned chip on the time grid (week/day) or as a compact row inside a month
  cell.

  Colour contract (v4 "Blush Aurora"):
   • The FILL encodes TYPE — blush for an individual lesson, peach for a group,
     faint peach + a dashed edge for a calendar import awaiting a student.
   • The TEXT is always `text-ink`. Ink is 8.9:1 on the light-pink fill and
     9.7:1 on the peach; `text-muted` would drop to 3.4:1 on the same pink, and
     white would be 2.15:1 — neither is allowed here.
   • The STATUS is carried by three redundant signals, never colour alone: a
     coloured rail down the inline-start edge, a lucide glyph, and the Hebrew
     label. Pending additionally takes a lighter fill, and cancelled/rejected
     drop to a neutral surface with a struck-through title.
*/

// Small status icon (text is always present too — never colour-only).
const STATUS_ICON: Record<LessonRow['status'], LucideIcon | null> = {
  pending: Clock,
  confirmed: CheckCircle2,
  completed: CheckCircle2,
  rejected: XCircle,
  cancelled: Ban,
};

const STATUS_LABEL: Record<LessonRow['status'], string> = {
  pending: 'ממתין',
  confirmed: 'מאושר',
  completed: 'בוצע',
  rejected: 'נדחה',
  cancelled: 'בוטל',
};

// The status rail / dot. Semantic solids only — each clears 3:1 as a graphic
// against both the blush and the peach fill it sits on.
const STATUS_RAIL: Record<LessonRow['status'], string> = {
  pending: 'bg-warning',
  confirmed: 'bg-success',
  completed: 'bg-success',
  rejected: 'bg-muted',
  cancelled: 'bg-muted',
};

export interface EventChromeProps {
  lesson: LessonRow;
  onClick: (lesson: LessonRow) => void;
  /** 'grid' = positioned time-block (week/day); 'list' = compact month row. */
  variant?: 'grid' | 'list';
  className?: string;
  style?: React.CSSProperties;
}

export function EventBlock({
  lesson,
  onClick,
  variant = 'grid',
  className,
  style,
}: EventChromeProps) {
  const { title, isGroup, unassignedImport, dimmed } = eventVisual(lesson);
  const TypeIcon = unassignedImport ? UserPlus : isGroup ? Users : User;
  const StatusIcon = STATUS_ICON[lesson.status];
  const pending = lesson.status === 'pending';

  // Fill family: type first, then a lighter step while a lesson is unconfirmed.
  const family = dimmed
    ? 'border-line bg-surface-2'
    : unassignedImport
      ? 'border-accent-600 bg-accent-soft'
      : isGroup
        ? pending
          ? 'border-accent-600 bg-accent-soft'
          : 'border-accent-600 bg-accent'
        : pending
          ? 'border-primary-300 bg-primary-100'
          : 'border-primary-300 bg-primary-200';

  const rail = unassignedImport ? 'bg-accent-text' : STATUS_RAIL[lesson.status];

  const a11yLabel = `${
    isGroup ? 'קבוצה' : unassignedImport ? 'שיעור לשיוך' : 'שיעור'
  } ${title}, ${timeLabel(lesson.startsAt)}–${timeLabel(lesson.endsAt)}, ${STATUS_LABEL[lesson.status]}`;

  if (variant === 'list') {
    // Compact one-line row for month cells: status dot · time · title.
    return (
      <button
        type="button"
        onClick={() => onClick(lesson)}
        aria-label={a11yLabel}
        title={a11yLabel}
        style={style}
        className={cn(
          'group flex min-h-9 w-full items-center gap-1.5 rounded-lg border px-1.5 py-1 text-start text-[11px] leading-tight text-ink shadow-soft transition-[background-color,border-color,box-shadow,transform] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-1 focus-visible:ring-offset-surface motion-safe:hover:-translate-y-px motion-safe:hover:shadow-glow',
          family,
          unassignedImport && 'border-dashed',
          dimmed && 'opacity-75',
          className,
        )}
      >
        <span
          className={cn('size-1.5 shrink-0 rounded-full', rail)}
          aria-hidden="true"
        />
        <span className="shrink-0 font-bold tabular-nums" dir="ltr" aria-hidden="true">
          {timeLabel(lesson.startsAt)}
        </span>
        <span
          className={cn(
            'truncate font-semibold',
            dimmed && 'line-through decoration-1',
          )}
        >
          {title}
        </span>
      </button>
    );
  }

  // Positioned time-grid block. The rail lives inside the padding box so the
  // absolute geometry handed down by the layout math is untouched.
  return (
    <button
      type="button"
      onClick={() => onClick(lesson)}
      aria-label={a11yLabel}
      title={a11yLabel}
      style={style}
      className={cn(
        'group absolute flex flex-col justify-start overflow-hidden rounded-xl border py-1 pe-1.5 ps-3 text-start text-ink shadow-soft transition-[background-color,border-color,box-shadow,transform] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-1 focus-visible:ring-offset-surface motion-safe:hover:-translate-y-px motion-safe:hover:shadow-glow',
        family,
        unassignedImport && 'border-dashed',
        dimmed && 'opacity-75',
        className,
      )}
    >
      {/* Status rail — the at-a-glance signal, readable even when the block is
          too short to show its label. */}
      <span
        className={cn('absolute inset-y-1 start-1 w-1 rounded-full', rail)}
        aria-hidden="true"
      />
      <span className="flex items-center gap-1 text-xs font-bold leading-tight">
        <TypeIcon className="size-3.5 shrink-0" aria-hidden="true" />
        <span className={cn('truncate', dimmed && 'line-through decoration-1')}>
          {title}
        </span>
      </span>
      <span className="mt-0.5 flex flex-wrap items-center gap-1 leading-tight">
        <span className="text-[10px] font-semibold tabular-nums" dir="ltr">
          {timeLabel(lesson.startsAt)}–{timeLabel(lesson.endsAt)}
        </span>
        {unassignedImport ? (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-white/70 px-1.5 py-px text-[10px] font-bold">
            <UserPlus className="size-2.5" aria-hidden="true" />
            לשיוך
          </span>
        ) : (
          StatusIcon && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-white/70 px-1.5 py-px text-[10px] font-semibold">
              <StatusIcon className="size-2.5" aria-hidden="true" />
              {STATUS_LABEL[lesson.status]}
            </span>
          )
        )}
        {lesson.recurrenceId && (
          <Repeat className="size-2.5 shrink-0" aria-hidden="true" />
        )}
      </span>
    </button>
  );
}
