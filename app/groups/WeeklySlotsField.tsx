'use client';

import * as React from 'react';
import { CalendarClock, Clock, Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

// Sunday→Saturday weekday options (0 = Sunday), matching lib/time + recurrence.
const WEEKDAYS: Array<{ value: number; label: string }> = [
  { value: 0, label: 'ראשון' },
  { value: 1, label: 'שני' },
  { value: 2, label: 'שלישי' },
  { value: 3, label: 'רביעי' },
  { value: 4, label: 'חמישי' },
  { value: 5, label: 'שישי' },
  { value: 6, label: 'שבת' },
];

export interface WeeklySlotValue {
  weekday: string; // '' | '0'..'6'
  startTime: string; // HH:mm
  durationMin: string; // minutes
}

const EMPTY_SLOT: WeeklySlotValue = { weekday: '', startTime: '', durationMin: '' };

/**
 * Repeatable weekly-schedule slots for a group. Each row posts parallel array
 * fields `weekday[]`, `startTime[]`, `durationMin[]` (the server action reads
 * them with `form.getAll(...)`), so a group can meet on SEVERAL weekday+time
 * slots — each becomes its own `recurrences kind=group` series. Rows left blank
 * are ignored server-side, so single-slot (or no-slot) groups still work.
 *
 * `defaultSlots` seeds the rows for the edit form; on create it starts with one
 * empty row.
 */
export function WeeklySlotsField({
  defaultSlots,
}: {
  defaultSlots?: WeeklySlotValue[];
}) {
  const [slots, setSlots] = React.useState<WeeklySlotValue[]>(
    defaultSlots && defaultSlots.length > 0 ? defaultSlots : [EMPTY_SLOT],
  );

  function update(i: number, patch: Partial<WeeklySlotValue>) {
    setSlots((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  function addRow() {
    setSlots((prev) => [...prev, { ...EMPTY_SLOT }]);
  }

  function removeRow(i: number) {
    setSlots((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  return (
    <fieldset className="space-y-3 rounded-2xl border border-line bg-primary-50/60 p-4">
      <legend className="flex items-center gap-2 px-1 text-sm font-semibold text-ink">
        <span className="flex size-7 items-center justify-center rounded-lg bg-primary-soft text-primary-700 shadow-soft ring-1 ring-inset ring-white/70">
          <CalendarClock className="size-4" aria-hidden="true" />
        </span>
        מפגשים שבועיים קבועים (אופציונלי)
      </legend>

      <div className="space-y-3">
        {slots.map((slot, i) => (
          <div
            key={i}
            className="space-y-3 rounded-2xl border border-line bg-surface p-3.5 shadow-soft transition-colors duration-200 hover:border-primary-200"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="rounded-full bg-primary-200 px-2.5 py-1 text-[11px] font-bold tabular-nums text-ink">
                מפגש {i + 1}
              </span>
              {slots.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted hover:bg-danger-soft hover:text-danger"
                  onClick={() => removeRow(i)}
                  aria-label={`הסרת מפגש ${i + 1}`}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  הסרה
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor={`weekday-${i}`}>יום בשבוע</Label>
                <Select
                  id={`weekday-${i}`}
                  name="weekday"
                  value={slot.weekday}
                  onChange={(e) => update(i, { weekday: e.target.value })}
                >
                  <option value="">ללא</option>
                  {WEEKDAYS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`startTime-${i}`} className="flex items-center gap-1.5">
                  <Clock className="size-3.5 text-muted" aria-hidden="true" />
                  שעת התחלה
                </Label>
                <Input
                  id={`startTime-${i}`}
                  name="startTime"
                  type="time"
                  dir="ltr"
                  className="text-end tabular-nums"
                  value={slot.startTime}
                  onChange={(e) => update(i, { startTime: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`durationMin-${i}`}>משך מפגש (דק׳)</Label>
              <Input
                id={`durationMin-${i}`}
                name="durationMin"
                type="number"
                inputMode="numeric"
                min="1"
                step="5"
                dir="ltr"
                className="text-end tabular-nums"
                placeholder="60"
                value={slot.durationMin}
                onChange={(e) => update(i, { durationMin: e.target.value })}
              />
            </div>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="secondary"
        size="md"
        className="w-full"
        onClick={addRow}
      >
        <Plus className="size-4" aria-hidden="true" />
        הוספת מפגש נוסף בשבוע
      </Button>

      <p className="text-xs text-muted">
        לכל יום ושעה שתמלאי ייווצרו מפגשים שבועיים קבועים ביומן אוטומטית. קבוצה
        יכולה להיפגש כמה פעמים בשבוע — הוסיפי שורה לכל מועד.
      </p>
    </fieldset>
  );
}
