'use client';

import * as React from 'react';
import {
  Check,
  X,
  Ban,
  Repeat,
  MapPin,
  Clock,
  StickyNote,
  UserCheck,
  CircleSlash,
  AlertCircle,
  User,
  Users,
  UserPlus,
  CalendarClock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusPill, type StatusKind } from '@/components/ui/badge';
import { cn, formatShekels } from '@/lib/utils';
import {
  approveLesson,
  rejectLesson,
  cancelLesson,
  markLessonNotALesson,
  type ActionResult,
} from '../actions';
import { LessonDialog } from '../LessonDialog';
import {
  eventVisual,
  isUnassignedImport,
  timeLabel,
  dayLabel,
  dayKey,
} from './calendar-lib';
import type { LessonRow } from '../data';

// Click-an-event details dialog. Hosts the SAME server actions as the old list
// (approve / reject / cancel / "לא שיעור") plus the assign-student flow for
// needs_match imports — it does NOT reimplement them, it triggers them.

function lessonStatusKind(status: LessonRow['status']): StatusKind {
  return status as StatusKind;
}

export function EventDetailsDialog({
  lesson,
  open,
  onClose,
  onAction,
  onAssign,
  onReplace,
  onReschedule,
  busy,
}: {
  lesson: LessonRow | null;
  open: boolean;
  onClose: () => void;
  onAction: (id: string, fn: () => Promise<ActionResult>) => void;
  onAssign: (lesson: LessonRow) => void;
  onReplace: (lesson: LessonRow) => void;
  onReschedule: (lesson: LessonRow) => void;
  busy: boolean;
}) {
  if (!lesson) return null;

  const { title, isGroup, unassignedImport } = eventVisual(lesson);
  const TypeIcon = isGroup ? Users : User;
  const isActionable =
    lesson.status === 'pending' || lesson.status === 'confirmed';
  const canMarkNotALesson =
    lesson.status !== 'cancelled' && lesson.status !== 'rejected';

  function handleCancel() {
    // Cancelling is destructive and irreversible — it also deletes the Google
    // Calendar event and frees the slot. Require an explicit confirmation so a
    // stray tap can't silently make a scheduled lesson disappear.
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        'לבטל את השיעור? הוא יימחק גם מיומן Google, הזמן יתפנה, ולא ניתן לשחזר.',
      )
    ) {
      return;
    }
    onAction(lesson!.id, () => cancelLesson(lesson!.id));
  }

  function handleNotALesson() {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        'לסמן שזה אינו שיעור? הוא יוצא מהיומן ויפסיק לתפוס שעה. ניתן לשחזר בהמשך.',
      )
    ) {
      return;
    }
    onAction(lesson!.id, () => markLessonNotALesson(lesson!.id));
  }

  const heading = isGroup
    ? `קבוצה: ${title}`
    : unassignedImport
      ? title
      : `שיעור: ${title}`;

  return (
    <LessonDialog
      open={open}
      onClose={onClose}
      title={heading}
      description={dayLabel(dayKey(lesson.startsAt))}
    >
      <div className="space-y-5">
        {/* Status row */}
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'flex size-11 shrink-0 items-center justify-center rounded-2xl shadow-soft ring-1 ring-inset ring-white/70',
              unassignedImport || isGroup
                ? 'bg-accent-soft text-accent-text'
                : 'bg-primary-soft text-primary-700',
            )}
            aria-hidden="true"
          >
            {unassignedImport ? (
              <UserPlus className="size-5" />
            ) : (
              <TypeIcon className="size-5" />
            )}
          </span>
          {unassignedImport ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-text ring-1 ring-inset ring-white/50">
              <AlertCircle className="size-3.5" aria-hidden="true" />
              ממתין לשיוך תלמיד
            </span>
          ) : (
            <StatusPill status={lessonStatusKind(lesson.status)} />
          )}
          {lesson.recurrenceId && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-muted ring-1 ring-inset ring-white/50">
              <Repeat className="size-3.5" aria-hidden="true" />
              חוזר
            </span>
          )}
        </div>

        {/* Details grid */}
        <dl className="space-y-2 rounded-2xl border border-white/70 bg-white/70 p-3.5 text-sm shadow-soft backdrop-blur">
          <div className="flex items-center gap-2.5 text-ink">
            <Clock className="size-4 shrink-0 text-primary-700" aria-hidden="true" />
            <span className="font-bold tabular-nums" dir="ltr">
              {timeLabel(lesson.startsAt)}–{timeLabel(lesson.endsAt)}
            </span>
          </div>
          {lesson.price != null && (
            <div className="flex items-center gap-2.5 text-ink">
              <span
                className="inline-flex size-4 shrink-0 items-center justify-center font-bold text-primary-700"
                aria-hidden="true"
              >
                ₪
              </span>
              <span className="font-bold tabular-nums">
                {formatShekels(lesson.price)}
              </span>
            </div>
          )}
          {lesson.location && (
            <div className="flex items-center gap-2.5 text-muted">
              <MapPin className="size-4 shrink-0" aria-hidden="true" />
              <span>{lesson.location}</span>
            </div>
          )}
          {lesson.notes && (
            <div className="flex items-start gap-2.5 rounded-xl bg-primary-50 px-3 py-2.5 text-muted">
              <StickyNote
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              <span className="leading-relaxed">{lesson.notes}</span>
            </div>
          )}
        </dl>

        {/* Actions — identical capabilities to the old list */}
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {unassignedImport ? (
            <>
              <Button
                size="md"
                variant="primary"
                className="flex-1"
                onClick={() => onAssign(lesson!)}
              >
                <UserCheck className="size-4" aria-hidden="true" />
                שייך תלמיד
              </Button>
            </>
          ) : (
            <>
              {lesson.status === 'pending' && (
                <>
                  <Button
                    size="md"
                    loading={busy}
                    className="flex-1"
                    onClick={() =>
                      onAction(lesson!.id, () => approveLesson(lesson!.id))
                    }
                  >
                    <Check className="size-4" aria-hidden="true" />
                    אשר
                  </Button>
                  <Button
                    size="md"
                    variant="secondary"
                    disabled={busy}
                    className="flex-1"
                    onClick={() =>
                      onAction(lesson!.id, () => rejectLesson(lesson!.id))
                    }
                  >
                    <X className="size-4" aria-hidden="true" />
                    דחה
                  </Button>
                </>
              )}
              {lesson.status === 'confirmed' && (
                <>
                  {!isGroup && (
                    <>
                      <Button
                        size="md"
                        variant="secondary"
                        disabled={busy}
                        className="flex-1"
                        onClick={() => onReschedule(lesson!)}
                      >
                        <CalendarClock className="size-4" aria-hidden="true" />
                        שינוי מועד
                      </Button>
                      <Button
                        size="md"
                        variant="secondary"
                        disabled={busy}
                        className="flex-1"
                        onClick={() => onReplace(lesson!)}
                      >
                        <Repeat className="size-4" aria-hidden="true" />
                        החלף
                      </Button>
                    </>
                  )}
                  <Button
                    size="md"
                    variant="danger"
                    loading={busy}
                    className="flex-1"
                    onClick={handleCancel}
                  >
                    <Ban className="size-4" aria-hidden="true" />
                    בטל
                  </Button>
                </>
              )}
            </>
          )}
          {canMarkNotALesson && (
            <Button
              size="md"
              variant="ghost"
              disabled={busy}
              className="w-full text-muted hover:bg-danger-soft hover:text-danger sm:w-auto"
              onClick={handleNotALesson}
              title="סימון שזה אינו שיעור — יפסיק לתפוס שעה ביומן"
            >
              <CircleSlash className="size-4" aria-hidden="true" />
              סמן: לא שיעור
            </Button>
          )}
        </div>

        {!isActionable && !unassignedImport && !canMarkNotALesson && (
          <p className="text-sm text-muted">
            אין פעולות זמינות עבור שיעור זה.
          </p>
        )}
      </div>
    </LessonDialog>
  );
}
