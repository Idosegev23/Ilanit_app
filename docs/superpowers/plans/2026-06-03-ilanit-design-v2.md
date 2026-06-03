# Ilanit — Premium Redesign v2 (art direction upgrade)

> **Why v2:** the current build is functional but visually BLAND — small lonely cards floating in a vast pale-cream void, low contrast, no brand identity, no depth, dead space everywhere. It reads as an unfinished template. Keep the warm direction but execute at a **premium product** level. Stack unchanged (Next.js 16, Tailwind, Heebo, lucide, RTL). Restyle only — preserve all logic; the functional additions are the PRICING fields.

## Hard rules to kill the "blandness"
1. **No lonely card in an empty background.** Auth/standalone pages get a full-bleed composition (gradient + brand + decorative shapes), not a tiny centered card.
2. **Use depth:** layered surfaces, warm gradients, present-but-soft shadows, `rounded-2xl/3xl`. Surfaces must feel crafted, not flat-empty.
3. **Confident color:** deeper terracotta for primary/headings; warm gradients (terracotta→amber→peach) as hero/accents; cream only as a neutral surface, never as a vast empty void.
4. **Brand identity:** a simple wordmark **"אילנית"** + the calendar-heart mark, used in the sidebar and auth hero.
5. **Strong hierarchy:** bigger/bolder headings, clear section rhythm, purposeful whitespace (group/separate), never aimless emptiness.
6. **Polish:** hover-lift on cards/buttons, focus-visible, 150–250ms motion, tasteful. WCAG AA, RTL, lucide only, no emoji.

## Upgraded tokens (extend the existing theme)
```
ink:        #2B211C      muted: #6E5F54      line: #ECDFD2
cream/bg:   #FBF4EC      surface: #FFFFFF    surface-2 (tinted): #FDEFE6
primary (terracotta): #B5471F   600/hover #97380F   fg #FFFFFF
amber/honey accent: #D98A2C   deep #9A5E12
gradient-warm: linear-gradient(135deg,#B5471F 0%, #D98A2C 55%, #F0B27A 100%)
gradient-soft: linear-gradient(160deg,#FDEFE6 0%, #FBF4EC 100%)
success #3F7A52 · warning #B97E1E · danger #C0392B
shadow-card: 0 8px 28px -8px rgba(70,40,25,.18)
shadow-pop:  0 20px 48px -12px rgba(70,40,25,.28)
radius: cards 2xl/3xl (20–28), buttons xl/full
```
Add: `bg-gradient-warm`, `bg-gradient-soft` utilities; a subtle dotted/relief texture or blurred color blobs for hero backgrounds.

## AuthLayout (NEW shared) — /login, /book, /book/[token], /a, /m, /p
Full-screen **split**: one side = `bg-gradient-warm` panel with the **brand wordmark "אילנית"**, a one-line value prop ("ניהול השיעורים, התיאומים והתשלומים — במקום אחד"), and soft decorative blobs/illustration; other side = the action card on `bg-gradient-soft`, elevated (`shadow-pop`), generous padding, clear primary CTA. **Mobile:** gradient header band (brand) + card below. This replaces every lonely-card layout.

## App shell (dashboard & owner pages)
- **Sidebar (right, RTL):** brand at top (mark + "אילנית"), grouped nav with subtle section labels, active item = primary pill + start accent bar, sign-out footer separated. Slight tinted/gradient surface.
- **Topbar:** page title + subtitle + a primary action (e.g. "שלח לינק לתיאום"); soft bottom border.
- **Content:** `bg-cream` with layered white/`surface-2` cards; strong page headers; no empty voids.

## Component upgrades (components/ui/*)
- **StatCard:** colored icon chip, large `tabular-nums` value, label, optional trend pill; subtle gradient/tint top.
- **Card:** optional gradient/tinted header variant; `shadow-card`, hover-lift on interactive cards.
- **Button primary:** terracotta, white text, hover darken + slight lift; pill for hero CTAs.
- **Charts:** warm gradient area/bar fills, muted gridlines, rounded.
- **Table:** refined header (`surface-2`), comfortable rows, `tabular-nums`, hover row.
- **EmptyState:** larger illustrative icon in a tinted circle, helpful copy, CTA — never a bare line of text.
- **Badge/StatusPill:** soft-bg + colored text + icon.

## PRICING (functional — make both clearly settable)
- **Group create/edit form:** field **"מחיר חודשי לחבר (₪)"** → `groups.monthlyPrice` (integer shekels). Roster/billing already use it; ensure the form exposes it prominently.
- **Student create/edit form:** field **"מחיר לשיעור פרטי (₪)"** → `students.defaultPrice` (integer shekels). Surface it in the student form + the "תלמיד חדש" tab of the send-booking-link dialog (optional default price).
- **/settings:** a **"מחיר ברירת-מחדל לשיעור פרטי"** field (settings) used when a student has none.
- All money integer shekels, `tabular-nums`, no decimals.

## Definition of done
`tsc` clean · `build` passes · `npm test` green · every page uses the upgraded system (no lonely-card-in-void layouts) · auth pages use AuthLayout · pricing fields present & wired (group monthly-per-member, student private-per-lesson, settings default) · WCAG AA · RTL · lucide only · functionality preserved.
