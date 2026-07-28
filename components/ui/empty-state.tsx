import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: LucideIcon;
  title: string;
  /** Helper line beneath the title. */
  description?: string;
  /** Optional CTA slot (e.g. a <Button>). */
  action?: React.ReactNode;
}

// Friendly empty placeholder — a large illustrative icon nested in concentric
// tinted rings (so it reads as crafted, not a bare line), helpful copy, and an
// optional CTA. Used by "אין זמנים", empty lists, etc.
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'glass flex flex-col items-center justify-center gap-4 rounded-2xl px-6 py-14 text-center',
        className,
      )}
      {...props}
    >
      {Icon && (
        <span className="flex size-20 items-center justify-center rounded-full bg-primary-soft/70 ring-1 ring-primary-100">
          {/* primary-700, not primary: #f493be on white is 2.15:1, below the
              3:1 that a meaningful glyph needs. */}
          <span className="flex size-14 items-center justify-center rounded-full bg-surface text-primary-700 shadow-soft ring-1 ring-primary-100">
            <Icon className="size-7" aria-hidden="true" />
          </span>
        </span>
      )}
      <div className="space-y-1.5">
        <p className="text-lg font-bold tracking-tight text-ink">{title}</p>
        {description && (
          <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted">
            {description}
          </p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
