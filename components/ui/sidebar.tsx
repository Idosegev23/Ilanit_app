'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GraduationCap, LogOut } from 'lucide-react';
import { NAV_ITEMS, isActivePath } from './nav-items';
import { signOutAction } from './shell-actions';
import { cn } from '@/lib/utils';

interface SidebarProps {
  /** Called after a nav link is clicked — used to close the mobile drawer. */
  onNavigate?: () => void;
  className?: string;
}

// Right-side navigation (RTL): logo/title, nav items with active highlight +
// inline-start accent border, and a visually separated sign-out at the bottom.
export function Sidebar({ onNavigate, className }: SidebarProps) {
  const pathname = usePathname();

  return (
    <div className={cn('flex h-full flex-col bg-surface', className)}>
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-fg shadow-soft">
          <GraduationCap className="size-5" aria-hidden="true" />
        </span>
        <span className="text-base font-bold leading-tight text-ink">
          המערכת של אילנית
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3 py-2" aria-label="ניווט ראשי">
        {NAV_ITEMS.map((item) => {
          const active = isActivePath(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-150',
                active
                  ? 'bg-primary-50 text-primary-600 before:absolute before:inset-y-1.5 before:start-0 before:w-1 before:rounded-full before:bg-primary'
                  : 'text-muted hover:bg-primary-50 hover:text-ink',
              )}
            >
              <Icon className="size-5 shrink-0" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Sign-out — separated */}
      <div className="border-t border-line px-3 py-3">
        <form action={signOutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted transition-colors duration-150 hover:bg-danger-soft hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <LogOut className="size-5 shrink-0" aria-hidden="true" />
            התנתקות
          </button>
        </form>
      </div>
    </div>
  );
}
