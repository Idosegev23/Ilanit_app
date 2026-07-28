import * as React from 'react';
import { cn } from '@/lib/utils';

/*
  Blush glass card (v4). The default surface is translucent white over a blur,
  so the live aurora bleeds through the edges — that show-through is what makes
  an animated backdrop worth having rather than a wallpaper nobody sees.

  Use `solid` for dense data (tables, calendar grids, long forms) where a moving
  wash behind small text costs legibility. Legibility wins there; the glass is
  for surfaces with room to breathe.

  Sub-parts are optional; `CardContent` is a back-compat alias for `CardBody`.
*/
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Adds hover-lift + pointer affordance for clickable cards. */
  interactive?: boolean;
  /** Opaque surface — for dense data where blur hurts legibility. */
  solid?: boolean;
}

export function Card({ className, interactive, solid, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl',
        solid ? 'border border-line bg-surface shadow-card' : 'glass',
        interactive && 'hover-lift cursor-pointer',
        className,
      )}
      {...props}
    />
  );
}

export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Header surface treatment:
   *  - 'plain'   (default) transparent header
   *  - 'tint'    soft blush tint
   *  - 'gradient' blush→white sheen + bottom hairline
   */
  variant?: 'plain' | 'tint' | 'gradient';
}

export function CardHeader({
  className,
  variant = 'plain',
  ...props
}: CardHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 p-6 pb-3',
        variant === 'tint' &&
          'rounded-t-2xl border-b border-line bg-surface-2/70 pb-4',
        variant === 'gradient' &&
          'rounded-t-2xl border-b border-line bg-gradient-tint pb-4',
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn('text-lg font-bold tracking-tight text-ink', className)}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted', className)} {...props} />;
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-6 pt-3', className)} {...props} />;
}

/** Back-compat alias for {@link CardBody}. */
export const CardContent = CardBody;

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 border-t border-line p-6 pt-4',
        className,
      )}
      {...props}
    />
  );
}
