import { Banknote } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

/**
 * The group's price and what it is a price OF: a month, or a single session.
 * Shared by the create and edit forms so the two cannot drift apart.
 */
export function PriceField({
  defaultPrice,
  defaultUnit = 'month',
}: {
  defaultPrice?: number;
  defaultUnit?: 'month' | 'session';
}) {
  return (
    <div className="space-y-2 rounded-2xl border border-primary-200 bg-gradient-tint p-4 shadow-soft">
      <Label htmlFor="monthlyPrice" required className="flex items-center gap-1.5">
        <Banknote className="size-4 text-primary-700" aria-hidden="true" />
        מחיר לחבר (₪)
      </Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 end-3.5 flex items-center text-base font-medium text-muted"
          >
            ₪
          </span>
          <Input
            id="monthlyPrice"
            name="monthlyPrice"
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            required
            placeholder="300"
            defaultValue={defaultPrice}
            className="pe-9 text-lg font-semibold tabular-nums"
          />
        </div>
        <Select
          name="priceUnit"
          defaultValue={defaultUnit}
          aria-label="המחיר הוא"
          className="w-32"
        >
          <option value="month">לחודש</option>
          <option value="session">למפגש</option>
        </Select>
      </div>
      <p className="text-xs text-muted">
        לחודש: סכום קבוע, נגבה במפגש הראשון של החודש.
        <br />
        למפגש: ב-1 לחודש כל חברה מחויבת מראש במחיר × מספר המפגשים של אותו חודש.
      </p>
    </div>
  );
}
