'use client';

import * as React from 'react';
import { CalendarClock, Plus, Trash2 } from 'lucide-react';
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="size-5 text-primary-600" aria-hidden="true" />
          זמינות שבועית
        </CardTitle>
        <CardDescription>
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

          return (
            <div
              key={weekday}
              className="rounded-xl border border-line bg-cream/40 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-ink">יום {label}</h3>
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
                  {dayIndices.map(({ w, i }) => (
                    <li
                      key={i}
                      className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface p-3"
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
                            className="w-32"
                            error={w.startTime >= w.endTime}
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
                            className="w-32"
                            error={w.startTime >= w.endTime}
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

                      {w.startTime >= w.endTime && (
                        <p className="w-full text-xs font-medium text-danger">
                          שעת הסיום חייבת להיות אחרי שעת ההתחלה.
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}
