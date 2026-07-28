import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/*
  Blush button (v4). Every size is a full pill — the rounded silhouette is the
  single most legible carrier of the new identity.

  Contrast contract: `primary` fills with pink and sets INK text, never white.
  White on #f493be is 2.15:1; ink on it is 6.2:1. `ink` is the inverse — a solid
  #2e2f34 fill with white text (13.4:1) — and is the right choice for the
  highest-emphasis action on a page, so pink stays a warm accent instead of
  becoming visual noise when it repeats.

  Variants:
    primary   = pink fill, ink text, pink halo (default CTA)
    ink       = near-black fill, white text (highest emphasis)
    gradient  = pink→peach, ink text (hero CTA only)
    secondary = white glass + hairline
    ghost     = transparent, blush hover
    danger    = destructive
  Legacy names kept for back-compat: `default` → primary, `outline` → secondary,
  `destructive` → danger.
*/
const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-[background-color,background-image,box-shadow,color,transform] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-cream focus-visible:ring-ink active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-primary-fg shadow-glow hover:bg-primary-600 hover:-translate-y-px hover:shadow-glow-lg active:translate-y-0',
        ink: 'bg-ink text-white shadow-card hover:-translate-y-px hover:shadow-pop hover:brightness-110 active:translate-y-0',
        // Pink→peach. Carries INK text — white would land near 2:1 on the peach stop.
        gradient:
          'bg-gradient-cta text-ink shadow-glow hover:-translate-y-px hover:shadow-glow-lg hover:brightness-[1.03] active:translate-y-0',
        secondary:
          'border border-line bg-white/80 text-ink shadow-soft backdrop-blur hover:border-primary-300 hover:bg-white hover:-translate-y-px hover:shadow-card active:translate-y-0',
        ghost: 'text-ink hover:bg-primary-50',
        danger:
          'bg-danger text-white shadow-[0_8px_24px_-6px_rgba(192,50,91,0.5)] hover:brightness-110 hover:-translate-y-px active:translate-y-0',
        // Back-compat aliases
        default:
          'bg-primary text-primary-fg shadow-glow hover:bg-primary-600 hover:-translate-y-px hover:shadow-glow-lg active:translate-y-0',
        outline:
          'border border-line bg-white/80 text-ink shadow-soft backdrop-blur hover:border-primary-300 hover:bg-white hover:-translate-y-px hover:shadow-card active:translate-y-0',
        destructive:
          'bg-danger text-white shadow-[0_8px_24px_-6px_rgba(192,50,91,0.5)] hover:brightness-110 hover:-translate-y-px active:translate-y-0',
      },
      size: {
        sm: 'h-10 px-4 text-sm',
        md: 'h-11 px-5 text-sm',
        lg: 'h-13 px-7 text-base',
        // Back-compat: old `default` size ≈ md.
        default: 'h-11 px-5 text-sm',
      },
      // Retained for API compatibility — every button is already a pill.
      pill: {
        true: '',
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
