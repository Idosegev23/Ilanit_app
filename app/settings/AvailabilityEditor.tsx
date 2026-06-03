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
    <Card className="overflow-hidden">
      <CardHeader variant="gradient">
        <CardTitle className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary-soft text-primary-600 shadow-soft">
            <CalendarClock className="size-5" aria-hidden="true" />
          </span>
          זמינות שבועית
        </CardTitle>
        <CardDescription className="ps-[46px]">
          הוסיפי חלונות זמן לכל יום. תלמידים יראו סלוטים פנויים רק בתוך החלונות
          הפעילים, לפי משך השיעור וה־buffer שהוגדרו למטה.
        </CardDescription>
      </CardHeader>
      <CardBody className="space-y-3">
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

          return (
            <div
              key={weekday}
              className={cn(
                'rounded-2xl border p-4 transition-colors duration-200',
                hasWindows
                  ? 'border-line bg-surface shadow-soft'
                  : 'border-dashed border-line bg-cream/30',
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <h3 className="text-sm font-semibold text-ink">יום {label}</h3>
                  {hasWindows && (
                    <Badge tone={activeCount > 0 ? 'success' : 'muted'}>
                      {activeCount > 0
                        ? `${activeCount} פעיל${activeCount > 1 ? 'ים' : ''}`
                        : 'כבוי'}
                    </Badge>
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => addWindow(weekday)}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  הוסף חלון
                </Button>
              </div>

              {dayIndices.length === 0 ? (
                <p className="mt-2 text-sm text-muted">אין זמינות ביום זה.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {dayIndices.map(({ w, i }) => {
                    const invalid = w.startTime >= w.endTime;
                    return (
                      <li
                        key={i}
                        className={cn(
                          'flex flex-wrap items-end gap-3 rounded-xl border bg-cream/40 p-3 transition-colors duration-200',
                          invalid ? 'border-danger/60 bg-danger-soft/40' : 'border-line',
                          !w.active && !invalid && 'opacity-70',
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

                        <label className="flex items-center gap-2 pb-3 text-sm text-ink">
                          <input
                            type="checkbox"
                            checked={w.active}
                            onChange={(e) =>
                              updateWindow(i, { active: e.target.checked })
                            }
                            className="size-4 rounded border-line text-primary accent-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                          />
                          פעיל
                        </label>

                        <div className="ms-auto pb-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => removeWindow(i)}
                            aria-label={`מחק חלון ${label}`}
                            className="text-danger hover:bg-danger/10"
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
