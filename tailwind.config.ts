import type { Config } from 'tailwindcss';

// Ilanit design system v3 — "Calm Sage & Sand" (restful Soft UI).
// Palette = sage-teal / sand / cream. Every color is exposed BOTH as a
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
        surface: {
          DEFAULT: 'var(--color-surface)',
          2: 'var(--color-surface-2)',
        },
        'surface-2': 'var(--color-surface-2)',
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

        // ── Accent (honey / amber) ──
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
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '20px',
        '2xl': '24px',
        '3xl': '28px',
        full: '9999px',
      },
      boxShadow: {
        // Cool-neutral, airy elevation scale (v3). Tinted to the sage-teal ink
        // (--shadow-tint) so shadows read as part of the palette, not muddy gray.
        soft: '0 1px 2px rgba(var(--shadow-tint),0.04), 0 2px 8px rgba(var(--shadow-tint),0.06)',
        card: '0 6px 24px -10px rgba(var(--shadow-tint),0.16), 0 2px 6px -3px rgba(var(--shadow-tint),0.08)',
        pop: '0 24px 56px -16px rgba(var(--shadow-tint),0.26)',
        // Inner top highlight for "lifted glass" surfaces (subtle edge refraction).
        edge: 'inset 0 1px 0 rgba(255,255,255,0.6)',
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
      },
      animation: {
        shimmer: 'shimmer 1.4s ease-in-out infinite',
        'fade-in': 'fade-in 220ms cubic-bezier(0.16, 1, 0.3, 1)',
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
