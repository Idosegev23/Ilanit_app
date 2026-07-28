'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { X, CalendarPlus } from 'lucide-react';
import { cn } from '@/lib/utils';

// Lightweight accessible modal used by the lessons screen to host the
// create-lesson forms. No Dialog primitive ships in @/components/ui yet, so
// this is built from the v4 "Blush Aurora" tokens directly: an ink scrim with a
// light backdrop blur so the aurora still reads behind it, a rounded-3xl glass
// panel (white/85 + blur + pink-tinted shadow-pop), focus trap, Escape-to-close,
// scroll lock, and a scale-in entrance.
//
// Two contrast notes:
//  • The scrim is `bg-ink` + `opacity-40` rather than `bg-ink/40`. Tailwind
//    cannot apply an alpha modifier to a color whose value is a bare CSS var,
//    so `bg-ink/40` compiles to nothing and the scrim would vanish.
//  • The decorative blob uses the shared `.blob` utility, which sits at z-0 —
//    the header's real content therefore carries `relative z-10`.
interface LessonDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}

export function LessonDialog({
  open,
  onClose,
  title,
  description,
  children,
}: LessonDialogProps) {
  const titleId = React.useId();
  const descId = React.useId();
  const panelRef = React.useRef<HTMLDivElement>(null);
  // `visible` drives the enter transition; toggled on the next frame after mount
  // so the browser registers the from→to transform/opacity change.
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setVisible(false);
      return;
    }
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Lock body scroll while open.
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Escape to close + simple focus containment within the panel.
  React.useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose]);

  // Move focus into the panel when it opens.
  React.useEffect(() => {
    if (open && panelRef.current) {
      const target = panelRef.current.querySelector<HTMLElement>(
        'input, select, textarea, button',
      );
      target?.focus();
    }
  }, [open]);

  if (typeof document === 'undefined' || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center"
      role="presentation"
    >
      {/* Scrim — ink + opacity (see note above) with a soft blur so the aurora
          stays legible behind the panel instead of turning to mud. */}
      <div
        className={cn(
          'fixed inset-0 bg-ink backdrop-blur-sm transition-opacity duration-200 ease-out',
          visible ? 'opacity-40' : 'opacity-0',
        )}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className="relative z-10 w-full max-w-lg animate-scale-in overflow-hidden rounded-3xl border border-white/60 bg-white/85 shadow-pop backdrop-blur-2xl"
      >
        <div className="relative isolate flex items-start justify-between gap-3 overflow-hidden border-b border-line bg-gradient-tint p-5 pb-4 sm:p-6 sm:pb-5">
          {/* Soft decorative blob for depth. `.blob` is z-0, so everything
              below it is explicitly lifted to z-10. */}
          <span aria-hidden="true" className="blob -top-16 -start-12 size-40 bg-primary-200" />
          <div className="relative z-10 flex min-w-0 items-start gap-3">
            <span
              className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-warm text-primary-fg shadow-glow"
              aria-hidden="true"
            >
              <CalendarPlus className="size-5" />
            </span>
            <div className="min-w-0 pt-0.5">
              <h2 id={titleId} className="text-lg font-extrabold tracking-tight text-ink">
                {title}
              </h2>
              {description && (
                <p id={descId} className="mt-0.5 text-sm text-muted">
                  {description}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגור"
            className="relative z-10 flex size-11 shrink-0 items-center justify-center rounded-full border border-white/60 bg-white/70 text-muted shadow-soft backdrop-blur transition-[background-color,color] duration-200 ease-out hover:bg-white hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="p-5 sm:p-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
