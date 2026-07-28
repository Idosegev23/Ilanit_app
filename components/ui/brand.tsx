import * as React from 'react';
import { CalendarHeart } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BrandProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual scale. */
  size?: 'sm' | 'md' | 'lg';
  /** When true, the wordmark + mark render in light-on-dark (for ink panels). */
  onDark?: boolean;
  /** Hide the "אילנית" wordmark, leaving just the calendar-heart mark. */
  markOnly?: boolean;
}

const SIZE = {
  sm: { box: 'size-9', icon: 'size-5', word: 'text-base' },
  md: { box: 'size-11', icon: 'size-6', word: 'text-xl' },
  lg: { box: 'size-14', icon: 'size-7', word: 'text-3xl' },
} as const;

/**
 * Ilanit brand lockup: a calendar-heart mark in a blush chip plus the Hebrew
 * wordmark "אילנית".
 *
 * The mark is pink with INK glyph — pink carries a white glyph at only 2.15:1,
 * so on-primary content is always dark. On dark panels the chip inverts to a
 * translucent white wash, where white is correct.
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
          'flex shrink-0 items-center justify-center rounded-2xl',
          s.box,
          onDark
            ? 'bg-white/15 text-white ring-1 ring-white/25 backdrop-blur-sm'
            : 'bg-primary text-primary-fg shadow-glow',
        )}
      >
        <CalendarHeart className={s.icon} aria-hidden="true" />
      </span>
      {!markOnly && (
        <span
          className={cn(
            'font-extrabold leading-none tracking-tight',
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
