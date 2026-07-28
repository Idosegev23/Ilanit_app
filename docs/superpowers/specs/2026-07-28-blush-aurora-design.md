# Ilanit v4 — "Blush Aurora" design spec

**Date:** 2026-07-28
**Supersedes:** design system v3 "Calm Sage & Sand" (`docs/superpowers/plans/2026-06-03-ilanit-design-v2.md`)
**Scope:** full visual redesign of all 76 `.tsx` files + token layer. No behavioural / data / server-action changes.

---

## 0. Contract for implementers

This spec is the **single source of truth** for the redesign. Rules that are non-negotiable:

1. **Never change behaviour.** No edits to server actions, `lib/**`, API routes, DB, or tests. Redesign is presentation-only. If a page's markup must be restructured, the same props/data/handlers must remain wired.
2. **Only tokens, never raw hex, in components.** Every color comes from a Tailwind token backed by a CSS var. If you need a color that has no token, add the token to `globals.css` + `tailwind.config.ts` — do not inline a hex.
3. **`#2E2F34` (`text-ink`) is the only text color** other than white-on-ink and the three semantic text tokens. See §1.
4. **RTL first.** Use logical properties (`ps-`/`pe-`, `ms-`/`me-`, `start-`/`end-`) — never `pl-`/`pr-`/`left-`/`right-`.
5. **Mobile first.** Design the small screen, then add `sm:`/`lg:`. Every interactive target ≥ 44×44px.
6. **Hebrew copy is unchanged.** Do not reword any existing UI string.

---

## 1. Color system

### 1.1 Source palette (locked by the user)

| Hex | Role |
|---|---|
| `#F493BE` | primary pink — fills, glows |
| `#F9C5DC` | light pink — tints, soft surfaces |
| `#FAD5BB` | peach — accent surfaces, warm counterpoint |
| `#2E2F34` | ink — **all text**, high-emphasis fills |
| `#FFFFFF` | surface — cards, glass base |

### 1.2 The one rule

**`#2E2F34` is the only text color; the three warm hues are backgrounds only.**
Verified contrast of `#2E2F34` on each background:

| Background | Ratio | Level |
|---|---|---|
| `#FFFFFF` | 13.4:1 | AAA |
| `#FAD5BB` | 9.7:1 | AAA |
| `#F9C5DC` | 8.9:1 | AAA |
| `#F493BE` | 6.2:1 | AA (AAA large) |

**Forbidden:** white text on `#F493BE` (2.15:1), on `#F9C5DC`, or on `#FAD5BB`. White text is valid **only** on `#2E2F34` and on the semantic solid colors.

### 1.3 Full token set — write these into `app/globals.css`

> **Storage format — corrected during implementation.** Tokens are stored as
> space-separated **RGB triples** (`--color-ink-rgb: 46 47 52`) with the
> ready-to-use form derived from them (`--color-ink: rgb(var(--color-ink-rgb))`),
> and `tailwind.config.ts` consumes
> `rgb(var(--color-x-rgb) / <alpha-value>)`.
>
> The hex form below is the palette of record, not the storage format. Tailwind 3
> can only apply an opacity modifier to a color it can parse or interpolate;
> given a bare `var(--color-x)` it drops the modifier **and the whole utility**,
> so `bg-ink/40` compiles to nothing, silently. Verified by compiling a probe
> against the real config. Do not revert to bare `var()` colors.

```css
:root {
  /* ── Surfaces & text ── */
  --color-cream:      #fff9fb;  /* page base — rose-milk, aurora paints on this */
  --color-surface:    #ffffff;  /* solid cards */
  --color-surface-2:  #fdeff5;  /* tinted second surface */
  --color-ink:        #2e2f34;  /* 13.4:1 on white — ONLY text color */
  --color-muted:      #6b6c74;  /* secondary text — 5.2:1 on white */
  --color-line:       #f2dce6;  /* rosy hairline — decorative only */

  /* ── Primary — blush pink ── */
  --color-primary:     #f493be;  /* 500 — fills; ink text on it = 6.2:1 */
  --color-primary-50:  #fef3f8;
  --color-primary-100: #fde7f1;
  --color-primary-200: #f9c5dc;  /* = palette light pink */
  --color-primary-300: #f6aacb;
  --color-primary-600: #e06b9f;  /* hover fill */
  --color-primary-700: #b84a7b;  /* pink TEXT token — 4.9:1 on white */
  --color-primary-fg:  #2e2f34;  /* text ON primary — DARK, not white */
  --color-primary-soft:#fdeff5;

  /* ── Accent — peach ── */
  --color-accent:      #fad5bb;  /* surface only */
  --color-accent-600:  #f3bd97;
  --color-accent-text: #96591f;  /* 5.6:1 on white */
  --color-accent-soft: #fdf0e6;

  /* ── Semantic — deep, warm-family, AA as text ── */
  --color-success:      #2e7d5b;  /* 5.0:1 on white */
  --color-success-soft: #e4f1ea;
  --color-warning:      #96591f;  /* 5.6:1 on white */
  --color-warning-soft: #faebda;
  --color-danger:       #c0325b;  /* 5.5:1 on white */
  --color-danger-soft:  #fbe4ea;

  /* ── Focus ring — ink, NOT pink ── */
  --color-ring: #2e2f34;

  /* ── Shadow tint — PINK, never gray ── */
  --shadow-tint: 216,110,158;

  /* ── Aurora ── */
  --aurora-1: #fad5bb;
  --aurora-2: #f493be;
}
```

**Why the ring is ink, not pink:** WCAG 2.2 (2.4.11/1.4.11) requires a focus indicator ≥ 3:1 against adjacent colors. `#F493BE` on white is 2.15:1 — it fails. `#2E2F34` gives 13.4:1. The ring recipe stays the existing two-layer one (white spacer + ink ring).

**Why `--color-primary-fg` is dark:** this token is the text color placed on `--color-primary`. Every existing component already consumes it, so flipping it to `#2e2f34` fixes contrast across the whole app in one line.

### 1.4 Back-compat

Every token **name** from v3 is preserved. Retired v3-only names (`--grad-warm-*`, `--brand-panel-ink*`, `--grad-cta-*`) keep existing as aliases retinted to the new palette so no markup breaks mid-migration. `brand.*` and `destructive.*` Tailwind aliases stay.

---

## 2. Aurora background

### 2.1 Files

- `components/ui/soft-aurora.tsx` — the React Bits `SoftAurora` component, adapted (see §2.3).
- `components/ui/soft-aurora.css` — component CSS.
- `components/ui/aurora-background.tsx` — the app-level wrapper that decides live-vs-static.

Dependency: `ogl` (add to `package.json`).

### 2.2 Placement & blending

Mounted **once** in `app/layout.tsx`, outside `AppShell`, so route changes never remount it.

```tsx
<body className="min-h-screen bg-cream text-ink antialiased">
  <AuroraBackground />                    {/* fixed inset-0 z-0 */}
  <div className="relative z-10">         {/* ALL content */}
    <AppShell>{children}</AppShell>
  </div>
</body>
```

**Critical stacking gotcha:** a canvas at `z-index: -1` inside `<body>` paints *behind* `body`'s background-color and disappears. Hence the canvas wrapper is `z-0` and content is `relative z-10`. Do not "simplify" this to a negative z-index.

**Blend:** the canvas carries `mix-blend-mode: multiply`. On a light base an additive aurora would be invisible (white + pink light = white); multiply makes the bands *darken* the rose-milk base into pink/peach washes. The wrapper must **not** set `isolation: isolate` — the canvas needs to blend against the page base.

Props:

```tsx
<SoftAurora
  speed={0.45} scale={1.6} brightness={1.15}
  color1="#fad5bb" color2="#f493be"
  noiseFrequency={2.2} noiseAmplitude={1.0}
  bandHeight={0.55} bandSpread={1.1} octaveDecay={0.12}
  layerOffset={2.5} colorSpeed={0.7}
  enableMouseInteraction={false}   /* pointer events belong to the app */
  mouseInfluence={0}
/>
```

All props are stable primitives — the component's `useEffect` depends on every one of them, so any inline object/function would remount the GL context each render.

### 2.3 Required adaptations to the vendor component

The upstream source is used as-is except for these changes. Each is necessity, not taste:

1. **`'use client'`** directive (Next.js App Router).
2. **Pause on hidden tab** — `document.addEventListener('visibilitychange', …)`: cancel the rAF when `document.hidden`, restart on return. Rendering to a hidden tab is pure battery waste.
3. **DPR cap** — `dpr: Math.min(window.devicePixelRatio, 1.5)` on the `Renderer`, plus `powerPreference: 'low-power'`. A full-screen fragment shader at DPR 3 costs ~4× the fragments for zero visible gain on soft gradients.
4. **Achromatic cosine gradients — added after seeing it render.** Both `cosineGradient` calls are driven with **equal per-channel frequency and phase**, so each returns a neutral gray varying only in brightness; multiplied by `uColor1`/`uColor2` the output can only ever be those two hues. Upstream uses `c = vec3(2,1,0)`, `d = vec3(.5,.2,.25)`, which sweep the channels out of phase and paint a **full rainbow** — it rendered visible green and saturated red bands. A pink tint attenuates a rainbow but does not constrain it.
5. **`brightness` is 0.9, never above ~1.** Under `multiply`, higher values turn the soft bands into saturated stripes.
6. **Container-relative mouse handling stays** but is inert since `enableMouseInteraction={false}`.

### 2.3b Glass and `backdrop-filter` — never hand-write the prefix

`.glass` / `.glass-strong` declare **only** the standard `backdrop-filter`. Writing `-webkit-backdrop-filter` alongside it makes autoprefixer collapse the pair down to the prefixed form alone, which current Chrome does not recognise — the declaration is then dropped at parse time and **every glass surface silently loses its blur** while the source still reads correctly. Let autoprefixer emit both.

`AuroraBackground` additionally:
- Reads `prefers-reduced-motion`. When reduced → render a **static CSS gradient** in the same colors, never mount WebGL (WCAG 2.3.3).
- Guards against WebGL being unavailable → same static fallback.
- Renders `pointer-events-none` and `aria-hidden="true"`.

Static fallback (also the SSR/first-paint layer beneath the canvas):

```css
.aurora-static {
  background:
    radial-gradient(60% 45% at 20% 18%, rgba(244,147,190,0.30), transparent 70%),
    radial-gradient(55% 40% at 82% 30%, rgba(250,213,187,0.36), transparent 72%),
    radial-gradient(70% 50% at 50% 92%, rgba(249,197,220,0.28), transparent 75%);
}
```

---

## 3. Shape & material language

| Element | Treatment |
|---|---|
| **Card** | `rounded-[28px]`, glass: `bg-white/72 backdrop-blur-xl`, hairline `border-white/60`, pink-tinted shadow |
| **Card (solid)** | opt-in `solid` prop → `bg-surface` for dense data (tables, calendar grid) where blur hurts legibility |
| **Button** | `rounded-full` by default at every size |
| **Input / Select / Textarea** | `rounded-2xl` (16px), `bg-white/80`, hairline `border-line` |
| **Badge / chip** | `rounded-full` |
| **Modal / dialog** | `rounded-[32px]`, glass, backdrop `bg-ink/40 backdrop-blur-sm` |
| **Radius scale** | sm 10 · md 14 · lg 18 · xl 22 · 2xl 28 · 3xl 32 · full |

**Shadows are pink, never gray.** `--shadow-tint: 216,110,158`. Gray shadow over a pink wash reads muddy.

```
soft:  0 1px 2px rgba(t,.05),  0 2px 10px rgba(t,.08)
card:  0 8px 30px -12px rgba(t,.22), 0 2px 8px -4px rgba(t,.10)
pop:   0 28px 64px -18px rgba(t,.34)
glow:  0 8px 24px -6px rgba(244,147,190,.55)   /* primary buttons */
edge:  inset 0 1px 0 rgba(255,255,255,.75)     /* glass top highlight */
```

### 3.1 Button variants

| Variant | Recipe |
|---|---|
| `primary` | `bg-primary text-ink` + `shadow-glow`, hover `bg-primary-600` + lift |
| `ink` | `bg-ink text-white` + shadow — highest emphasis / destructive-adjacent confirmations |
| `secondary` | `bg-white/80 backdrop-blur border border-line text-ink`, hover `bg-primary-50` |
| `ghost` | transparent, hover `bg-primary-50` |
| `danger` | `bg-danger text-white` |
| `gradient` | `linear-gradient(135deg,#f493be,#fad5bb)` + `text-ink` — hero CTA only |

Back-compat aliases stay: `default`→`primary`, `outline`→`secondary`, `destructive`→`danger`.
Sizes: `sm` h-10 · `md` h-11 · `lg` h-13. All `rounded-full`. Minimum 44px touch height on `md`+.

### 3.2 Typography

Heebo stays (Hebrew + Latin, already loaded via `next/font`).

- h1 `text-[28px]/[1.15] font-extrabold tracking-tight`, `sm:text-4xl`
- h2 `text-2xl font-bold`
- h3 `text-lg font-semibold`
- body `text-base/1.65`
- Numbers, times, money, counts → `tabular-nums` **always**.
- Big KPI values → `font-extrabold tracking-tight tabular-nums`.

---

## 4. Navigation — the OptionWheel overlay

### 4.1 Files

- `components/ui/option-wheel.tsx` + `option-wheel.css` — React Bits component, `'use client'`.
- `components/ui/nav-overlay.tsx` — the full-screen menu.
- `components/ui/app-shell.tsx` — rewritten: **the sidebar is deleted**.

`components/ui/sidebar.tsx` is removed and unexported from `components/ui/index.ts`.

### 4.2 Behaviour

- Trigger: a floating pill button in the topbar, present at **all** breakpoints.
- Overlay: `fixed inset-0 z-50`, glass scrim (`bg-cream/70 backdrop-blur-2xl`) so the aurora stays visible behind it.
- Wheel `side="right"` (correct anchor for RTL), items = the 7 `NAV_ITEMS` labels.
- **The wheel's grid column is declared FIRST.** Columns flow right-to-left under `dir=rtl`, so declaring the preview first puts it on the reading side and pushes the wheel — the actual interaction — to the left.
- **`fontSize` and `inset` resolve in JS**, from a `matchMedia('(min-width: 1024px)')` listener: 2.2rem/36 on mobile, 3rem/72 on desktop. A `lg:[--ow-font-size:…]` utility does **not** work — the component writes that variable as an inline style (which outranks any class) and derives its row height from the same number, so a CSS-only override desyncs the layout math from the rendered type.
- `curve` is 0.55, not 1: a full-strength curve swings the outer options past the container edge, where `overflow: hidden` clips them mid-word.
- Colors: `textColor="#6b6c74"`, `activeColor="#2e2f34"`.
- Desktop only: a preview panel opposite the wheel showing the highlighted item's lucide icon + a one-line Hebrew description.
- The wheel's own `:focus-visible` is overridden to an **inset, rounded** ink ring. The global ring drew a hard full-height rectangle around the column, since the overlay focuses the listbox programmatically on open.

**Selection vs. navigation — locked decision.** `onChange` fires on every scroll tick. If it navigated, scrolling from dashboard to settings would fire 7 navigations. Therefore:

- `onChange` **only** updates the highlighted preview state.
- Navigation happens on an explicit commit: clicking the already-centered item, pressing `Enter`, or the "מעבר" button.
- This requires one modification to the vendor component: in `handleItemClick`, when the clicked index is already the settled selection, call a new optional `onCommit(index, item)` prop instead of re-centering. Also fire `onCommit` on `Enter` in `handleKeyDown`.

### 4.3 Accessibility

- Overlay is a focus trap; `Esc` closes; focus returns to the trigger.
- The wheel keeps `role="listbox"` / `role="option"` / `aria-selected`.
- Because the wheel is drag/scroll-driven, the overlay **also** renders a visually-hidden plain `<nav>` list of the same 7 links so screen readers and keyboard-only users have a linear path.
- Trigger button has `aria-expanded` + `aria-controls`.
- `prefers-reduced-motion`: `smoothing` drops to `1` (instant settle), blur → 0.

### 4.4 Shell layout after the change

```
┌──────────────────────────────────────┐
│ Topbar (sticky, glass)               │
│  [☰ תפריט]      כותרת      [פעולה]  │
├──────────────────────────────────────┤
│                                      │
│   main  max-w-6xl  mx-auto  px-4     │
│   (no sidebar offset at any width)   │
│                                      │
└──────────────────────────────────────┘
```

Standalone routes (`/book`, `/login`, `/a`, `/m`, `/p`, `/c`) keep rendering bare — the existing `isStandalone` guard is unchanged. They still get the aurora, because it lives in the root layout.

---

## 5. Work breakdown

### Phase 0 — Foundation (sequential, blocks everything)
`package.json` (+`ogl`) · `app/globals.css` · `tailwind.config.ts`

### Phase 1 — Chrome (sequential, blocks Phase 3)
`soft-aurora.tsx` · `soft-aurora.css` · `aurora-background.tsx` · `option-wheel.tsx` · `option-wheel.css` · `nav-overlay.tsx` · `app-shell.tsx` · `topbar.tsx` · `brand.tsx` · `app/layout.tsx` · delete `sidebar.tsx`

### Phase 2 — Primitives (parallel-safe, blocks Phase 3)
`button` `card` `badge` `input` `textarea` `select` `label` `table` `stat-card` `empty-state` `page-header` `skeleton` `auth-layout` `send-booking-link-dialog` `index.ts`

### Phase 3 — Pages (4 disjoint clusters, fully parallel)

| Cluster | Files |
|---|---|
| **A** | `app/dashboard/**` (page, charts, insights-panel) · `app/students/**` (page, table, 2 dialogs, `[id]`) |
| **B** | `app/lessons/**` (7) · `app/lessons/calendar/**` (6) |
| **C** | `app/availability/**` · `app/groups/**` (4) · `app/settings/**` (5) |
| **D** | `app/book/**` · `app/login` · `app/a` `app/c` `app/m` `app/p` `app/s` · `app/standby/**` · `app/messages/**` |

`app/dashboard/charts.tsx` uses Recharts — retint its series to the palette (`#f493be`, `#fad5bb`, `#b84a7b`, `#2e7d5b`) and keep grid/axis at `--color-line` / `--color-muted`.

### Phase 4 — Integration
`npm run typecheck` · `npm run build` · `npm run test` · visual QA at 390px and 1440px.

---

## 6. Definition of done

- [ ] `npx tsc --noEmit` clean
- [ ] `npm run build` succeeds
- [ ] `npm run test` — same pass count as before the redesign (no test edits)
- [ ] Zero raw hex in `app/**` and `components/**` outside `globals.css`, `tailwind.config.ts`, the aurora props, and Recharts series colors
- [ ] Zero physical-direction utilities (`pl-` `pr-` `ml-` `mr-` `left-` `right-`) introduced
- [ ] No `text-white` on any pink/peach background
- [ ] Aurora mounts once; no GL context recreation on route change
- [ ] `prefers-reduced-motion` → static gradient, no rAF running
- [ ] Every nav destination reachable by keyboard alone
- [ ] All touch targets ≥ 44px at 390px width

## 7. Out of scope

Behaviour, data model, server actions, `lib/**`, API routes, tests, Hebrew copy, dark mode.
