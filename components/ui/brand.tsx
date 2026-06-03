import * as React from 'react';
import { CalendarHeart } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BrandProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual scale. */
  size?: 'sm' | 'md' | 'lg';
  /** When true, the wordmark + mark render in light-on-dark (for gradient panels). */
  onDark?: boolean;
  /** Hide the "אילנית" wordmark, leaving just the calendar-heart mark. */
  markOnly?: boolean;
}

const SIZE = {
  sm: { box: 'size-9', icon: 'size-5', word: 'text-base', radius: 'rounded-xl' },
  md: { box: 'size-11', icon: 'size-6', word: 'text-xl', radius: 'rounded-2xl' },
  lg: { box: 'size-14', icon: 'size-7', word: 'text-3xl', radius: 'rounded-2xl' },
} as const;

/**
 * Ilanit brand lockup: a calendar-heart mark in a tinted/elevated chip plus the
 * Hebrew wordmark "אילנית". Used in the sidebar and the auth hero panel.
 */
export function Brand({
  size = 'md',
  onDark = false,
  markOnly = false,
  className,
  ...props
}: BrandProps) {
  const s = SIZE[size];
  return (
    <div className={cn('flex items-center gap-3', className)} {...props}>
      <span
        className={cn(
          'flex shrink-0 items-center justify-center shadow-soft',
          s.box,
          s.radius,
          onDark
            ? 'bg-white/15 text-white ring-1 ring-white/25 backdrop-blur-sm'
            : 'bg-primary text-primary-fg',
        )}
      >
        <CalendarHeart className={s.icon} aria-hidden="true" />
      </span>
      {!markOnly && (
        <span
          className={cn(
            'font-bold leading-none tracking-tight',
            s.word,
            onDark ? 'text-white' : 'text-ink',
          )}
        >
          אילנית
        </span>
      )}
    </div>
  );
}
