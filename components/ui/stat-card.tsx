import * as React from 'react';
import { ArrowUpRight, ArrowDownRight, type LucideIcon } from 'lucide-react';
import { Card } from './card';
import { cn } from '@/lib/utils';

export type StatTone = 'primary' | 'accent' | 'success' | 'warning' | 'danger';

// Icon glyphs need ≥3:1 against their chip. primary-600 (#e06b9f) lands at
// 2.8:1 on the blush chip, so the primary tone uses the deeper primary-700.
const TONE_CHIP: Record<StatTone, string> = {
  primary: 'bg-primary-soft text-primary-700',
  accent: 'bg-accent-soft text-accent-text',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
};

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  /** Big value — rendered with tabular figures. */
  value: React.ReactNode;
  icon?: LucideIcon;
  /** Color family for the icon chip. Defaults to primary. */
  tone?: StatTone;
  /** Optional small caption below the value. */
  hint?: string;
  /** Optional trend delta, e.g. "+12%". Styled by `deltaDirection`. */
  delta?: string;
  deltaDirection?: 'up' | 'down';
}

/*
  KPI tile (v4): blush glass, a soft tint band at the top, a colored icon chip,
  and an oversized tabular value. The number is the point of the tile, so it
  carries the most weight on the page after the h1.
*/
export function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'primary',
  hint,
  delta,
  deltaDirection,
  className,
  ...props
}: StatCardProps) {
  const DeltaIcon = deltaDirection === 'down' ? ArrowDownRight : ArrowUpRight;
  return (
    <Card className={cn('hover-lift overflow-hidden', className)} {...props}>
      {/* tinted sheen at the top edge */}
      <div className="bg-gradient-tint px-5 pt-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium text-muted">{label}</p>
          {Icon && (
            <span
              className={cn(
                'flex size-11 shrink-0 items-center justify-center rounded-2xl shadow-soft ring-1 ring-inset ring-white/70',
                TONE_CHIP[tone],
              )}
            >
              <Icon className="size-5" aria-hidden="true" />
            </span>
          )}
        </div>
      </div>
      <div className="px-5 pb-5 pt-1">
        <p className="text-4xl font-extrabold tracking-tight tabular-nums text-ink">
          {value}
        </p>
        {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
        {delta && (
          <p
            className={cn(
              'mt-3 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums',
              deltaDirection === 'down'
                ? 'bg-danger-soft text-danger'
                : 'bg-success-soft text-success',
            )}
          >
            <DeltaIcon className="size-3.5" aria-hidden="true" />
            {delta}
          </p>
        )}
      </div>
    </Card>
  );
}
