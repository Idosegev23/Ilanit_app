import type { Config } from 'tailwindcss';

// Ilanit design system — "Warm & Personal" (Soft UI Evolution).
// Palette = terracotta / peach / cream. Every color is exposed BOTH as a
// Tailwind color AND backed by a CSS var (--color-*) defined in globals.css,
// so the theme can be retinted in one place.
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
        surface: 'var(--color-surface)',
        ink: 'var(--color-ink)',
        muted: 'var(--color-muted)',
        line: 'var(--color-line)',

        // ── Primary (terracotta) ──
        primary: {
          DEFAULT: 'var(--color-primary)',
          50: 'var(--color-primary-50)',
          100: 'var(--color-primary-100)',
          200: 'var(--color-primary-200)',
          300: 'var(--color-primary-300)',
          500: 'var(--color-primary)',
          600: 'var(--color-primary-600)',
          fg: 'var(--color-primary-fg)',
          soft: 'var(--color-primary-soft)',
        },
        'primary-600': 'var(--color-primary-600)',

        // ── Accent (honey) ──
        accent: {
          DEFAULT: 'var(--color-accent)',
          500: 'var(--color-accent)',
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
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '20px',
        '2xl': '24px',
        full: '9999px',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(46,37,33,0.05), 0 2px 8px rgba(46,37,33,0.06)',
        card: '0 4px 16px rgba(46,37,33,0.07)',
        pop: '0 12px 32px rgba(46,37,33,0.12)',
      },
      fontSize: {
        // Warm type scale (px → rem). base = 16.
        xs: ['0.75rem', { lineHeight: '1.6' }], // 12
        sm: ['0.875rem', { lineHeight: '1.6' }], // 14
        base: ['1rem', { lineHeight: '1.6' }], // 16
        lg: ['1.125rem', { lineHeight: '1.55' }], // 18
        xl: ['1.25rem', { lineHeight: '1.5' }], // 20
        '2xl': ['1.5rem', { lineHeight: '1.4' }], // 24
        '3xl': ['1.875rem', { lineHeight: '1.3' }], // 30
        '4xl': ['2.25rem', { lineHeight: '1.2' }], // 36
      },
      ringColor: {
        DEFAULT: 'var(--color-ring)',
      },
      transitionDuration: {
        DEFAULT: '200ms',
      },
      transitionTimingFunction: {
        DEFAULT: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        shimmer: {
          '100%': { transform: 'translateX(-100%)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.4s ease-in-out infinite',
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
