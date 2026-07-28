'use client';

import * as React from 'react';
import { CalendarX2, Plus, Trash2 } from 'lucide-react';
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import type { AvailabilityExceptionInput, AvailabilityWindow } from './types';

interface ExceptionsEditorProps {
  exceptions: AvailabilityExceptionInput[];
  /** The weekly template — used to PREFILL a special-hours date from its usual hours. */
  windows: AvailabilityWindow[];
  onChange: (next: AvailabilityExceptionInput[]) => void;
}

// Date-level control on top of the weekly template:
//   blocked → that whole date has no slots (holiday / sick day)
//   custom  → that date uses special start/end hours instead of the template
//             (prefilled from the day's usual hours, so "add hours to this date"
//              starts from the template rather than a blank).
export function ExceptionsEditor({ exceptions, windows, onChange }: ExceptionsEditorProps) {
  // Weekday (0=Sun…6=Sat) of a yyyy-MM-dd string, TZ-safe.
  function weekdayOf(dateStr: string): number {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay();
  }
  // The first active weekly-template window for a date's weekday, if any.
  function templateWindowFor(dateStr: string): { startTime: string; endTime: string } | null {
    const wd = weekdayOf(dateStr);
    const w = windows.find((x) => x.active && x.weekday === wd);
    return w ? { startTime: w.startTime, endTime: w.endTime } : null;
  }

  const today = () => new Date().toISOString().slice(0, 10);

  function addBlocked() {
    onChange([...exceptions, { date: today(), type: 'blocked', startTime: null, endTime: null }]);
  }
  function addCustom() {
    const d = today();
    const tpl = templateWindowFor(d);
    onChange([
      ...exceptions,
      { date: d, type: 'custom', startTime: tpl?.startTime ?? '16:00', endTime: tpl?.endTime ?? '20:00' },
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
          // Prefill from the day's template when empty (e.g. right after
          // switching from "blocked") so adjusting one date is one edit.
          const tpl = templateWindowFor(next.date);
          next.startTime = next.startTime ?? tpl?.startTime ?? '16:00';
          next.endTime = next.endTime ?? tpl?.endTime ?? '20:00';
        }
        return next;
      }),
    );
  }

  function removeException(index: number) {
    onChange(exceptions.filter((_, i) => i !== index));
  }

  return (
    // Long form → solid surface (glass is reserved for panels with air).
    <Card solid className="overflow-hidden">
      <CardHeader variant="gradient" className="p-5 sm:p-6">
        <CardTitle className="flex items-center gap-2.5 text-xl">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-700 shadow-soft ring-1 ring-inset ring-white/70">
            <CalendarX2 className="size-5" aria-hidden="true" />
          </span>
          זמינות לפי תאריך ספציפי
        </CardTitle>
        <CardDescription className="ps-[50px] leading-relaxed">
          שליטה ליום מסוים: לחסום תאריך (חופש/מחלה), או להגדיר לו שעות מיוחדות —
          למשל להוסיף/לשנות שעות רק לתאריך אחד (שבוע חזרות וכד׳). גובר על התבנית
          השבועית באותו יום.
        </CardDescription>
      </CardHeader>
      <CardBody className="space-y-4 p-4 pt-5 sm:p-6">
        {exceptions.length === 0 ? (
          <EmptyState
            icon={CalendarX2}
            title="אין הגדרות לפי תאריך"
            description="הוסיפי שעות מיוחדות ליום מסוים, או חסמי תאריך."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button type="button" size="md" variant="secondary" onClick={addCustom}>
                  <Plus className="size-4" aria-hidden="true" />
                  שעות מיוחדות לתאריך
                </Button>
                <Button type="button" size="md" variant="ghost" onClick={addBlocked}>
                  <CalendarX2 className="size-4" aria-hidden="true" />
                  חסימת תאריך
                </Button>
              </div>
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
                    className={
                      customInvalid
                        ? 'flex flex-wrap items-end gap-3 rounded-2xl border border-danger/60 bg-danger-soft/60 p-3.5'
                        : 'flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-surface p-3.5 shadow-soft transition-colors duration-200 hover:border-primary-200 hover:bg-primary-50/50'
                    }
                  >
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-semibold text-muted">תאריך</span>
                      <Input
                        type="date"
                        value={e.date}
                        onChange={(ev) => updateException(i, { date: ev.target.value })}
                        className="date-field w-44 tabular-nums"
                        aria-label="תאריך חריג"
                      />
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-semibold text-muted">סוג</span>
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
                          <span className="text-xs font-semibold text-muted">התחלה</span>
                          <Input
                            type="time"
                            value={e.startTime ?? ''}
                            onChange={(ev) =>
                              updateException(i, { startTime: ev.target.value })
                            }
                            className="w-32 tabular-nums"
                            error={customInvalid}
                            aria-label="שעת התחלה מותאמת"
                          />
                        </label>
                        <span className="pb-3 text-muted" aria-hidden="true">
                          –
                        </span>
                        <label className="flex flex-col gap-1">
                          <span className="text-xs font-semibold text-muted">סיום</span>
                          <Input
                            type="time"
                            value={e.endTime ?? ''}
                            onChange={(ev) =>
                              updateException(i, { endTime: ev.target.value })
                            }
                            className="w-32 tabular-nums"
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

                    <div className="ms-auto">
                      <Button
                        type="button"
                        size="md"
                        variant="ghost"
                        onClick={() => removeException(i)}
                        aria-label="מחק חריג"
                        className="text-danger hover:bg-danger-soft"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                        הסר
                      </Button>
                    </div>

                    {customInvalid && (
                      <p className="w-full text-xs font-medium text-danger" role="alert">
                        חלון מותאם דורש שעת התחלה וסיום, כשהסיום אחרי ההתחלה.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <Button type="button" size="md" variant="secondary" onClick={addCustom}>
                <Plus className="size-4" aria-hidden="true" />
                שעות מיוחדות לתאריך
              </Button>
              <Button type="button" size="md" variant="ghost" onClick={addBlocked}>
                <CalendarX2 className="size-4" aria-hidden="true" />
                חסימת תאריך
              </Button>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
