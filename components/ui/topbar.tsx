'use client';

import { Menu } from 'lucide-react';

interface TopbarProps {
  /** Opens the mobile nav drawer (shown only on small screens). */
  onOpenMenu?: () => void;
}

// Sticky top bar: mobile menu trigger. The "שלח לינק לתיאום" action now lives on
// the dashboard (it needs the students list to power the picker dialog), so the
// generic share affordance has been removed.
export function Topbar({ onOpenMenu }: TopbarProps) {
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

      <div className="flex-1" />
    </header>
  );
}
