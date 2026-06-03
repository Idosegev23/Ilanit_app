# Ilanit System — Build Plan & Module Contracts

> **For agentic workers:** This is the shared contract for a parallel multi-agent build. Read this AND the spec (`docs/superpowers/specs/2026-06-03-ilanit-lesson-management-design.md`) before writing code. Use TDD (vitest). Own ONLY your assigned files. Import shared contracts; never edit another module's files. Commit frequently.

**Goal:** Build the full Ilanit lesson-management system to a compiling, unit-tested, locally-runnable state with mocked external providers, ready for live keys.

**Architecture:** Next.js 16 App Router (root-level `app/` + `lib/`, no `src/`), Hebrew RTL. Neon Postgres via Drizzle. Auth.js v5 (Google) unified login+calendar. Vercel Cron + Blob. GreenAPI outbound. Morning receipts. OpenAI `gpt-5.4` insights. External calls live behind `lib/` wrappers and are mocked in tests.

**"Done" =** `npm install` clean · `npx tsc --noEmit` passes · `npm run build` passes · `npm test` (vitest) green · `npm run dev` boots. Live API calls require env keys (filled later by owner).

---

## Conventions (ALL agents follow)

- **Paths:** root-level `app/`, `lib/`, `db/`, `components/`. Alias `@/*` → `./*` (tsconfig + vitest).
- **Language:** UI text **Hebrew**, `dir="rtl"`, Heebo font. Code/identifiers/comments-where-helpful in English.
- **Money:** integer **shekels** (`number`), never agorot/decimals.
- **Time:** `timestamptz`; all logic in `Asia/Jerusalem` via `lib/time.ts`. Never use raw `Date.now()` in business logic without tz handling.
- **Env:** access ONLY via `env()` from `lib/env.ts` (zod-validated, cached). Never `process.env.*` directly outside `lib/env.ts`.
- **DB:** import `db` from `@/lib/db`, schema from `@/db/schema`. All money/time columns per spec §4.
- **External providers:** wrapped in `lib/<provider>/`. In tests, mock the wrapper module (`vi.mock`).
- **Errors:** wrap external calls in try/catch, log, return typed results; idempotency via `message_log`.
- **Tests:** colocate under `__tests__/` next to the module or `lib/<m>/__tests__/`. `vitest run <path>` per module.

---

## File Structure & Module Ownership

### Phase A — FOUNDATION (1 coder agent, then reviewer; sequential, blocks all others)
Creates the project + ALL shared contracts. Declares external-provider libs as **typed stubs** that `throw new Error('NOT_IMPLEMENTED: <name>')` so the app compiles before features land. Installs ALL dependencies up front.

Owns/creates:
- Config: `package.json` (all deps below), `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `.env.example` (exact keys from spec §8), `vercel.json` (crons), `drizzle.config.ts`.
- `db/schema.ts` — **complete** Drizzle schema, ALL tables from spec §4.
- `lib/env.ts` — zod env (pattern from `world-cup/src/lib/env.ts`), all keys from spec §8.
- `lib/db/index.ts` — Neon (`@neondatabase/serverless`) + `drizzle`.
- `lib/crypto.ts` — `encrypt(plain): string` / `decrypt(enc): string` (AES-256-GCM, key from `TOKEN_ENC_KEY`).
- `lib/utils.ts` — `normalizePhoneIL(raw): string` (→ E.164 `+972…`), `phoneToChatId(e164): string` (`972…@c.us`), `formatShekels(n): string` (`₪120`), `cn(...)`.
- `lib/time.ts` — tz helpers: `nowIL()`, `startOfDayIL(date)`, `ilHour(date)`, `toILDateStr(date)`, `parseILDateTime(dateStr, timeStr)`.
- `lib/settings.ts` — `getSettings()` (returns row, creating defaults if missing), `updateSettings(patch)`.
- `auth.ts` — Auth.js v5 NextAuth config: Google provider with `authorization: { params: { access_type:'offline', prompt:'consent', scope:'openid email profile https://www.googleapis.com/auth/calendar' } }`; `signIn` callback restricts to `env().ALLOWED_LOGIN_EMAIL`; capture `account.refresh_token` → `saveGoogleRefreshToken()`.
- `app/api/auth/[...nextauth]/route.ts`, `middleware.ts` (protect `/dashboard /students /lessons /groups /settings`; allow `/book /a /p /m /api/cron /api/availability /api/book /api/auth`).
- `lib/google-tokens.ts` — `saveGoogleRefreshToken(email, token)`, `getGoogleAccessToken()` (refresh via stored token), stored encrypted in `google_tokens`.
- `lib/tokens.ts` — `createActionToken(type, lessonId, ttlMin): Promise<string>` (returns raw token; stores hash), `consumeActionToken(raw): Promise<{type, lessonId} | null>` (single-use, expiry check).
- `lib/message-log.ts` — `alreadySent(template, relatedId): Promise<boolean>`, `logMessage(entry)`.
- `lib/whatsapp/provider.ts` — **real** GreenAPI outbound (port from `world-cup/src/lib/greenapi.ts`): `sendText(toPhone, text)`, `sendFileByUrl(toPhone, url, filename, caption?)`. Uses `GREEN_API_*` env.
- `lib/notifications/templates.ts` — type-aware Hebrew template builders (keys below). `lib/notifications/dispatch.ts` — `notify(template, to, vars, relatedId?)` (idempotent via message-log + whatsapp).
- `lib/students.ts` — shared CRUD: `findStudentByPhone(e164)`, `createStudent(data)`, `getStudent(id)`, `listStudents()`, `studentFileData(id)` (lessons+payments+receipts+group memberships+billing).
- **Stub libs** (typed signatures, throw NOT_IMPLEMENTED) — feature agents implement:
  - `lib/google-calendar/index.ts`, `lib/availability/index.ts`, `lib/recurrence/index.ts`, `lib/morning/index.ts`, `lib/insights/index.ts`, `lib/groups/index.ts`.
- UI shell: `app/layout.tsx` (RTL, Heebo, metadata), `app/globals.css`, `app/page.tsx` (→ redirect `/dashboard` or `/book`), `components/ui/*` minimal (Button, Card, Input, nav), `app/login/page.tsx`, `app/dashboard/page.tsx` (placeholder).
- `scripts/seed.ts` — seed default `settings`.

**Dependencies (package.json):** `next@^16`, `react@19`, `react-dom@19`, `next-auth@^5` (beta), `drizzle-orm`, `@neondatabase/serverless`, `zod`, `date-fns`, `date-fns-tz`, `googleapis`, `openai`, `recharts`, `lucide-react`, `clsx`, `tailwind-merge`, `class-variance-authority`, `@vercel/blob`. Dev: `drizzle-kit`, `vitest`, `@types/*`, `tailwindcss`, `postcss`, `autoprefixer`, `typescript`, `eslint`, `eslint-config-next`, `tsx`.

### Phase B — FEATURES (parallel coder agents; disjoint ownership)

| Agent / Role | Owns (exclusive) | Implements |
|---|---|---|
| **B1 Calendar** | `lib/google-calendar/**` | OAuth client via `getGoogleAccessToken()`; `freeBusy(range)`, `insertEvent(opts)` (attendees+`sendUpdates:'all'`, location, reminders), `insertRecurringEvent(opts, rrule)`, `cancelEvent(id)`, `listEndedSince(since)` (events ended in window, with `extendedProperties.private.type/student_id/group_id`), group marker via extendedProperties. |
| **B2 Booking** | `lib/availability/**`, `app/book/**`, `app/api/availability/route.ts`, `app/api/book/route.ts`, `app/a/[token]/**`, `app/api/approve/route.ts`, `app/m/[token]/**`, `app/api/assign/route.ts` | Availability engine (template−exceptions−lessons−freeBusy−lead-time); public booking page+form; `/api/book` (tx, match student, pending lesson, tokens, notify); approval page+API (insertEvent, confirm, notify); assign-student page+API (`needs_match` → set student + remember `student_aliases`). |
| **B3 Reminders/Cron** | `app/api/cron/tick/route.ts`, `app/api/cron/group-billing/route.ts`, `lib/jobs/**` | `lib/jobs`: `runDayBeforeReminders()`, `runCalendarScan()` (uses B1 `listEndedSince` → payment prompt / needs_match), `runPaymentFollowup()`, `runGroupBilling()` (calls `lib/groups`). Cron routes: `CRON_SECRET` auth + tz gating; call jobs. |
| **B4 Payments/Receipts** | `lib/morning/**`, `app/p/[token]/**`, `app/api/payment/route.ts`, `app/students/**` | Morning client (token auth, `createReceipt(payload)` → doc+PDF); `/p/[token]` page (paid/unpaid) + `/api/payment` (mark paid → morning → Blob upload → whatsapp `sendFileByUrl` attachment → save `receipts`; or send payment request); `/students` list + `/students/[id]` client file (history + receipt archive download). |
| **B5 Groups** | `lib/groups/**`, `app/groups/**` | `lib/groups`: `listGroups`, `createGroup`, `members CRUD`, `generateMonthlyBilling(month)`, `markBillingPaid(id)` (→ Morning receipt + Blob + whatsapp), `rosterFor(groupId, month)`. Pages: groups CRUD, members, `/groups/[id]/billing/[month]` roster. |
| **B6 Dashboard/Insights** | `lib/insights/**`, `app/dashboard/**` (replace placeholder), `app/api/insights/route.ts` | KPIs + Recharts (revenue, lessons/week, occupancy trend, top students) + action lists (today/upcoming, pending approvals, unpaid). `lib/insights`: build anonymized aggregates → OpenAI `gpt-5.4` → Hebrew insights, cache in `insights_cache`. |
| **B7 Recurrence/Lessons** | `lib/recurrence/**`, `app/lessons/**` | `lib/recurrence`: `createSeries(kind, ...)` → generate lessons/group_sessions forward + Google recurring event (via B1); `cancelSeries`/`cancelOne`. `/lessons`: calendar view, approve/reject/cancel, manual create, recurring create. |

**Cross-module contracts** (defined as foundation stubs so callers and implementers agree):
- B2 & B3 call `lib/google-calendar` (B1). B3 calls `lib/groups` (B5). B4/B5 call `lib/morning` (B4 owns morning; B5 imports it). To avoid B4/B5 both editing morning: **B4 owns `lib/morning`**, B5 only imports `createReceipt`. B5 owns `lib/groups`; B3 only imports.
- In unit tests, mock cross-module deps (`vi.mock('@/lib/google-calendar')`, etc.).

### Phase C — REVIEW + FIX (per module: reviewer agent → fix agent; loop ≤3)
Reviewer reads the module's code + runs its tests + checks spec adherence + conventions (money=shekels, env() usage, RTL, idempotency). Emits verdict {pass, issues[]}. If issues → fix agent resolves → re-review. Loop until pass or 3 rounds (then flag).

### Phase D — INTEGRATION (1 agent, loop until green)
`npm install` → `npx tsc --noEmit` → `npm run build` → `npm test`. Fix integration/type errors across module seams (respecting ownership). Loop until all green. Produce final report: what builds, test counts, and a checklist of live-wiring steps that need env keys.

---

## lib Interface Contracts (foundation declares; features implement)

```ts
// lib/google-calendar/index.ts
export interface FreeBusySlot { start: string; end: string }
export async function freeBusy(timeMin: string, timeMax: string): Promise<FreeBusySlot[]>
export interface EventInput { summary: string; startISO: string; endISO: string; location?: string;
  attendeeEmail?: string; description?: string; extendedPrivate?: Record<string,string> }
export async function insertEvent(e: EventInput): Promise<{ id: string; htmlLink?: string }>
export async function insertRecurringEvent(e: EventInput, rrule: string): Promise<{ id: string }>
export async function cancelEvent(eventId: string): Promise<void>
export interface EndedEvent { id: string; summary: string; endISO: string; attendeeEmail?: string;
  type?: 'individual'|'group'; studentId?: string; groupId?: string }
export async function listEndedSince(sinceISO: string, untilISO: string): Promise<EndedEvent[]>

// lib/availability/index.ts
export interface Slot { startISO: string; endISO: string; label: string }
export async function availableSlots(dateISO: string): Promise<Slot[]>
export async function occupancy(fromISO: string, toISO: string): Promise<{ capacity: number; booked: number; pct: number }>

// lib/morning/index.ts
export interface ReceiptInput { clientName: string; clientPhone?: string; amount: number;
  description: string; method?: 'bit'|'cash'|'transfer'|'other' }
export async function createReceipt(i: ReceiptInput): Promise<{ docId: string; docNumber: string; pdfUrl: string }>

// lib/groups/index.ts
export async function generateMonthlyBilling(monthISO: string): Promise<{ created: number }>
export async function markBillingPaid(billingId: string, method?: string): Promise<void>
export async function rosterFor(groupId: string, monthISO: string): Promise<Array<{ studentId: string; name: string; status: string; amount: number }>>

// lib/recurrence/index.ts
export async function createSeries(input: { kind:'individual'|'group'; studentId?: string; groupId?: string;
  weekday: number; startTime: string; durationMin: number; price?: number; horizonDays: number }): Promise<{ count: number }>

// lib/insights/index.ts
export async function generateInsights(periodDays: number): Promise<{ stats: object; text: string }>

// lib/notifications/templates.ts  (type-aware Hebrew)
export type TemplateKey =
  | 'booking_pending_student' | 'booking_pending_ilanit' | 'booking_approved_student'
  | 'booking_rejected_student' | 'reminder_day_before_individual' | 'reminder_day_before_group'
  | 'reminder_day_before_ilanit' | 'payment_check_ilanit' | 'payment_request_individual'
  | 'payment_request_group' | 'payment_followup_ilanit' | 'assign_student_ilanit'
  | 'group_billing_member' | 'group_roster_ilanit'
export function renderTemplate(key: TemplateKey, vars: Record<string, string | number>): string
```

## Action-token routes (channel = WhatsApp link → web action; no inbound webhook)
- `/a/[token]` approve|reject lesson · `/p/[token]` payment paid|request · `/m/[token]` assign student to a `needs_match` lesson.

## Self-review gate before "done"
Each agent: no placeholders/TODO in shipped code; money in shekels; `env()` used; RTL Hebrew UI; external calls mocked in tests; idempotent sends. Integration agent verifies the full "Done" checklist.
