'use client';

import * as React from 'react';
import { Check } from 'lucide-react';
import { Input } from '@/components/ui/input';

// Receipt description editor used inside the "mark paid + issue receipt" form.
// Quick presets fill the free-text field; the value is posted as `description`.
// The default is the student's receiptLabel when set, else "חוג {group name}".
// An empty submit lets the server fall back to that same default.

const PRESETS = ['שיעור פרטי', 'חוג', 'הוראה מתקנת'] as const;

interface ReceiptDescriptionFieldProps {
  /** Field id (unique per roster row). */
  id: string;
  /** Default description: student's receiptLabel ?? "חוג {group name}". */
  defaultValue: string;
  /** Accessible label naming the member this receipt is for. */
  ariaLabel: string;
}

export function ReceiptDescriptionField({
  id,
  defaultValue,
  ariaLabel,
}: ReceiptDescriptionFieldProps) {
  const [value, setValue] = React.useState(defaultValue);

  return (
    <div className="w-full space-y-1.5">
      <label htmlFor={id} className="sr-only">
        {ariaLabel}
      </label>
      <Input
        id={id}
        name="description"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={defaultValue}
        className="text-sm"
      />
      {/* Preset pills. `aria-pressed` already carries the state for AT, and the
         selected pill adds a ✓ so the choice is not conveyed by fill alone. */}
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => {
          const active = value.trim() === preset;
          return (
            <button
              key={preset}
              type="button"
              onClick={() => setValue(preset)}
              aria-pressed={active}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-xs font-bold transition-[background-color,border-color,box-shadow] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-cream ${
                active
                  ? 'border border-primary bg-primary text-primary-fg shadow-glow'
                  : 'border border-line bg-surface text-ink hover:border-primary-300 hover:bg-primary-50'
              }`}
            >
              {active && <Check className="size-3.5 shrink-0" aria-hidden="true" />}
              {preset}
            </button>
          );
        })}
      </div>
    </div>
  );
}
