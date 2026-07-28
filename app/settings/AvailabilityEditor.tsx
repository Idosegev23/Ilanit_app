'use client';

import * as React from 'react';
import { CalendarClock, Plus, Trash2 } from 'lucide-react';
import {
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';
import { WEEKDAY_LABELS, type AvailabilityWindow } from './types';

interface AvailabilityEditorProps {
  windows: AvailabilityWindow[];
  onChange: (next: AvailabilityWindow[]) => void;
}

const DEFAULT_WINDOW = { startTime: '16:00', endTime: '20:00' };

// Weekly availability template editor. Each weekday (0=Sun … 6=Sat) can hold any
// number of start/end time windows. These rows feed the public /book slot
// engine, so an empty week means "no bookable slots".
export function AvailabilityEditor({ windows, onChange }: AvailabilityEditorProps) {
  // Each render derives the per-weekday view from the flat window list, but we
  // keep edits index-stable by operating on the flat array directly.
  function addWindow(weekday: number) {
    onChange([
      ...windows,
      {
        weekday,
        startTime: DEFAULT_WINDOW.startTime,
        endTime: DEFAULT_WINDOW.endTime,
        active: true,
      },
    ]);
  }

  function updateWindow(index: number, patch: Partial<AvailabilityWindow>) {
    onChange(windows.map((w, i) => (i === index ? { ...w, ...patch } : w)));
  }

  function removeWindow(index: number) {
    onChange(windows.filter((_, i) => i !== index));
  }

  const hasAny = windows.length > 0;

  return (
    // Long form → solid surface (glass is reserved for panels with air).
    <Card solid className="overflow-hidden">
      <CardHeader variant="gradient" className="p-5 sm:p-6">
        <CardTitle className="flex items-center gap-2.5 text-xl">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-700 shadow-soft ring-1 ring-inset ring-white/70">
            <CalendarClock className="size-5" aria-hidden="true" />
          </span>
          זמינות שבועית
        </CardTitle>
        <CardDescription className="ps-[50px] leading-relaxed">
          הוסיפי חלונות זמן לכל יום. תלמידים יראו סלוטים פנויים רק בתוך החלונות
          הפעילים, לפי משך השיעור וה־buffer שהוגדרו למטה.
        </CardDescription>
      </CardHeader>
      <CardBody className="space-y-3 p-4 pt-5 sm:p-6">
        {!hasAny && (
          <EmptyState
            icon={CalendarClock}
            title="עדיין אין זמינות"
            description="הוסיפי חלון זמן לפחות ליום אחד כדי שתלמידים יוכלו לקבוע שיעור."
          />
        )}

        {WEEKDAY_LABELS.map((label, weekday) => {
          // Indices of this weekday's windows within the flat array.
          const dayIndices = windows
            .map((w, i) => ({ w, i }))
            .filter(({ w }) => w.weekday === weekday);
          const activeCount = dayIndices.filter(({ w }) => w.active).length;
          const hasWindows = dayIndices.length > 0;

          const isActiveDay = activeCount > 0;

          return (
            <div
              key={weekday}
              className={cn(
                'relative overflow-hidden rounded-2xl border p-4 transition-[background-color,border-color,box-shadow] duration-200 sm:p-5',
                hasWindows
                  ? 'border-line bg-surface shadow-soft'
                  : 'border-dashed border-line bg-primary-50/40',
              )}
            >
              {/* Inline-start accent bar marks an active booking day. */}
              {isActiveDay && (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-3 start-0 w-1.5 rounded-full bg-gradient-warm"
                />
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <h3 className="text-base font-bold tracking-tight text-ink sm:text-lg">
                    יום {label}
                  </h3>
                  {hasWindows && (
                    <Badge tone={isActiveDay ? 'success' : 'muted'}>
                      {isActiveDay
                        ? `${activeCount} פעיל${activeCount > 1 ? 'ים' : ''}`
                        : 'כבוי'}
                    </Badge>
                  )}
                </div>
                <Button
                  type="button"
                  size="md"
                  variant="secondary"
                  onClick={() => addWindow(weekday)}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  הוסף חלון
                </Button>
              </div>

              {dayIndices.length === 0 ? (
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  אין זמינות ביום זה — הוסיפי חלון כדי לפתוח אותו להזמנות.
                </p>
              ) : (
                <ul className="mt-3.5 space-y-2.5">
                  {dayIndices.map(({ w, i }) => {
                    const invalid = w.startTime >= w.endTime;
                    return (
                      <li
                        key={i}
                        className={cn(
                          'flex flex-wrap items-end gap-3 rounded-2xl border bg-primary-50/50 p-3.5 transition-[background-color,border-color,opacity] duration-200',
                          invalid
                            ? 'border-danger/60 bg-danger-soft/60'
                            : 'border-line hover:border-primary-200 hover:bg-primary-50',
                          !w.active && !invalid && 'opacity-65',
                        )}
                      >
                        <div className="flex items-end gap-2" dir="ltr">
                          <label className="flex flex-col gap-1">
                            <span className="text-xs font-medium text-muted">
                              התחלה
                            </span>
                            <Input
                              type="time"
                              value={w.startTime}
                              onChange={(e) =>
                                updateWindow(i, { startTime: e.target.value })
                              }
                              className="w-32 tabular-nums"
                              error={invalid}
                              aria-label={`שעת התחלה ${label}`}
                            />
                          </label>
                          <span className="pb-3 text-muted" aria-hidden="true">
                            –
                          </span>
                          <label className="flex flex-col gap-1">
                            <span className="text-xs font-medium text-muted">סיום</span>
                            <Input
                              type="time"
                              value={w.endTime}
                              onChange={(e) =>
                                updateWindow(i, { endTime: e.target.value })
                              }
                              className="w-32 tabular-nums"
                              error={invalid}
                              aria-label={`שעת סיום ${label}`}
                            />
                          </label>
                        </div>

                        {/* 'פעיל' toggle — the whole pill is a ≥44px hit zone
                            (rule: touch-target-size) with a larger checkbox. */}
                        <label
                          className={cn(
                            'flex min-h-11 cursor-pointer select-none items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors duration-200',
                            w.active
                              ? 'border-success/45 bg-success-soft text-success'
                              : 'border-line bg-surface text-muted hover:border-primary-200 hover:bg-primary-50',
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={w.active}
                            onChange={(e) =>
                              updateWindow(i, { active: e.target.checked })
                            }
                            className="size-5 rounded border-line accent-success focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                          />
                          פעיל
                        </label>

                        <div className="ms-auto">
                          <Button
                            type="button"
                            size="md"
                            variant="ghost"
                            onClick={() => removeWindow(i)}
                            aria-label={`מחק חלון ${label}`}
                            className="text-danger hover:bg-danger-soft"
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                            הסר
                          </Button>
                        </div>

                        {invalid && (
                          <p className="w-full text-xs font-medium text-danger" role="alert">
                            שעת הסיום חייבת להיות אחרי שעת ההתחלה.
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}
