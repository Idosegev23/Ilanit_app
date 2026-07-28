'use client';

import * as React from 'react';
import { Brand } from './brand';
import { NavTrigger } from './nav-overlay';

interface TopbarProps {
  /** Opens the wheel navigation overlay. */
  onOpenMenu?: () => void;
  /** Whether the overlay is currently open (drives aria-expanded). */
  menuOpen?: boolean;
  /** Ref on the trigger so the overlay can return focus to it on close. */
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
  /** Page title shown inline in the bar (optional). */
  title?: string;
  /** Secondary line under the title (optional). */
  subtitle?: string;
  /** Primary action slot rendered at the inline-end (e.g. "שלח לינק לתיאום"). */
  action?: React.ReactNode;
}

/*
  Sticky top bar (v4): a floating blush-glass rail carrying the menu trigger, the
  brand mark, and an optional page title + action slot. Since the sidebar is
  gone this is the only persistent chrome, so it also carries the brand — which
  used to live in the sidebar header.
*/
export function Topbar({
  onOpenMenu,
  menuOpen = false,
  triggerRef,
  title,
  subtitle,
  action,
}: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 px-3 pt-3 sm:px-5 sm:pt-4">
      <div className="glass mx-auto flex h-16 w-full max-w-6xl items-center gap-3 rounded-full px-3 sm:px-4">
        <NavTrigger
          ref={triggerRef}
          onClick={() => onOpenMenu?.()}
          expanded={menuOpen}
        />

        {title || subtitle ? (
          <div className="min-w-0 ps-1">
            {title && (
              <p className="truncate text-base font-bold leading-tight text-ink">
                {title}
              </p>
            )}
            {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
          </div>
        ) : (
          <Brand size="sm" markOnly className="hidden sm:flex" />
        )}

        <div className="flex-1" />

        {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      </div>
    </header>
  );
}
