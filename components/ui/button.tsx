import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// Warm soft-UI button. Variants map to the design contract:
//   primary  = terracotta, white text (default CTA)
//   secondary = cream surface + border
//   ghost    = transparent, tinted hover
//   danger   = destructive
// Legacy names kept for back-compat: `default` → primary, `outline` → secondary,
// `destructive` → danger.
const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium transition-[background-color,background-image,box-shadow,color,transform] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-cream focus-visible:ring-primary active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-primary-fg shadow-[0_8px_20px_-8px_rgba(var(--shadow-tint),0.45),inset_0_1px_0_rgba(255,255,255,0.18)] hover:bg-primary-600 hover:-translate-y-px hover:shadow-pop active:translate-y-0',
        // Calm teal gradient CTA — safe contrast (white text ≥4.5:1) for hero actions.
        gradient:
          'bg-gradient-cta text-primary-fg shadow-[0_8px_20px_-8px_rgba(var(--shadow-tint),0.45),inset_0_1px_0_rgba(255,255,255,0.18)] hover:-translate-y-px hover:shadow-pop hover:brightness-[1.05] active:translate-y-0',
        secondary:
          'border border-line bg-surface text-ink shadow-soft hover:bg-primary-50 hover:border-primary-200 hover:-translate-y-px active:translate-y-0',
        ghost: 'text-ink hover:bg-primary-50',
        danger: 'bg-danger text-white shadow-[0_8px_20px_-8px_rgba(188,59,51,0.45),inset_0_1px_0_rgba(255,255,255,0.16)] hover:brightness-95 hover:-translate-y-px active:translate-y-0',
        // Back-compat aliases
        default:
          'bg-primary text-primary-fg shadow-[0_8px_20px_-8px_rgba(var(--shadow-tint),0.45),inset_0_1px_0_rgba(255,255,255,0.18)] hover:bg-primary-600 hover:-translate-y-px hover:shadow-pop active:translate-y-0',
        outline:
          'border border-line bg-surface text-ink shadow-soft hover:bg-primary-50 hover:border-primary-200 hover:-translate-y-px active:translate-y-0',
        destructive: 'bg-danger text-white shadow-[0_8px_20px_-8px_rgba(188,59,51,0.45),inset_0_1px_0_rgba(255,255,255,0.16)] hover:brightness-95 hover:-translate-y-px active:translate-y-0',
      },
      size: {
        sm: 'h-9 rounded-lg px-3 text-sm',
        md: 'h-11 rounded-xl px-5 text-sm',
        lg: 'h-12 rounded-xl px-6 text-base',
        // Back-compat: old `default` size ≈ md but min 44px tall.
        default: 'h-11 rounded-xl px-5 text-sm',
      },
      pill: {
        true: 'rounded-full',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
      pill: false,
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Shows a spinner and disables the button. */
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, pill, loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, pill }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

export { Button, buttonVariants };
