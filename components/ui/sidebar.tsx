'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { NAV_GROUPS, isActivePath } from './nav-items';
import { signOutAction } from './shell-actions';
import { Brand } from './brand';
import { cn } from '@/lib/utils';

interface SidebarProps {
  /** Called after a nav link is clicked — used to close the mobile drawer. */
  onNavigate?: () => void;
  className?: string;
}

// Right-side navigation (RTL): branded header, grouped nav with subtle section
// labels + active pill (primary-soft bg, primary text, inline-start accent bar),
// and a visually separated sign-out footer. Surface is a soft tint gradient so
// it reads as a crafted panel, not a flat empty rail.
export function Sidebar({ onNavigate, className }: SidebarProps) {
  const pathname = usePathname();

  return (
    <div
      className={cn(
        'flex h-full flex-col bg-gradient-tint',
        className,
      )}
    >
      {/* Brand */}
      <div className="px-5 py-6">
        <Brand size="sm" />
      </div>

      {/* Grouped nav */}
      <nav className="flex-1 overflow-y-auto px-3 pb-2" aria-label="ניווט ראשי">
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.label ?? gi} className={cn(gi > 0 && 'mt-6')}>
            {group.label && (
              <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-muted/80">
                {group.label}
              </p>
            )}
            <div className="space-y-1">
              {group.items.map((item) => {
                const active = isActivePath(pathname, item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150',
                      active
                        ? 'bg-primary-soft text-primary-600 shadow-soft before:absolute before:inset-y-1.5 before:start-0 before:w-1 before:rounded-full before:bg-primary'
                        : 'text-muted hover:bg-white/60 hover:text-ink',
                    )}
                  >
                    <Icon
                      className={cn(
                        'size-5 shrink-0',
                        active ? 'text-primary' : 'text-muted',
                      )}
                      aria-hidden="true"
                    />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Sign-out — separated footer */}
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
