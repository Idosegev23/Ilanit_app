'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

// Lightweight accessible modal used by the lessons screen to host the
// create-lesson forms. No Dialog primitive ships in @/components/ui yet, so
// this is built from the design tokens directly: cream/ink scrim, white
// surface card (rounded-2xl + shadow-pop), focus trap, Escape-to-close, scroll
// lock, and a fade/scale on transform+opacity only (the global
// prefers-reduced-motion rule collapses the transition duration to ~0).
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
      {/* Scrim */}
      <div
        className={cn(
          'fixed inset-0 bg-ink/40 transition-opacity duration-200 ease-out',
          visible ? 'opacity-100' : 'opacity-0',
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
        className={cn(
          'relative z-10 w-full max-w-lg rounded-2xl border border-line bg-surface shadow-pop',
          'transition-[transform,opacity] duration-200 ease-out',
          visible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-2 scale-[0.98] opacity-0',
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line p-6 pb-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-ink">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1 text-sm text-muted">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגור"
            className="flex size-9 shrink-0 items-center justify-center rounded-xl text-muted transition-colors duration-200 ease-out hover:bg-primary-50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="p-6 pt-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
