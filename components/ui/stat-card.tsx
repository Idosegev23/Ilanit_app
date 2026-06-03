import * as React from 'react';
import { ArrowUpRight, ArrowDownRight, type LucideIcon } from 'lucide-react';
import { Card } from './card';
import { cn } from '@/lib/utils';

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  /** Big value — rendered with tabular figures. */
  value: React.ReactNode;
  icon?: LucideIcon;
  /** Optional small caption below the value. */
  hint?: string;
  /** Optional trend delta, e.g. "+12%". Positive/negative styling by `deltaDirection`. */
  delta?: string;
  deltaDirection?: 'up' | 'down';
}

// KPI tile: tinted icon chip + big tabular value + label (+ optional delta).
export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  delta,
  deltaDirection,
  className,
  ...props
}: StatCardProps) {
  const DeltaIcon = deltaDirection === 'down' ? ArrowDownRight : ArrowUpRight;
  return (
    <Card className={cn('p-5', className)} {...props}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted">{label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
        </div>
        {Icon && (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-600">
            <Icon className="size-5" aria-hidden="true" />
          </span>
        )}
      </div>
      {delta && (
        <p
          className={cn(
            'mt-3 inline-flex items-center gap-1 text-xs font-medium tabular-nums',
            deltaDirection === 'down' ? 'text-danger' : 'text-success',
          )}
        >
          <DeltaIcon className="size-3.5" aria-hidden="true" />
          {delta}
        </p>
      )}
    </Card>
  );
}
