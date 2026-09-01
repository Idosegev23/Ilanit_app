# Broadcast messaging — design

**Date:** 2026-08-18
**Scope:** bulk WhatsApp from `/messages/broadcast`, with recipient selection, batching, filtering and sorting.

## Why this is not a loop over `sendChatMessage`

Three constraints shape everything below.

1. **WhatsApp bans bulk senders.** Identical messages to many numbers in a short window is the signature GreenAPI accounts get flagged for, and this is Ilanit's real business number. Hence per-message jitter and `{שם}` personalisation, which together mean no two sends are byte-identical or evenly spaced.
2. **The cron runs hourly**, so it cannot carry a send the user is waiting on.
3. **Recipients are not students.** 27 active students resolve to 23 distinct phones: the four Rashef siblings share their mother's number, and a duplicate `אימרי חסון` shares one too. A naive send delivers four copies to one person.

## Data model

```
broadcasts
  id · body · status(draft|sending|done) · totalCount · sentCount · failedCount · createdAt

broadcast_recipients
  id · broadcastId→broadcasts(cascade) · studentId→students(set null)
  nameSnapshot · phoneSnapshot
  status(pending|sent|failed) · error · providerMsgId · sentAt
  UNIQUE(broadcastId, studentId)
```

`nameSnapshot` / `phoneSnapshot` exist so history survives a rename or deletion — the same reason `lessons` carries `bookedByName`/`bookedByPhone`. The unique index is the double-click guard: a second submit cannot create a second row for the same recipient.

## Execution — client-driven batches

```
createBroadcast(body, studentIds) → rows at 'pending'. Sends nothing.
sendBatch(id, size)               → claims the next N pending, sends, returns {sent, failed, remaining}
```

The client loops `sendBatch` until `remaining === 0`. Each request stays short (no timeout), progress is real rather than a spinner, and an interruption is resumable because the pending rows are still there.

A send failure marks that one recipient `failed` and continues — one bad number must not strand the rest.

## Dedup by resolved phone

Recipients resolve through `contactPhoneFor()` (guardian wins), then group by phone. One row per distinct number; the extra students are recorded as covered by that row. The UI states the real figure: "23 נמענים — 27 תלמידים, 4 חולקים מספר".

## UI

`/messages/broadcast`: recipient picker (search, checkboxes, select-all, filter by group / upcoming lesson / archived, sort by name or last lesson) beside a composer (free text, `{שם}` token, live preview against a real recipient). Confirm dialog states the deduped count. Then a progress view. Below, past broadcasts with a resend-to-failures action.

## Out of scope

Scheduled/future sends, media attachments, saved templates, per-recipient opt-out.
