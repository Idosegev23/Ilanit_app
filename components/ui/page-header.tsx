import * as React from 'react';
import { cn } from '@/lib/utils';

export interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  subtitle?: string;
  /** Small eyebrow label above the title (optional). */
  eyebrow?: string;
  /** Right-aligned (logical end) actions slot, e.g. buttons. */
  actions?: React.ReactNode;
}

// Standard page heading: optional eyebrow + bold title (with a short terracotta
// accent bar at the inline-start) + subtitle, and an actions slot that wraps
// below on narrow screens. Strong hierarchy to anchor each page.
export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
      {...props}
    >
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-accent-text">
            {eyebrow}
          </p>
        )}
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="h-7 w-1.5 shrink-0 rounded-full bg-gradient-warm"
          />
          <h1 className="text-2xl font-bold leading-tight text-ink sm:text-3xl">
            {title}
          </h1>
        </div>
        {subtitle && (
          <p className="mt-2 ps-[18px] text-sm text-muted">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
