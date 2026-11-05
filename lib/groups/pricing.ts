import { formatShekels } from '@/lib/utils';

/*
  How a group's price reads on screen. A group is paid either a flat monthly fee
  or per meeting, and every place that shows "₪320 לחבר / חודש" has to say which
  — "₪0 לחודש" for a ₪100-a-session group would be both wrong and alarming.
*/

export interface PricedGroup {
  monthlyPrice: number;
  pricePerSession: number | null;
}

export function isPerSession(g: PricedGroup): boolean {
  return g.pricePerSession != null;
}

/** "₪100 למפגש" or "₪320 לחודש". */
export function groupPriceLabel(g: PricedGroup): string {
  return isPerSession(g)
    ? `${formatShekels(g.pricePerSession!)} למפגש`
    : `${formatShekels(g.monthlyPrice)} לחודש`;
}
