import * as React from 'react';
import { Brand } from './brand';
import { cn } from '@/lib/utils';

export interface AuthLayoutProps {
  /** The action surface (form / single-action card body). */
  children: React.ReactNode;
  /** Eyebrow above the value prop on the brand panel (e.g. "ברוכים הבאים"). */
  eyebrow?: string;
  /** One-line value prop shown under the wordmark on the brand panel. */
  valueProp?: string;
  /** Optional list of short selling points rendered as a checklist on desktop. */
  highlights?: string[];
  /** Constrains the action card width. */
  cardClassName?: string;
}

const DEFAULT_VALUE_PROP =
  'ניהול השיעורים, התיאומים והתשלומים — במקום אחד.';

/**
 * Full-screen RTL split shell for every STANDALONE route (/login, /book,
 * /book/[token], /a, /m, /p). One side is a `bg-gradient-warm` brand panel with
 * the wordmark + value prop + soft decorative blobs; the other is an elevated
 * action card on `bg-gradient-soft`. On mobile it collapses to a gradient header
 * band (brand) above the card — never a lonely card in an empty void.
 *
 * In RTL the brand panel sits on the inline-start (visual right is content);
 * the grid order places brand first so it lands on the right under `dir=rtl`.
 */
export function AuthLayout({
  children,
  eyebrow,
  valueProp = DEFAULT_VALUE_PROP,
  highlights,
  cardClassName,
}: AuthLayoutProps) {
  return (
    <div className="grid min-h-[100dvh] grid-rows-[auto_1fr] lg:grid-cols-2 lg:grid-rows-1">
      {/* ── Brand panel (desktop: full column; mobile: header band) ── */}
      <section className="relative isolate flex flex-col justify-center overflow-hidden bg-gradient-warm px-6 py-10 text-white texture-dots lg:px-14 lg:py-16">
        {/* Decorative blobs */}
        <span
          aria-hidden="true"
          className="blob -top-24 -end-16 size-72 bg-[var(--grad-warm-3)]"
        />
        <span
          aria-hidden="true"
          className="blob -bottom-28 -start-10 size-80 bg-[var(--grad-warm-1)]"
        />

        <div className="relative z-10 mx-auto w-full max-w-md lg:mx-0">
          <Brand size="lg" onDark className="lg:mb-10" />

          {/* Value prop — hidden on mobile to keep the header band compact,
              shown in full on desktop. */}
          <div className="mt-6 hidden lg:block">
            {eyebrow && (
              <p className="text-sm font-medium uppercase tracking-wide text-white/75">
                {eyebrow}
              </p>
            )}
            <p className="mt-2 text-2xl font-bold leading-snug text-white text-balance">
              {valueProp}
            </p>

            {highlights && highlights.length > 0 && (
              <ul className="mt-8 space-y-3">
                {highlights.map((h) => (
                  <li key={h} className="flex items-center gap-3 text-white/90">
                    <span
                      aria-hidden="true"
                      className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/25"
                    >
                      <CheckGlyph />
                    </span>
                    <span className="text-base">{h}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Mobile-only condensed value prop */}
          {valueProp && (
            <p className="mt-3 text-base font-medium text-white/90 lg:hidden">
              {valueProp}
            </p>
          )}
        </div>
      </section>

      {/* ── Action surface ── */}
      <section className="flex items-start justify-center bg-gradient-soft px-4 py-8 sm:items-center sm:px-6 sm:py-12">
        <div
          className={cn(
            'w-full max-w-md rounded-3xl border border-line bg-surface p-6 shadow-pop sm:p-8',
            'animate-fade-in',
            cardClassName,
          )}
        >
          {children}
        </div>
      </section>
    </div>
  );
}

// Small inline check glyph (no extra icon import; lucide Check used inline).
function CheckGlyph() {
  return (
    <svg
      className="size-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
