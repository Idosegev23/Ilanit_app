'use client';

import * as React from 'react';
import { Building2 } from 'lucide-react';
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type { SettingsValues } from './types';

interface BusinessSettingsFormProps {
  values: SettingsValues;
  onChange: (next: SettingsValues) => void;
}

// Morning document types (spec §11 TBD): receipt vs. tax-invoice-receipt.
const MORNING_DOC_TYPES = [
  { value: '', label: 'לא הוגדר' },
  { value: '400', label: 'קבלה (400)' },
  { value: '320', label: 'חשבונית מס-קבלה (320)' },
] as const;

/** Reusable labelled number field that clamps to an integer on change. */
function NumberField({
  id,
  label,
  helper,
  value,
  min,
  max,
  onValue,
}: {
  id: string;
  label: string;
  helper?: string;
  value: number;
  min: number;
  max: number;
  onValue: (n: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => {
          const n = Math.trunc(Number(e.target.value));
          onValue(Number.isFinite(n) ? n : min);
        }}
        className="tabular-nums"
      />
      {helper && <p className="text-xs text-muted">{helper}</p>}
    </div>
  );
}

// Business + scheduling settings. These feed the availability/booking engine
// (duration, buffer, lead-time, horizon) and the group-billing / reminder cron.
export function BusinessSettingsForm({ values, onChange }: BusinessSettingsFormProps) {
  const set = <K extends keyof SettingsValues>(key: K, val: SettingsValues[K]) =>
    onChange({ ...values, [key]: val });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="size-5 text-primary-600" aria-hidden="true" />
          פרטי העסק והזמנה
        </CardTitle>
        <CardDescription>
          הכתובת נכנסת אוטומטית להזמנת היומן. משך השיעור וה־buffer קובעים את חלוקת
          הסלוטים בלינק התיאום.
        </CardDescription>
      </CardHeader>
      <CardBody className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="businessName" required>
              שם העסק
            </Label>
            <Input
              id="businessName"
              value={values.businessName}
              onChange={(e) => set('businessName', e.target.value)}
              error={values.businessName.trim().length === 0}
            />
            {values.businessName.trim().length === 0 && (
              <p className="text-xs font-medium text-danger">יש להזין שם עסק.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="locationAddress">כתובת העסק</Label>
            <Input
              id="locationAddress"
              value={values.locationAddress}
              onChange={(e) => set('locationAddress', e.target.value)}
              placeholder="רחוב, עיר"
            />
            <p className="text-xs text-muted">נכנסת להזמנת היומן של התלמיד.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NumberField
            id="defaultDurationMin"
            label="משך שיעור (דק׳)"
            value={values.defaultDurationMin}
            min={1}
            max={600}
            onValue={(n) => set('defaultDurationMin', n)}
          />
          <NumberField
            id="bufferMin"
            label="מרווח בין שיעורים (דק׳)"
            value={values.bufferMin}
            min={0}
            max={240}
            onValue={(n) => set('bufferMin', n)}
          />
          <NumberField
            id="leadTimeMin"
            label="זמן מינימלי מראש (דק׳)"
            helper="כמה זמן לפני השיעור עוד אפשר לקבוע."
            value={values.leadTimeMin}
            min={0}
            max={20160}
            onValue={(n) => set('leadTimeMin', n)}
          />
          <NumberField
            id="bookingHorizonDays"
            label="אופק הזמנה (ימים)"
            helper="עד כמה ימים קדימה תלמידים יכולים לקבוע."
            value={values.bookingHorizonDays}
            min={1}
            max={365}
            onValue={(n) => set('bookingHorizonDays', n)}
          />
          <NumberField
            id="groupBillingDay"
            label="יום חיוב קבוצות"
            helper="היום בחודש שבו נוצרים חיובי הקבוצות (1–28)."
            value={values.groupBillingDay}
            min={1}
            max={28}
            onValue={(n) => set('groupBillingDay', n)}
          />

          <div className="space-y-1.5">
            <Label htmlFor="reminderTime">שעת תזכורת יום-לפני</Label>
            <Input
              id="reminderTime"
              type="time"
              value={values.reminderTime}
              onChange={(e) => set('reminderTime', e.target.value)}
              className="tabular-nums"
              dir="ltr"
            />
            <p className="text-xs text-muted">השעה שבה נשלחות תזכורות לשיעורי מחר.</p>
          </div>
        </div>

        <div className="space-y-1.5 sm:max-w-xs">
          <Label htmlFor="morningDocType">סוג מסמך Morning</Label>
          <Select
            id="morningDocType"
            value={values.morningDocType ?? ''}
            onChange={(e) =>
              set('morningDocType', e.target.value === '' ? null : e.target.value)
            }
          >
            {MORNING_DOC_TYPES.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted">סוג המסמך שיופק בעת הפקת קבלה.</p>
        </div>
      </CardBody>
    </Card>
  );
}
