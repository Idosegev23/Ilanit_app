'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createRecurringSeries, type ActionResult } from './actions';
import type { StudentOption, GroupOption } from './data';

const initialState: ActionResult = { ok: false };

async function action(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  return createRecurringSeries(formData);
}

// 0 = Sunday … 6 = Saturday (matches lib/time.ilWeekday + schema weekday).
const WEEKDAYS: Array<{ value: number; label: string }> = [
  { value: 0, label: 'ראשון' },
  { value: 1, label: 'שני' },
  { value: 2, label: 'שלישי' },
  { value: 3, label: 'רביעי' },
  { value: 4, label: 'חמישי' },
  { value: 5, label: 'שישי' },
  { value: 6, label: 'שבת' },
];

const selectClass =
  'flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

export function RecurringForm({
  studentOptions,
  groupOptions,
}: {
  studentOptions: StudentOption[];
  groupOptions: GroupOption[];
}) {
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState<'individual' | 'group'>('individual');
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>שיעור חוזר שבועי</CardTitle>
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
            {open ? 'סגור' : 'הוסף'}
          </Button>
        </div>
      </CardHeader>
      {open && (
        <CardContent>
          <form action={formAction} className="space-y-3">
            <Field label="סוג">
              <select
                name="kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as 'individual' | 'group')}
                className={selectClass}
              >
                <option value="individual">תלמיד יחיד</option>
                <option value="group">קבוצה</option>
              </select>
            </Field>

            {kind === 'individual' ? (
              <Field label="תלמיד">
                <select name="studentId" className={selectClass} required>
                  <option value="">— בחר/י —</option>
                  {studentOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field label="קבוצה">
                <select name="groupId" className={selectClass} required>
                  <option value="">— בחר/י —</option>
                  {groupOptions.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="יום בשבוע">
                <select name="weekday" className={selectClass} defaultValue={0}>
                  {WEEKDAYS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="שעה">
                <Input name="startTime" type="time" required />
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Field label="משך (דק׳)">
                <Input name="durationMin" type="number" min={1} placeholder="60" />
              </Field>
              <Field label="מחיר (₪)">
                <Input name="price" type="number" min={0} step={1} />
              </Field>
              <Field label="אופק (ימים)">
                <Input name="horizonDays" type="number" min={1} placeholder="30" />
              </Field>
            </div>

            {state.error && <p className="text-sm text-red-600">{state.error}</p>}
            {state.ok && !state.error && (
              <p className="text-sm text-emerald-600">הסדרה נוצרה.</p>
            )}
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? 'יוצר…' : 'צור סדרה'}
            </Button>
          </form>
        </CardContent>
      )}
    </Card>
  );
}
