import type { Config } from 'tailwindcss';

// Ilanit design system v4 — "Blush Aurora".
// Palette = blush pink / light pink / peach on ink, over a live WebGL aurora.
// Every color is exposed BOTH as a Tailwind color AND backed by a CSS var
// (--color-*) defined in globals.css, so the theme retints in one place.
//
// THE ONE RULE: `ink` is the only text color; pink/peach are backgrounds only.
// `primary-fg` (text ON primary) is therefore DARK — white on pink is 2.15:1.
// Spec: docs/superpowers/specs/2026-07-28-blush-aurora-design.md
const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-heebo)', 'system-ui', 'sans-serif'],
        heebo: ['var(--font-heebo)', 'system-ui', 'sans-serif'],
      },
      colors: {
        // ── Surfaces & text ──
        cream: 'var(--color-cream)',
        surface: {
          DEFAULT: 'var(--color-surface)',
          2: 'var(--color-surface-2)',
        },
        'surface-2': 'var(--color-surface-2)',
        ink: 'var(--color-ink)',
        muted: 'var(--color-muted)',
        line: 'var(--color-line)',

        // ── Primary (blush pink) ──
        primary: {
          DEFAULT: 'var(--color-primary)',
          50: 'var(--color-primary-50)',
          100: 'var(--color-primary-100)',
          200: 'var(--color-primary-200)',
          300: 'var(--color-primary-300)',
          500: 'var(--color-primary)',
          600: 'var(--color-primary-600)',
          700: 'var(--color-primary-700)', // pink TEXT token (4.9:1 on white)
          fg: 'var(--color-primary-fg)', // DARK — text placed ON primary
          soft: 'var(--color-primary-soft)',
        },
        'primary-600': 'var(--color-primary-600)',
        'primary-700': 'var(--color-primary-700)',

        // ── Accent (peach) ──
        accent: {
          DEFAULT: 'var(--color-accent)',
          500: 'var(--color-accent)',
          600: 'var(--color-accent-600)',
          text: 'var(--color-accent-text)',
          soft: 'var(--color-accent-soft)',
        },

        // ── Semantic ──
        success: {
          DEFAULT: 'var(--color-success)',
          soft: 'var(--color-success-soft)',
        },
        warning: {
          DEFAULT: 'var(--color-warning)',
          soft: 'var(--color-warning-soft)',
        },
        danger: {
          DEFAULT: 'var(--color-danger)',
          soft: 'var(--color-danger-soft)',
        },
        // Alias kept so any `destructive` references resolve cleanly.
        destructive: {
          DEFAULT: 'var(--color-danger)',
          soft: 'var(--color-danger-soft)',
        },

        // ── Legacy brand alias (back-compat for any not-yet-restyled markup) ──
        brand: {
          DEFAULT: 'var(--color-primary)',
          dark: 'var(--color-primary-600)',
          light: 'var(--color-primary-50)',
        },
      },
      borderColor: {
        DEFAULT: 'var(--color-line)',
      },
      // v4 radius scale — softer and rounder than v3 across the board.
      borderRadius: {
        sm: '10px',
        md: '14px',
        lg: '18px',
        xl: '22px',
        '2xl': '28px',
        '3xl': '32px',
        full: '9999px',
      },
      boxShadow: {
        // Elevation is tinted PINK (--shadow-tint), never gray — a gray shadow
        // over the blush aurora reads muddy.
        soft: '0 1px 2px rgba(var(--shadow-tint),0.05), 0 2px 10px rgba(var(--shadow-tint),0.08)',
        card: '0 8px 30px -12px rgba(var(--shadow-tint),0.22), 0 2px 8px -4px rgba(var(--shadow-tint),0.10)',
        pop: '0 28px 64px -18px rgba(var(--shadow-tint),0.34)',
        // Pink halo for primary buttons — replaces a drop shadow with light.
        glow: '0 8px 24px -6px rgba(244,147,190,0.55)',
        'glow-lg': '0 16px 40px -10px rgba(244,147,190,0.6)',
        // Inner top highlight for glass surfaces (edge refraction).
        edge: 'inset 0 1px 0 rgba(255,255,255,0.75)',
      },
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1.6' }], // 12
        sm: ['0.875rem', { lineHeight: '1.6' }], // 14
        base: ['1rem', { lineHeight: '1.65' }], // 16
        lg: ['1.125rem', { lineHeight: '1.55' }], // 18
        xl: ['1.25rem', { lineHeight: '1.45' }], // 20
        '2xl': ['1.5rem', { lineHeight: '1.35' }], // 24
        '3xl': ['1.875rem', { lineHeight: '1.25' }], // 30
        '4xl': ['2.25rem', { lineHeight: '1.15' }], // 36
        '5xl': ['3rem', { lineHeight: '1.05' }], // 48
      },
      spacing: {
        // Button height that still clears the 44px touch minimum at `lg`.
        13: '3.25rem',
      },
      ringColor: {
        DEFAULT: 'var(--color-ring)',
      },
      backdropBlur: {
        xs: '2px',
      },
      transitionDuration: {
        DEFAULT: '200ms',
      },
      transitionTimingFunction: {
        DEFAULT: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      backgroundImage: {
        'gradient-warm':
          'linear-gradient(135deg, var(--grad-warm-1) 0%, var(--grad-warm-2) 55%, var(--grad-warm-3) 100%)',
        'gradient-soft':
          'linear-gradient(160deg, var(--grad-soft-1) 0%, var(--grad-soft-2) 100%)',
        'gradient-tint':
          'linear-gradient(160deg, var(--color-surface-2) 0%, var(--color-surface) 70%)',
      },
      keyframes: {
        shimmer: {
          '100%': { transform: 'translateX(-100%)' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.4s ease-in-out infinite',
        'fade-in': 'fade-in 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in': 'scale-in 200ms cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [
    // Tabular figures util for prices / times / counts.
    function tabularNums({ addUtilities }: { addUtilities: (u: Record<string, Record<string, string>>) => void }) {
      addUtilities({
        '.tabular-nums': {
          'font-variant-numeric': 'tabular-nums',
          'font-feature-settings': '"tnum"',
        },
      });
    },
  ],
};

export default config;
