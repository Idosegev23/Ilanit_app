# Ilanit — Design System & Redesign Contract ("Warm & Personal")

> Shared contract for the redesign. Style = **Soft UI Evolution** (soft shadows, rounded, light mode, WCAG AA, 200–300ms transitions, focus-visible) with a **terracotta / peach / cream** palette. Hebrew RTL, font = **Heebo** (already loaded). Icons = **lucide-react** only (no emoji). Restyle ONLY — preserve all existing data wiring/server logic; the one NEW page is `/settings`.

## Design tokens (put in tailwind.config.ts `theme.extend` + globals.css CSS vars)

**Colors** (verify every text/bg pair ≥ 4.5:1; darken primary if a button fails):
```
cream/bg:      #FBF6F0      surface/card:  #FFFFFF
ink (text):    #2E2521      muted text:    #6F6157   border: #EADFD2
primary (terracotta) 500: #B84E26   600/hover: #9E4220   fg: #FFFFFF
primary tints: 50 #FBF0EA · 100 #F6DFD2 · 200 #EEC0A8 · 300 #E29B78 · soft-bg #FBEEE4
accent (honey) 500: #C98A2B   text-on-light: #8A5E12   soft-bg #FBF1DE
success: #4E7A52  soft #E7F0E7   warning: #B97E1E soft #FBF1DE
destructive: #C0392B  soft #FBE7E4   ring(focus): #B84E26
```
Tailwind names: `bg-cream surface ink muted border-line primary primary-600 accent success warning danger` (map to the hexes above; expose as both Tailwind colors and CSS vars `--color-*` for theming).

**Radius:** sm 8 · md 12 · lg 16 · xl 20 · 2xl 24 · full. Cards = `rounded-2xl`; buttons = `rounded-xl` (primary CTA may be pill `rounded-full`); inputs = `rounded-xl`.

**Shadows (soft, warm-tinted):**
```
shadow-soft:  0 1px 2px rgba(46,37,33,.05), 0 2px 8px rgba(46,37,33,.06)
shadow-card:  0 4px 16px rgba(46,37,33,.07)
shadow-pop:   0 12px 32px rgba(46,37,33,.12)
```

**Type scale:** 12 14 16(base) 18 20 24 30 36. Headings 600–700, labels 500, body 400, line-height 1.5–1.7. Prices/times/counts → `tabular-nums`.

**Spacing:** 4/8 system. Page max-width `max-w-6xl`. Section rhythm 16/24/32/48.

**Motion:** transitions 150–300ms ease-out; hover/press states on all interactive; honor `prefers-reduced-motion`; never animate width/height (transform/opacity only).

## RTL rules (Hebrew)
- `<html dir="rtl" lang="he">`. Use logical utilities (`ps-/pe-/ms-/me-/text-start/text-end`) — never hard-coded left/right.
- **Sidebar nav sits on the RIGHT**; main content to its left.
- Keep time ranges (`16:00–20:00`) and phone/email LTR with `dir="ltr"` inline spans where needed.
- Mirror directional icons (chevrons) for RTL.

## Component library (`components/ui/*` — foundation rebuilds these; pages consume them)
- **button** — variants: `primary` (terracotta, white text), `secondary` (cream surface + border), `ghost`, `danger`; sizes sm/md/lg (min-height 44px); `loading` (spinner + disabled); focus-visible ring; `cursor-pointer`.
- **card** — white, `rounded-2xl`, `shadow-card`, `border border-line`, padding 5–6; optional `CardHeader/CardTitle/CardBody/CardFooter`.
- **input / textarea / select** — white bg, `rounded-xl`, border-line, focus ring primary, min-height 44px; visible `<label>`; helper + error text slots (error in `danger`, `aria-invalid`, message below field).
- **badge / StatusPill** — semantic: pending=accent, confirmed=success, rejected/cancelled=muted, due=warning, paid=success, needs_match=danger — soft-bg + colored text + a lucide icon (color-not-only).
- **table** — clean, header row `bg-primary-50`, zebra `odd:bg-cream/40`, `rounded-2xl` overflow clip, cells py-3; `tabular-nums` for money/dates; responsive (stack/scroll) on mobile.
- **Sidebar + Topbar (app shell in layout.tsx)** — right sidebar: logo/title "המערכת של אילנית", nav items (dashboard/students/lessons/groups/settings) with lucide icon + label, active item highlighted (primary-50 bg + primary text + start-border), sign-out at bottom (visually separated). Topbar: page context + quick "שתף לינק תיאום". Mobile: collapses to a top bar + drawer.
- **StatCard** — icon chip (primary-soft), big `tabular-nums` value, label, optional delta.
- **EmptyState** — lucide icon, title, helper line, optional CTA. (Used by "אין זמנים", empty lists.)
- **PageHeader** — title + subtitle + actions slot.
- **Skeleton** — shimmer placeholders for async (charts/lists).

## Pages to redesign (apply system; preserve logic)
- **P1** `/book` (public) + `/login` — hero-ish warm booking; date picker + slot grid (slots as pill buttons, selected state); clear form (name/phone required, email "מומלץ" w/ helper); success "ממתין לאישור" state; nice **EmptyState** for no slots. Login = centered warm card + "התחבר עם Google".
- **P2** `/dashboard` — StatCards (revenue ₪ / lessons / occupancy% / outstanding), Recharts in cards (warm palette), action lists (today/upcoming, pending approvals, unpaid). **Add a prominent "לינק לתיאום שיעור" card** showing the public `/book` URL with a **copy button** (this is the link Ilanit shares).
- **P3** `/students` + `/students/[id]` — table/list of students; client file = header + tabs/sections (פרטים · שיעורים · תשלומים · קבלות archive with download · קבוצות).
- **P4** `/lessons` — calendar/list with StatusPills; approve/reject/cancel + manual/recurring create in a styled dialog/form.
- **P5** `/groups` + `/groups/[id]` + `/groups/[id]/billing/[month]` — group cards; members management; **roster** = table with paid/unpaid toggle per member.
- **P6** `/a/[token]` /`/m/[token]` /`/p/[token]` — centered single-action warm cards (mobile-first; Ilanit taps from phone): approve/reject; assign-student picker; paid/request with editable amount.
- **P7 — NEW `/settings`** (build from scratch): **weekly availability editor** (per weekday 0–6 add/remove time windows → writes `availability` rows; + exceptions/blocked dates), business address, `default_duration_min`/`buffer_min`/`lead_time_min`/`booking_horizon_days`, `reminder_time`, `group_billing_day`, `business_name`, `morning_doc_type`. Persist via a new `/api/settings` route or server action using `@/lib/settings.updateSettings` + `@/lib/db` for availability. This is what makes `/book` show slots.

## Definition of done
`npx tsc --noEmit` clean · `npm run build` passes · `npm test` still green (263) · every page uses the new components (no raw unstyled markup) · WCAG AA contrast · RTL correct · no emoji icons · functionality preserved (data wiring unchanged) · `/settings` writes availability and `/book` then shows slots.
