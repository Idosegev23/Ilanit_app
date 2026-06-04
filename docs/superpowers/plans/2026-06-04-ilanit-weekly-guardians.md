# Ilanit — Weekly booking + open-weeks + guardian phone + recurring onboarding

> Contract for this change set. Stack/design unchanged (Next.js 16, Tailwind, Heebo, RTL, lucide, design-system v2 components, integer shekels). Restyle/extend only — preserve logic. Weeks are **Sunday→Saturday** (Asia/Jerusalem).

## 1. Schema (migration)
- **students**: add `guardianName` (text, nullable), `guardianPhone` (text E.164, nullable), `receiptLabel` (text, nullable — default receipt description for this student).
- **open_weeks** (NEW): `id uuid pk defaultRandom, weekStart date (unique, the Sunday), createdAt`. A week is bookable via personal links ONLY if a row exists for its `weekStart`.

## 2. lib (foundation)
- `lib/students.ts`: `contactPhoneFor(student)` = `guardianPhone ?? phone` (E.164). Include guardian fields in `createStudent`/`updateStudent`/`studentFileData`.
- `lib/open-weeks.ts` (NEW): `weekStartOf(date)` (Sunday), `isWeekOpen(date)`, `openWeek(weekStartISO)`, `closeWeek(weekStartISO)`, `listOpenWeeks(fromISO,toISO)`.
- `lib/availability`: add `availableWeek(weekStartISO)` → `{ weekStartISO, isOpen, days: [{ dateISO, weekday, slots: Slot[] }] }`. **Gate**: `availableSlots`/`isSlotBookable` return nothing/false when the slot's week is NOT open (in addition to template/exceptions/busy/lead-time). Recurring lessons & group sessions are NOT gated by open-weeks (they're auto-scheduled).
- **Central WhatsApp routing**: wherever we message a student (booking link, reminders, payment request, receipt, group billing), resolve the recipient via `contactPhoneFor(student)` so a child's messages go to the **parent's phone**. Update the central notify/dispatch (and group billing) to take the student and route to guardian when present.

## 3. Booking — WEEK view (`/book/[token]` + TokenBookingForm)
- Replace the single-day picker with a **7-day week grid** (Sun→Sat): each day shows its available slots as selectable pills; prev/next-week navigation within the booking horizon.
- If the displayed week is **not open** → friendly notice: "השבוע הזה עדיין לא נפתח לתיאום — נסו שבוע אחר" (auto-jump to the nearest open week if any).
- Pick a slot → book (student already known from the token) → normal approval flow.

## 4. Open-weeks management (owner — in `/lessons`)
- A **week strip** of upcoming weeks (within horizon), each with a **"פתוח/סגור לתיאום"** toggle → `openWeek`/`closeWeek`. Clear visual of which weeks are open. (Default: weeks start CLOSED; Ilanit opens them — "אילנית פותחת שבוע ידנית".) Owner-only API/action.

## 5. Guardian phone (ALL students)
- Student create/edit form + the "תלמיד חדש" tab of the send-booking-link dialog: fields **"שם הורה"** + **"טלפון הורה"** (recommended for children; normalized E.164).
- Student file (`/students/[id]`) displays guardian + shows that messages route to the guardian phone.
- All outbound WhatsApp for that student → guardian phone (via `contactPhoneFor`, foundation).

## 6. Groups — add child + parent phone
- Add-member flow: **child name + parent (guardian) phone** (writes the student's guardian fields; the student record represents the child, contact = parent).
- Group billing requests/reminders + receipts → the parent's phone (`contactPhoneFor`).

## 7. Recurring / existing-regulars onboarding (prominent — existing tools)
- `/lessons`: a **prominent primary** action "הוספת שיעור קבוע (מחזורי)" → `lib/recurrence.createSeries` (individual) — for regulars who already have weekly lessons.
- `/groups`: prominent **"קבוצה חדשה"** with a weekly schedule (`recurrences kind=group`).
- Both auto-generate recurring calendar events (NOT gated by open-weeks).

## 8. Receipts — editable description (presets + free text)
When issuing a receipt, Ilanit sets the **description line**: quick presets **"שיעור פרטי" · "חוג" · "הוראה מתקנת"** + a free-text field. Default = the student's `receiptLabel` if set, else a sensible default ("שיעור פרטי" individual / "חוג {group name}" group). Passed to `lib/morning.createReceipt({ description })` (already accepts `description`).
- `/p/[token]` (individual): description field (presets + free text) by the [שולם — הפק קבלה] action.
- Group billing (`markBillingPaid`): description (default "חוג {group}"; editable in the roster).
- Student form: a **"תיאור לקבלה (ברירת מחדל)"** field → `students.receiptLabel`.

## Definition of done
`tsc` clean · `build` passes · `npm test` green · migration applied · week-view booking gated by open-weeks · Ilanit can open/close weeks · guardian fields present & messages route to guardian · groups capture parent phone · recurring/group add prominent · RTL · design-system v2 · shekels · functionality preserved.
