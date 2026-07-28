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
  /** Optional headline rendered above the value prop on desktop (defaults to the value prop alone). */
  headline?: string;
  /** Optional list of short selling points rendered as a checklist on desktop. */
  highlights?: string[];
  /** Optional richer highlights with their own lucide icon (overrides `highlights`). */
  features?: { icon: React.ComponentType<{ className?: string }>; label: string }[];
  /** Constrains the action card width. */
  cardClassName?: string;
  /**
   * `wide` gives the action surface a roomier card (max-w-xl) and a slightly
   * wider column — used by /book/[token] for its slot grid. When `bare` is set
   * the children render WITHOUT the default card chrome (they bring their own
   * Card), still centered on the soft gradient.
   */
  wide?: boolean;
  /** Render children without the built-in card shell (the child supplies its own Card). */
  bare?: boolean;
}

const DEFAULT_VALUE_PROP =
  'ניהול השיעורים, התיאומים והתשלומים — במקום אחד.';

/**
 * Full-screen RTL split shell for every STANDALONE route (/login, /book,
 * /book/[token], /a, /m, /p). One side is the `.brand-panel` — an ink base with
 * a low-opacity blush gradient — carrying the wordmark, value prop and soft
 * decorative blobs; the other is an elevated action card. On mobile it collapses
 * to a brand header band above the card, never a lonely card in a void.
 *
 * Contrast: v4 made this structurally safe rather than carefully tuned. The
 * panel's base is ink (#2e2f34), where white measures 13.4:1, and the blush
 * gradient sits on top at 24%. Even under a 45% pink blob the white copy stays
 * at ~5.5:1, so no scrim machinery is needed — v3 carried a directional scrim
 * purely to rescue a mid-tone gradient, and it is gone.
 *
 * In RTL the brand panel sits on the inline-start (visual right is content);
 * the grid order places brand first so it lands on the right under `dir=rtl`.
 */
export function AuthLayout({
  children,
  eyebrow,
  valueProp = DEFAULT_VALUE_PROP,
  headline,
  highlights,
  features,
  cardClassName,
  wide = false,
  bare = false,
}: AuthLayoutProps) {
  const list =
    features ??
    (highlights ?? []).map((label) => ({ icon: CheckIcon, label }));

  return (
    <div
      className={cn(
        'grid min-h-[100dvh] grid-rows-[auto_1fr] overflow-x-hidden lg:grid-rows-1',
        wide
          ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]'
          : 'lg:grid-cols-2',
      )}
    >
      {/* ── Brand panel (desktop: full column; mobile: header band) ── */}
      <section className="brand-panel relative flex flex-col justify-center overflow-hidden px-6 py-10 text-white texture-dots lg:px-14 lg:py-16">
        {/* Decorative blobs — pinned to the corners away from the text band.
            Safe over the ink base: even at full blob opacity white stays ≥5.5:1. */}
        <span
          aria-hidden="true"
          className="blob -top-24 -end-20 size-72 bg-accent"
        />
        <span
          aria-hidden="true"
          className="blob -bottom-32 -start-16 size-[22rem] bg-primary"
        />

        <div className="relative z-10 mx-auto w-full max-w-md lg:mx-0">
          <Brand size="lg" onDark className="lg:mb-10" />

          {/* Desktop value prop — over the AA-safe scrim. */}
          <div className="mt-6 hidden lg:block">
            {eyebrow && (
              <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-white ring-1 ring-white/25 backdrop-blur-sm">
                {eyebrow}
              </p>
            )}
            {headline ? (
              <h1 className="mt-4 text-3xl font-bold leading-snug text-white text-balance">
                {headline}
              </h1>
            ) : null}
            <p
              className={cn(
                'text-white text-balance',
                headline
                  ? 'mt-3 text-lg leading-relaxed text-white/95'
                  : 'mt-4 text-2xl font-bold leading-snug',
              )}
            >
              {valueProp}
            </p>

            {list.length > 0 && (
              <ul className="stagger mt-9 space-y-3.5">
                {list.map(({ icon: Icon, label }, i) => (
                  <li
                    key={label}
                    style={{ ['--i' as string]: i + 2 } as React.CSSProperties}
                    className="flex items-center gap-3 text-white"
                  >
                    <span
                      aria-hidden="true"
                      className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/30 backdrop-blur-sm"
                    >
                      <Icon className="size-[1.05rem] text-white" />
                    </span>
                    <span className="text-base leading-snug">{label}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Mobile-only condensed value prop */}
          {valueProp && (
            <p className="mt-3 text-base font-medium text-white lg:hidden">
              {valueProp}
            </p>
          )}
        </div>
      </section>

      {/* ── Action surface — transparent so the live aurora shows through ── */}
      <section className="flex items-start justify-center px-4 py-8 sm:items-center sm:px-6 sm:py-12">
        {bare ? (
          <div
            className={cn(
              'w-full animate-fade-in',
              wide ? 'max-w-xl' : 'max-w-md',
              cardClassName,
            )}
          >
            {children}
          </div>
        ) : (
          <div
            className={cn(
              'glass w-full rounded-3xl p-6 shadow-pop sm:p-8',
              'animate-fade-in',
              wide ? 'max-w-xl' : 'max-w-md',
              cardClassName,
            )}
          >
            {children}
          </div>
        )}
      </section>
    </div>
  );
}

// Inline check glyph used as the default highlight bullet (no extra icon import).
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
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
