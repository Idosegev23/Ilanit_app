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

// Friendly empty placeholder — used by "אין זמנים", empty lists, etc.
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
        'flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line bg-surface/60 px-6 py-12 text-center',
        className,
      )}
      {...props}
    >
      {Icon && (
        <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary-600">
          <Icon className="size-6" aria-hidden="true" />
        </span>
      )}
      <p className="text-base font-semibold text-ink">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
