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

// A single event chip rendered on the time grid (week/day) or in a month cell.
// Colour encodes TYPE (group = warm accent/honey, individual = primary
// terracotta); STATUS is conveyed by tint + border + a small status icon, never
// colour alone. needs_match imports get a dashed border + "לשיוך" tag.

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

  // Colour family by type. Group = honey/accent, individual = terracotta.
  const family = isGroup
    ? 'border-accent/50 bg-accent-soft text-accent-text'
    : 'border-primary-200 bg-primary-soft text-primary-600';

  const a11yLabel = `${
    isGroup ? 'קבוצה' : unassignedImport ? 'שיעור לשיוך' : 'שיעור'
  } ${title}, ${timeLabel(lesson.startsAt)}–${timeLabel(lesson.endsAt)}, ${STATUS_LABEL[lesson.status]}`;

  if (variant === 'list') {
    // Compact one-line row for month cells.
    return (
      <button
        type="button"
        onClick={() => onClick(lesson)}
        aria-label={a11yLabel}
        title={a11yLabel}
        style={style}
        className={cn(
          'group flex w-full min-h-7 items-center gap-1 rounded-md border px-1.5 py-1 text-start text-xs leading-tight transition-[background-color,border-color,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-surface motion-safe:hover:-translate-y-px',
          family,
          unassignedImport && 'border-dashed',
          dimmed && 'opacity-60 line-through decoration-1',
          className,
        )}
      >
        <span
          className="tabular-nums font-semibold opacity-80"
          dir="ltr"
          aria-hidden="true"
        >
          {timeLabel(lesson.startsAt)}
        </span>
        <TypeIcon className="size-3 shrink-0 opacity-80" aria-hidden="true" />
        <span className="truncate font-medium">{title}</span>
      </button>
    );
  }

  // Positioned time-grid block.
  return (
    <button
      type="button"
      onClick={() => onClick(lesson)}
      aria-label={a11yLabel}
      title={a11yLabel}
      style={style}
      className={cn(
        'group absolute flex flex-col gap-0.5 overflow-hidden rounded-lg border p-1.5 text-start shadow-soft transition-[background-color,border-color,box-shadow,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-surface motion-safe:hover:shadow-card motion-safe:hover:-translate-y-px',
        family,
        unassignedImport && 'border-dashed border-2',
        dimmed && 'opacity-60',
        className,
      )}
    >
      <span className="flex items-center gap-1 text-xs font-semibold leading-tight">
        <TypeIcon className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{title}</span>
      </span>
      <span
        className="flex items-center gap-1 text-[10px] tabular-nums opacity-90"
        dir="ltr"
      >
        {timeLabel(lesson.startsAt)}–{timeLabel(lesson.endsAt)}
      </span>
      <span className="flex flex-wrap items-center gap-1 text-[10px] font-medium">
        {unassignedImport ? (
          <span className="inline-flex items-center gap-0.5 rounded-sm bg-accent/20 px-1 py-px">
            <UserPlus className="size-2.5" aria-hidden="true" />
            לשיוך
          </span>
        ) : (
          StatusIcon && (
            <span className="inline-flex items-center gap-0.5 opacity-90">
              <StatusIcon className="size-2.5" aria-hidden="true" />
              {STATUS_LABEL[lesson.status]}
            </span>
          )
        )}
        {lesson.recurrenceId && (
          <Repeat className="size-2.5 opacity-70" aria-hidden="true" />
        )}
      </span>
    </button>
  );
}
