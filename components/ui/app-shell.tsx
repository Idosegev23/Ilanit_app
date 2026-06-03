'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

// Route prefixes that are STANDALONE (no app shell): public booking, login, and
// the single-action token pages Ilanit opens from her phone.
const STANDALONE_PREFIXES = ['/book', '/login', '/a/', '/m/', '/p/'];

function isStandalone(pathname: string): boolean {
  if (pathname === '/') return true; // root just redirects
  return STANDALONE_PREFIXES.some(
    (p) => pathname === p.replace(/\/$/, '') || pathname.startsWith(p),
  );
}

interface AppShellProps {
  /** Full public /book URL for the Topbar share affordance. */
  bookingUrl: string;
  children: React.ReactNode;
}

// RTL app shell: a RIGHT-side sidebar with main content to its left, plus a
// Topbar. Collapses to a top bar + drawer on mobile. Only wraps authenticated
// owner pages — standalone routes render bare.
export function AppShell({ bookingUrl, children }: AppShellProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  // Close the drawer whenever the route changes.
  React.useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  if (isStandalone(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-cream">
      {/* Desktop: fixed right sidebar (RTL → right edge), content to its left. */}
      <aside className="fixed inset-y-0 end-0 z-30 hidden w-64 border-s border-line lg:block">
        <Sidebar />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-ink/40"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 end-0 w-72 max-w-[85%] border-s border-line shadow-pop">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="סגור תפריט"
              className="absolute start-3 top-4 z-10 flex size-9 items-center justify-center rounded-xl text-ink hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
            <Sidebar onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main column — offset by the sidebar width on desktop (logical end). */}
      <div className="lg:me-64">
        <Topbar bookingUrl={bookingUrl} onOpenMenu={() => setDrawerOpen(true)} />
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
