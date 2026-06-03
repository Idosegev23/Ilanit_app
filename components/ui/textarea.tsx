import * as React from 'react';
import { cn } from '@/lib/utils';
import { fieldClasses } from './input';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  /** Renders the field in an error state (danger border + aria-invalid). */
  error?: boolean;
};

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, rows = 4, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={error || undefined}
      className={cn(
        fieldClasses,
        'min-h-[44px] resize-y py-2.5 leading-relaxed',
        error && 'border-danger focus-visible:border-danger focus-visible:ring-danger/30',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

export { Textarea };
