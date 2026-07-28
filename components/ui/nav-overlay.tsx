'use client';

import * as React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { X, LogOut, ArrowLeft } from 'lucide-react';
import OptionWheel from './option-wheel';
import { NAV_ITEMS, isActivePath } from './nav-items';
import { signOutAction } from './shell-actions';
import { Brand } from './brand';
import { cn } from '@/lib/utils';

interface NavOverlayProps {
  open: boolean;
  onClose: () => void;
  /** Element focus returns to when the overlay closes. */
  returnFocusTo?: React.RefObject<HTMLElement | null>;
}

/*
  NavOverlay — the app's primary navigation at every breakpoint (v4 replaced the
  sidebar with this). A full-screen blush-glass scrim over the live aurora, with
  a curved OptionWheel on the inline-end side and a preview panel opposite it.

  Highlight vs. navigate: the wheel's `onChange` fires on every scroll tick, so
  it only updates the preview. Navigation happens on an explicit commit — tapping
  the centered option, pressing Enter, or the "מעבר" button.

  Accessibility: the wheel is a drag/scroll affordance, so the overlay ALSO
  renders a visually-hidden linear <nav> of the same links. Keyboard and screen
  reader users therefore never depend on the wheel. Esc closes; focus is trapped
  while open and returned to the trigger on close.
*/
export function NavOverlay({ open, onClose, returnFocusTo }: NavOverlayProps) {
  const router = useRouter();
  const pathname = usePathname();
  const panelRef = React.useRef<HTMLDivElement>(null);

  const activeIndex = Math.max(
    0,
    NAV_ITEMS.findIndex((item) => isActivePath(pathname, item.href)),
  );
  const [highlight, setHighlight] = React.useState(activeIndex);

  // Re-centre on the current route each time the overlay opens.
  React.useEffect(() => {
    if (open) setHighlight(activeIndex);
  }, [open, activeIndex]);

  const go = React.useCallback(
    (index: number) => {
      const item = NAV_ITEMS[index];
      if (!item) return;
      onClose();
      router.push(item.href);
    },
    [onClose, router],
  );

  // Esc to close, focus trap, scroll lock, focus return.
  React.useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    // Give the wheel focus so arrow keys drive it immediately.
    const raf = requestAnimationFrame(() => {
      panelRef.current
        ?.querySelector<HTMLElement>('[role="listbox"]')
        ?.focus();
    });

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      cancelAnimationFrame(raf);
      document.body.style.overflow = overflow;
      (returnFocusTo?.current ?? previouslyFocused)?.focus?.();
    };
  }, [open, onClose, returnFocusTo]);

  if (!open) return null;

  const previewed = NAV_ITEMS[highlight] ?? NAV_ITEMS[0];
  const PreviewIcon = previewed.icon;

  return (
    <div
      className="fixed inset-0 z-50 animate-fade-in bg-cream/70 backdrop-blur-2xl"
      role="dialog"
      aria-modal="true"
      aria-label="תפריט ניווט"
    >
      <div ref={panelRef} className="relative flex h-full flex-col">
        {/* Header — brand + close */}
        <div className="flex shrink-0 items-center justify-between px-5 py-5 sm:px-8">
          <Brand size="sm" />
          <button
            type="button"
            onClick={onClose}
            aria-label="סגור תפריט"
            className="flex size-11 items-center justify-center rounded-full border border-line bg-white/80 text-ink shadow-soft transition hover:bg-primary-50 hover:shadow-card"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        {/* Body — preview panel (lg+) beside the wheel */}
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_minmax(0,520px)]">
          {/* Preview — inline-start on desktop. Hidden on mobile, where the
              wheel itself is the whole experience. */}
          <div className="hidden items-center px-12 lg:flex">
            <div key={previewed.href} className="animate-fade-in max-w-sm">
              <span className="mb-6 flex size-16 items-center justify-center rounded-3xl bg-primary text-ink shadow-glow">
                <PreviewIcon className="size-8" aria-hidden="true" />
              </span>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary-700">
                מעבר אל
              </p>
              <h2 className="text-4xl font-extrabold tracking-tight text-ink">
                {previewed.label}
              </h2>
              {previewed.description && (
                <p className="mt-3 text-base leading-relaxed text-muted">
                  {previewed.description}
                </p>
              )}
              <button
                type="button"
                onClick={() => go(highlight)}
                className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-sm font-semibold text-white shadow-card transition hover:-translate-y-px hover:shadow-pop"
              >
                מעבר
                <ArrowLeft className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* The wheel */}
          <div className="relative min-h-0 flex-1">
            <OptionWheel
              items={NAV_ITEMS.map((item) => item.label)}
              defaultSelected={activeIndex}
              onChange={(index) => setHighlight(index)}
              onCommit={(index) => go(index)}
              side="right"
              textColor="#6b6c74"
              activeColor="#2e2f34"
              fontSize={2.1}
              spacing={1.5}
              curve={1}
              tilt={7}
              blur={1.6}
              fade={0.26}
              minOpacity={0.12}
              smoothing={180}
              inset={32}
              loop={false}
              draggable
              ariaLabel="ניווט ראשי"
              className="lg:[--ow-font-size:3rem]"
            />
          </div>
        </div>

        {/* Mobile hint + sign out */}
        <div className="shrink-0 space-y-4 px-5 pb-8 pt-4 sm:px-8">
          <p className="text-center text-xs text-muted lg:hidden">
            גוללים או גוררים · הקשה על הפריט המסומן פותחת אותו
          </p>
          <form action={signOutAction} className="flex justify-center">
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-full border border-line bg-white/70 px-5 py-2.5 text-sm font-medium text-muted shadow-soft transition hover:bg-danger-soft hover:text-danger"
            >
              <LogOut className="size-4" aria-hidden="true" />
              התנתקות
            </button>
          </form>
        </div>

        {/*
          Linear, always-focusable fallback. The wheel is a pointer/scroll
          affordance; this guarantees every destination is reachable by keyboard
          and announced in order by a screen reader.
        */}
        <nav className="sr-only-list" aria-label="ניווט ראשי (רשימה)">
          <ul>
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onClose}
                  aria-current={
                    isActivePath(pathname, item.href) ? 'page' : undefined
                  }
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}

interface NavTriggerProps {
  onClick: () => void;
  expanded: boolean;
  className?: string;
}

/** The pill button that opens {@link NavOverlay}. Visible at all breakpoints. */
export const NavTrigger = React.forwardRef<HTMLButtonElement, NavTriggerProps>(
  ({ onClick, expanded, className }, ref) => (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      aria-haspopup="dialog"
      className={cn(
        'inline-flex h-11 items-center gap-2.5 rounded-full border border-line bg-white/75 px-4 text-sm font-semibold text-ink shadow-soft backdrop-blur transition hover:-translate-y-px hover:bg-white hover:shadow-card',
        className,
      )}
    >
      <span aria-hidden="true" className="flex flex-col gap-[3px]">
        <span className="block h-[2px] w-4 rounded-full bg-ink" />
        <span className="block h-[2px] w-4 rounded-full bg-primary-600" />
        <span className="block h-[2px] w-2.5 rounded-full bg-ink" />
      </span>
      תפריט
    </button>
  ),
);
NavTrigger.displayName = 'NavTrigger';
