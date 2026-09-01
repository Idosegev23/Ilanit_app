'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { Topbar } from './topbar';
import { NavOverlay } from './nav-overlay';

// Route prefixes that are STANDALONE (no app shell): public booking, login, and
// the single-action token pages Ilanit opens from her phone. These still get the
// aurora — it lives in the root layout, above this component.
const STANDALONE_PREFIXES = ['/book', '/login', '/a/', '/m/', '/p/', '/c/', '/pay/'];

function isStandalone(pathname: string): boolean {
  if (pathname === '/') return true; // root just redirects
  return STANDALONE_PREFIXES.some(
    (p) => pathname === p.replace(/\/$/, '') || pathname.startsWith(p),
  );
}

interface AppShellProps {
  children: React.ReactNode;
}

/*
  App shell (v4). The v3 right-hand sidebar is gone: navigation is now the
  full-screen OptionWheel overlay at every breakpoint, opened from the topbar.
  That leaves one centred content column with no sidebar offset to reason about,
  which is what makes the mobile layout the primary case rather than a
  fallback — the phone and the desktop now run the same structure.

  Only wraps authenticated owner pages; standalone routes render bare.
*/
export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  // Close the menu whenever the route changes.
  React.useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  if (isStandalone(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen">
      <Topbar
        onOpenMenu={() => setMenuOpen(true)}
        menuOpen={menuOpen}
        triggerRef={triggerRef}
      />

      <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:px-6 sm:pb-16 sm:pt-8">
        {children}
      </main>

      <NavOverlay
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        returnFocusTo={triggerRef}
      />
    </div>
  );
}
