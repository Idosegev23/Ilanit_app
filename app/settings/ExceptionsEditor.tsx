'use client';

import * as React from 'react';
import { CalendarX2, Plus, Trash2 } from 'lucide-react';
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import type { AvailabilityExceptionInput } from './types';

interface ExceptionsEditorProps {
  exceptions: AvailabilityExceptionInput[];
  onChange: (next: AvailabilityExceptionInput[]) => void;
}

// Date-level exceptions to the weekly template:
//   blocked → that whole date has no slots (holiday / sick day)
//   custom  → that date uses a one-off start/end window instead of the template
export function ExceptionsEditor({ exceptions, onChange }: ExceptionsEditorProps) {
  function addException() {
    const today = new Date().toISOString().slice(0, 10);
    onChange([
      ...exceptions,
      { date: today, type: 'blocked', startTime: null, endTime: null },
    ]);
  }

  function updateException(index: number, patch: Partial<AvailabilityExceptionInput>) {
    onChange(
      exceptions.map((e, i) => {
        if (i !== index) return e;
        const next = { ...e, ...patch };
        // Switching to "blocked" clears the custom window times.
        if (next.type === 'blocked') {
          next.startTime = null;
          next.endTime = null;
        } else if (next.type === 'custom') {
          next.startTime = next.startTime ?? '16:00';
          next.endTime = next.endTime ?? '20:00';
        }
        return next;
      }),
    );
  }

  function removeException(index: number) {
    onChange(exceptions.filter((_, i) => i !== index));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarX2 className="size-5 text-primary-600" aria-hidden="true" />
          חריגים ותאריכים חסומים
        </CardTitle>
        <CardDescription>
          חופשות וימי מחלה (חסום) או ימים עם שעות מיוחדות (מותאם). חריג גובר על
          התבנית השבועית באותו תאריך.
        </CardDescription>
      </CardHeader>
      <CardBody className="space-y-3">
        {exceptions.length === 0 ? (
          <EmptyState
            icon={CalendarX2}
            title="אין חריגים"
            description="הוסיפי תאריך חסום או יום עם שעות מיוחדות."
            action={
              <Button type="button" size="sm" variant="secondary" onClick={addException}>
                <Plus className="size-4" aria-hidden="true" />
                הוסף חריג
              </Button>
            }
          />
        ) : (
          <>
            <ul className="space-y-2">
              {exceptions.map((e, i) => {
                const customInvalid =
                  e.type === 'custom' &&
                  (!e.startTime || !e.endTime || e.startTime >= e.endTime);
                return (
                  <li
                    key={i}
                    className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-cream/40 p-3"
                  >
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted">תאריך</span>
                      <Input
                        type="date"
                        value={e.date}
                        onChange={(ev) => updateException(i, { date: ev.target.value })}
                        className="w-44"
                        aria-label="תאריך חריג"
                      />
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted">סוג</span>
                      <Select
                        value={e.type}
                        onChange={(ev) =>
                          updateException(i, {
                            type: ev.target.value as 'blocked' | 'custom',
                          })
                        }
                        className="w-40"
                        aria-label="סוג חריג"
                      >
                        <option value="blocked">חסום (אין זמינות)</option>
                        <option value="custom">שעות מיוחדות</option>
                      </Select>
                    </label>

                    {e.type === 'custom' && (
                      <div className="flex items-end gap-2" dir="ltr">
                        <label className="flex flex-col gap-1">
                          <span className="text-xs font-medium text-muted">התחלה</span>
                          <Input
                            type="time"
                            value={e.startTime ?? ''}
                            onChange={(ev) =>
                              updateException(i, { startTime: ev.target.value })
                            }
                            className="w-32"
                            error={customInvalid}
                            aria-label="שעת התחלה מותאמת"
                          />
                        </label>
                        <span className="pb-3 text-muted" aria-hidden="true">
                          –
                        </span>
                        <label className="flex flex-col gap-1">
                          <span className="text-xs font-medium text-muted">סיום</span>
                          <Input
                            type="time"
                            value={e.endTime ?? ''}
                            onChange={(ev) =>
                              updateException(i, { endTime: ev.target.value })
                            }
                            className="w-32"
                            error={customInvalid}
                            aria-label="שעת סיום מותאמת"
                          />
                        </label>
                      </div>
                    )}

                    {e.type === 'blocked' && (
                      <div className="pb-3">
                        <Badge tone="muted">כל היום חסום</Badge>
                      </div>
                    )}

                    <div className="ms-auto pb-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => removeException(i)}
                        aria-label="מחק חריג"
                        className="text-danger hover:bg-danger/10"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                        הסר
                      </Button>
                    </div>

                    {customInvalid && (
                      <p className="w-full text-xs font-medium text-danger">
                        חלון מותאם דורש שעת התחלה וסיום, כשהסיום אחרי ההתחלה.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
            <Button type="button" size="sm" variant="secondary" onClick={addException}>
              <Plus className="size-4" aria-hidden="true" />
              הוסף חריג
            </Button>
          </>
        )}
      </CardBody>
    </Card>
  );
}
