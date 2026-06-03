import * as React from 'react';
import { cn } from '@/lib/utils';

// Shimmer placeholder for async content (charts/lists). Animation is disabled
// automatically under prefers-reduced-motion (globals.css guard).
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl bg-primary-50',
        'after:absolute after:inset-0 after:-translate-x-full after:animate-shimmer',
        'after:bg-gradient-to-l after:from-transparent after:via-surface/70 after:to-transparent',
        className,
      )}
      aria-hidden="true"
      {...props}
    />
  );
}
