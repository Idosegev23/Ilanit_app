import * as React from 'react';
import { cn } from '@/lib/utils';

/*
  Shared field shell (input / textarea / select) — v4.

  Translucent white over the aurora, rounded-xl (22px), hairline blush border,
  ≥44px tall. The focus treatment is a pink border plus an INK ring: a pink ring
  alone measures 2.15:1 against white and would fail WCAG 2.2's 3:1 requirement
  for a focus indicator, so the visible ring carries ink and the pink is
  decoration on top of it.

  Error state flips the border to danger and wires aria-invalid via the
  consuming component.
*/
export const fieldClasses =
  'w-full rounded-xl border border-line bg-white/80 px-4 text-base text-ink shadow-soft backdrop-blur transition-[border-color,box-shadow,background-color] duration-200 ease-out placeholder:text-muted hover:border-primary-300 hover:bg-white focus:outline-none focus:border-primary focus:bg-white focus:ring-2 focus:ring-ink disabled:cursor-not-allowed disabled:opacity-50';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  /** Renders the field in an error state (danger border + aria-invalid). */
  error?: boolean;
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => (
    <input
      ref={ref}
      aria-invalid={error || undefined}
      className={cn(
        fieldClasses,
        'h-11 py-2',
        error && 'border-danger focus:border-danger focus:ring-danger/30',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };
