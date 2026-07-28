'use client';

import * as React from 'react';
import {
  Building2,
  Timer,
  Receipt,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import {
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
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

/** A labelled subsection inside the business card — groups related fields with
 * a small icon chip + heading so the form reads as distinct concerns rather
 * than one long list (visual-hierarchy / field-grouping). */
function Section({
  icon: Icon,
  title,
  description,
  children,
  highlight = false,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Emphasised treatment (warm tint + ring) for the standout pricing block. */
  highlight?: boolean;
}) {
  return (
    <fieldset
      className={cn(
        'rounded-2xl border p-5 transition-colors duration-200 sm:p-6',
        highlight
          ? 'border-primary-200 bg-gradient-tint shadow-card'
          : 'border-line bg-primary-50/45',
      )}
    >
      <legend className="mb-1 flex w-full items-center gap-2.5">
        <span
          className={cn(
            'flex size-10 items-center justify-center rounded-xl shadow-soft ring-1 ring-inset ring-white/70',
            highlight
              ? 'bg-gradient-cta text-primary-fg'
              : 'bg-primary-soft text-primary-700',
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <span className="text-base font-bold tracking-tight text-ink sm:text-lg">
          {title}
        </span>
      </legend>
      {description && (
        <p className="mb-5 ps-[50px] text-xs leading-relaxed text-muted">
          {description}
        </p>
      )}
      {children}
    </fieldset>
  );
}

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
          // Clamp into [min, max] so the field never holds a browser-"invalid" value.
          const raw = Math.trunc(Number(e.target.value));
          onValue(Number.isFinite(raw) ? Math.min(max, Math.max(min, raw)) : min);
        }}
        className="tabular-nums"
      />
      {helper && <p className="text-xs text-muted">{helper}</p>}
    </div>
  );
}

// Business + scheduling settings. These feed the availability/booking engine
// (duration, buffer, lead-time, horizon), the group-billing / reminder cron,
// and the default private-lesson price fallback.
export function BusinessSettingsForm({ values, onChange }: BusinessSettingsFormProps) {
  const set = <K extends keyof SettingsValues>(key: K, val: SettingsValues[K]) =>
    onChange({ ...values, [key]: val });

  const priceHasValue =
    values.defaultPrivatePrice !== null &&
    Number.isFinite(values.defaultPrivatePrice);

  return (
    // Long form → solid surface. Glass is for panels with room to breathe; a
    // moving wash behind twelve stacked fields costs legibility.
    <Card solid className="overflow-hidden">
      <CardHeader variant="gradient" className="p-5 sm:p-6">
        <CardTitle className="flex items-center gap-2.5 text-xl">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-700 shadow-soft ring-1 ring-inset ring-white/70">
            <Building2 className="size-5" aria-hidden="true" />
          </span>
          פרטי העסק, תמחור והזמנה
        </CardTitle>
        <CardDescription className="ps-[50px] leading-relaxed">
          הכתובת נכנסת אוטומטית להזמנת היומן. משך השיעור וה־buffer קובעים את חלוקת
          הסלוטים בלינק התיאום, והמחיר משמש כברירת-מחדל לתלמידים ללא מחיר משלהם.
        </CardDescription>
      </CardHeader>

      <CardBody className="space-y-5 p-5 pt-5 sm:p-6">
        {/* ── זהות העסק ── */}
        <Section icon={Building2} title="זהות העסק">
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
                autoComplete="organization"
              />
              {values.businessName.trim().length === 0 && (
                <p className="text-xs font-medium text-danger" role="alert">
                  יש להזין שם עסק.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="locationAddress">כתובת העסק</Label>
              <Input
                id="locationAddress"
                value={values.locationAddress}
                onChange={(e) => set('locationAddress', e.target.value)}
                placeholder="רחוב, עיר"
                autoComplete="street-address"
              />
              <p className="text-xs text-muted">נכנסת להזמנת היומן של התלמיד.</p>
            </div>
          </div>
        </Section>

        {/* ── תמחור — the new functional field (emphasised standout block) ── */}
        <Section
          icon={Wallet}
          title="תמחור"
          highlight
          description="מחיר זה משמש כברירת-מחדל כאשר לתלמיד אין מחיר אישי לשיעור פרטי. מספר שלם בשקלים, ללא אגורות."
        >
          <div className="sm:max-w-sm">
            <Label htmlFor="defaultPrivatePrice">
              מחיר ברירת-מחדל לשיעור פרטי
            </Label>
            <div className="relative mt-2">
              {/* Inline ₪ adornment at the inline-start (RTL aware). */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-4 text-xl font-bold text-primary-700"
              >
                ₪
              </span>
              <Input
                id="defaultPrivatePrice"
                type="number"
                inputMode="numeric"
                min={0}
                max={100000}
                step={1}
                placeholder="לא הוגדר"
                value={priceHasValue ? String(values.defaultPrivatePrice) : ''}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  if (raw === '') {
                    set('defaultPrivatePrice', null);
                    return;
                  }
                  const n = Math.trunc(Number(raw));
                  set(
                    'defaultPrivatePrice',
                    Number.isFinite(n) && n >= 0 ? n : null,
                  );
                }}
                className="h-14 ps-11 text-2xl font-extrabold tracking-tight tabular-nums"
                aria-describedby="defaultPrivatePrice-help"
              />
            </div>
            <p id="defaultPrivatePrice-help" className="mt-2 text-xs leading-relaxed text-muted">
              {priceHasValue
                ? 'תלמידים ללא מחיר אישי יחויבו בסכום זה.'
                : 'השאירי ריק כדי לחייב לפי מחיר אישי בלבד.'}
            </p>
          </div>
        </Section>

        {/* ── מנוע הזמנה ── */}
        <Section
          icon={Timer}
          title="מנוע ההזמנה"
          description="פרמטרים אלה קובעים אילו סלוטים יוצגו בלינק התיאום הציבורי."
        >
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
        </Section>

        {/* ── חיוב ומסמכים ── */}
        <Section
          icon={Receipt}
          title="חיוב ומסמכים"
          description="חיובי קבוצות מתבצעים אוטומטית, וקבלות מופקות בסוג המסמך שנבחר."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          </div>
        </Section>
      </CardBody>
    </Card>
  );
}
