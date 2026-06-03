import * as React from 'react';
import { cn } from '@/lib/utils';

// Shared field shell styling (input / textarea / select). White bg, rounded-xl,
// hairline border, primary focus ring, ≥44px tall. Error state flips the border
// to danger and wires aria-invalid via the consuming component.
export const fieldClasses =
  'w-full rounded-xl border border-line bg-surface px-3.5 text-base text-ink shadow-soft transition-[border-color,box-shadow] duration-200 ease-out placeholder:text-muted/70 hover:border-primary-200 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50';

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
