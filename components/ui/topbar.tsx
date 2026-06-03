'use client';

import * as React from 'react';
import { Menu } from 'lucide-react';

interface TopbarProps {
  /** Opens the mobile nav drawer (shown only on small screens). */
  onOpenMenu?: () => void;
  /** Page title shown inline in the bar (optional). */
  title?: string;
  /** Secondary line under the title (optional). */
  subtitle?: string;
  /** Primary action slot rendered at the inline-end (e.g. "שלח לינק לתיאום"). */
  action?: React.ReactNode;
}

// Sticky top bar: mobile menu trigger + optional page title/subtitle and a
// primary action slot at the inline-end. A soft bottom border + slight blur
// keeps it grounded over the cream content as it scrolls.
export function Topbar({ onOpenMenu, title, subtitle, action }: TopbarProps) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-cream/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-cream/70 sm:px-6">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="פתח תפריט"
        className="flex size-10 items-center justify-center rounded-xl text-ink transition-colors hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:hidden"
      >
        <Menu className="size-5" aria-hidden="true" />
      </button>

      {(title || subtitle) && (
        <div className="min-w-0">
          {title && (
            <p className="truncate text-base font-bold leading-tight text-ink">
              {title}
            </p>
          )}
          {subtitle && (
            <p className="truncate text-xs text-muted">{subtitle}</p>
          )}
        </div>
      )}

      <div className="flex-1" />

      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </header>
  );
}
