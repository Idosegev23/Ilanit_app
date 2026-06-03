import * as React from 'react';
import { cn } from '@/lib/utils';

export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement> & {
  /** Appends a danger asterisk to mark the field as required. */
  required?: boolean;
};

// Form label — 500 weight, ink color, RTL-safe.
const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, required, children, ...props }, ref) => (
    <label
      ref={ref}
      className={cn('block text-sm font-medium text-ink', className)}
      {...props}
    >
      {children}
      {required && (
        <span className="ms-1 text-danger" aria-hidden="true">
          *
        </span>
      )}
    </label>
  ),
);
Label.displayName = 'Label';

export { Label };
