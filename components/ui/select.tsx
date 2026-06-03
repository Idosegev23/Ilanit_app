import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fieldClasses } from './input';

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  /** Renders the field in an error state (danger border + aria-invalid). */
  error?: boolean;
};

// Native <select> styled to match the field family. The caret sits at the
// inline-end (logical) so it mirrors correctly under RTL.
const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        aria-invalid={error || undefined}
        className={cn(
          fieldClasses,
          'h-11 appearance-none py-2 pe-10',
          error && 'border-danger focus-visible:border-danger focus-visible:ring-danger/30',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted"
        aria-hidden="true"
      />
    </div>
  ),
);
Select.displayName = 'Select';

export { Select };
