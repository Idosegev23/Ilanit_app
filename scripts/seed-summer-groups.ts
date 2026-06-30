// One-off seed: create the 12 summer study groups (July 2026) using the app's
// own group-creation logic (createGroupWithSchedule → createSeries), so every
// group gets its weekly group_session series AND a recurring Google-Calendar
// event (which blocks individual booking on those slots).
//
// The program window is fixed: sessions ONLY within 2026-07-02 .. 2026-07-29
// inclusive (4 occurrences per weekly slot). createSeries is horizon-based from
// "now", so it can over-generate at both edges (e.g. today's already-skipped
// slot, or 2026-07-01 / 2026-07-30). After creating each series we RECONCILE
// every slot to the canonical in-window occurrence set: out-of-window
// group_session lessons are deleted, and the recurring Google event is rebuilt
// so it is anchored on the first in-window occurrence with COUNT = in-window
// count (so the calendar never shows an out-of-window instance either).
//
// Idempotent: groups whose name already exists are SKIPPED. Each group is
// wrapped in try/catch so one failure does not abort the rest.
//
// Run: npx tsx scripts/seed-summer-groups.ts

// MUST load env BEFORE any '@/lib/*' import (parses .env.local incl. special chars).
// @next/env is CommonJS; under tsx/ESM the named import does not resolve, so we
// use the default (namespace) import and read loadEnvConfig off it.
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());

import { db } from '@/lib/db';
import { groups, lessons, recurrences } from '@/db/schema';
import { and, eq, asc } from 'drizzle-orm';
import { getSettings } from '@/lib/settings';
import { createGroupWithSchedule, type WeeklyScheduleInput } from '@/lib/groups';
import { insertRecurringEvent, cancelEvent, type EventInput } from '@/lib/google-calendar';
import { parseILDateTime, toILDateStr, toILTimeStr } from '@/lib/time';

// ── Program window (Asia/Jerusalem) ──────────────────────────────────────────
const WINDOW_START = '2026-07-02'; // inclusive
const WINDOW_END = '2026-07-29'; // inclusive
// Half-open UTC instant bounds: [startInstant, endInstant)
const WINDOW_START_INSTANT = parseILDateTime(WINDOW_START, '00:00');
// end-of-window = start of the day AFTER 2026-07-29 (i.e. 2026-07-30 00:00 IL)
const WINDOW_END_EXCLUSIVE_INSTANT = parseILDateTime('2026-07-30', '00:00');

// Horizon large enough to comfortably reach 2026-07-29 from "now" (2026-06-30),
// regardless of run time. Reconciliation trims anything outside the window.
const HORIZON_DAYS = 45;

// RRULE weekday codes indexed by JS weekday (0 = Sunday) — mirrors lib/recurrence.
const RRULE_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

const MONTHLY_PRICE = 650;
const MAX_MEMBERS = 6;

interface GroupDef {
  name: string;
  slots: Array<{ weekday: number; startTime: string; durationMin: number }>;
}

// weekday: Sun=0, Mon=1, Tue=2, Wed=3, Thu=4
const D60 = 60;
const D180 = 180;

const GROUP_DEFS: GroupDef[] = [
  { name: "מתמטיקה עולות לז'", slots: [{ weekday: 1, startTime: '17:00', durationMin: D60 }, { weekday: 4, startTime: '17:00', durationMin: D60 }] },
  { name: "מתמטיקה עולות לה'", slots: [{ weekday: 1, startTime: '15:00', durationMin: D60 }, { weekday: 4, startTime: '15:00', durationMin: D60 }] },
  { name: "אנגלית עולים לב'+ג'", slots: [{ weekday: 1, startTime: '16:00', durationMin: D60 }, { weekday: 4, startTime: '16:00', durationMin: D60 }] },
  { name: "אנגלית עולים לח'-ט'", slots: [{ weekday: 1, startTime: '13:00', durationMin: D60 }, { weekday: 4, startTime: '13:00', durationMin: D60 }] },
  { name: "אומנויות-חשבון עולות לח'", slots: [{ weekday: 4, startTime: '14:00', durationMin: D60 }] },
  { name: "מתמטיקה עולים לו'", slots: [{ weekday: 0, startTime: '15:30', durationMin: D60 }, { weekday: 3, startTime: '15:30', durationMin: D60 }] },
  { name: "מתמטיקה עולים לט'", slots: [{ weekday: 0, startTime: '13:30', durationMin: D60 }, { weekday: 3, startTime: '13:30', durationMin: D60 }] },
  { name: "אנגלית עולים לד'+ה'", slots: [{ weekday: 0, startTime: '17:30', durationMin: D60 }, { weekday: 3, startTime: '17:30', durationMin: D60 }] },
  { name: "אנגלית עולים לו'+ז'", slots: [{ weekday: 0, startTime: '16:30', durationMin: D60 }, { weekday: 3, startTime: '16:30', durationMin: D60 }] },
  { name: "מתמטיקה עולים לג'+ד'", slots: [{ weekday: 2, startTime: '15:30', durationMin: D60 }] },
  { name: 'סדנת כישורי שפה (ד-ה)', slots: [{ weekday: 2, startTime: '14:00', durationMin: D180 }] },
  { name: "בנות אנגלית עולות לה'", slots: [{ weekday: 2, startTime: '17:30', durationMin: D60 }] },
];

/** Canonical in-window occurrence start instants for one weekly slot (Jul 2..29). */
function canonicalWindowStarts(weekday: number, startTime: string): Date[] {
  const out: Date[] = [];
  const startMs = WINDOW_START_INSTANT.getTime();
  const endMs = WINDOW_END_EXCLUSIVE_INSTANT.getTime();
  // Walk each calendar date in the window; keep matching weekdays.
  for (
    let cursor = new Date(WINDOW_START_INSTANT.getTime());
    cursor.getTime() < endMs;
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
  ) {
    const dateStr = toILDateStr(cursor);
    if (ilWeekdayOf(dateStr) !== weekday) continue;
    const occ = parseILDateTime(dateStr, startTime);
    if (occ.getTime() >= startMs && occ.getTime() < endMs) out.push(occ);
  }
  return out;
}

/** Weekday (0=Sun..6=Sat) of a yyyy-MM-dd string, timezone-agnostic on the date. */
function ilWeekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function inWindow(d: Date): boolean {
  return (
    d.getTime() >= WINDOW_START_INSTANT.getTime() &&
    d.getTime() < WINDOW_END_EXCLUSIVE_INSTANT.getTime()
  );
}

interface SlotReport {
  weekday: number;
  startTime: string;
  durationMin: number;
  dates: string[]; // yyyy-MM-dd of surviving in-window sessions
  deleted: number; // out-of-window sessions deleted
  calendarEventId: string | null;
  calendarRebuilt: boolean;
  calendarError?: string;
}

interface GroupReport {
  name: string;
  status: 'created' | 'skipped' | 'error';
  groupId?: string;
  monthlyPrice?: number;
  maxMembers?: number;
  sessionsCreated?: number; // surviving in-window group_session count
  slots?: SlotReport[];
  error?: string;
}

/**
 * Reconciles every weekly slot of a freshly-created group to its canonical
 * in-window occurrence set. Returns one SlotReport per recurrence (slot).
 */
async function reconcileGroupSlots(
  groupId: string,
  groupName: string,
  location: string | undefined,
): Promise<SlotReport[]> {
  // All group_session lessons for this group, in time order.
  const allLessons = await db
    .select()
    .from(lessons)
    .where(and(eq(lessons.groupId, groupId), eq(lessons.type, 'group_session')))
    .orderBy(asc(lessons.startsAt));

  // Group by recurrenceId (one per slot).
  const byRecurrence = new Map<string, typeof allLessons>();
  for (const l of allLessons) {
    const key = l.recurrenceId ?? 'none';
    if (!byRecurrence.has(key)) byRecurrence.set(key, []);
    byRecurrence.get(key)!.push(l);
  }

  const reports: SlotReport[] = [];

  for (const [recurrenceId, slotLessons] of byRecurrence) {
    // Load the recurrence template to know weekday / startTime / durationMin.
    const recRows = await db
      .select()
      .from(recurrences)
      .where(eq(recurrences.id, recurrenceId))
      .limit(1);
    const rec = recRows[0];
    const weekday = rec?.weekday ?? slotLessons[0]?.startsAt.getUTCDay() ?? 0;
    const startTime = rec ? rec.startTime.slice(0, 5) : toILTimeStr(slotLessons[0].startsAt);
    const durationMin =
      rec?.durationMin ??
      Math.round((slotLessons[0].endsAt.getTime() - slotLessons[0].startsAt.getTime()) / 60000);

    const inWin = slotLessons.filter((l) => inWindow(l.startsAt));
    const outWin = slotLessons.filter((l) => !inWindow(l.startsAt));

    // Delete out-of-window group_session rows.
    for (const l of outWin) {
      await db.delete(lessons).where(eq(lessons.id, l.id));
    }

    // Rebuild the recurring Google event so it is anchored on the first
    // in-window occurrence with COUNT = in-window count. We always rebuild when
    // there were out-of-window occurrences (the original anchor/COUNT may be
    // wrong); when perfectly bounded already we leave the original event in
    // place.
    const oldEventIds = Array.from(
      new Set(slotLessons.map((l) => l.googleEventId).filter((x): x is string => !!x)),
    );
    const canonical = canonicalWindowStarts(weekday, startTime);

    let calendarEventId: string | null = inWin[0]?.googleEventId ?? null;
    let calendarRebuilt = false;
    let calendarError: string | undefined;

    const needsRebuild = outWin.length > 0 || oldEventIds.length !== 1 || canonical.length === 0;

    if (canonical.length > 0 && (needsRebuild || oldEventIds.length === 0)) {
      try {
        // Cancel the old (mis-bounded) recurring event(s).
        for (const eid of oldEventIds) {
          await cancelEvent(eid);
        }
        const first = canonical[0];
        const firstEnd = new Date(first.getTime() + durationMin * 60 * 1000);
        const eventInput: EventInput = {
          summary: `קבוצה – ${groupName}`,
          startISO: first.toISOString(),
          endISO: firstEnd.toISOString(),
          location: location || undefined,
          extendedPrivate: {
            type: 'group',
            recurrenceId,
            groupId,
          },
        };
        const rrule = `RRULE:FREQ=WEEKLY;BYDAY=${RRULE_DAYS[weekday]};COUNT=${canonical.length}`;
        const evt = await insertRecurringEvent(eventInput, rrule);
        calendarEventId = evt.id;
        calendarRebuilt = true;
        // Re-point every surviving in-window lesson to the rebuilt event.
        for (const l of inWin) {
          await db
            .update(lessons)
            .set({ googleEventId: evt.id })
            .where(eq(lessons.id, l.id));
        }
      } catch (err) {
        calendarError = err instanceof Error ? err.message : String(err);
      }
    }

    reports.push({
      weekday,
      startTime,
      durationMin,
      dates: inWin.map((l) => toILDateStr(l.startsAt)).sort(),
      deleted: outWin.length,
      calendarEventId,
      calendarRebuilt,
      calendarError,
    });
  }

  return reports;
}

async function main() {
  const settings = await getSettings();
  const location = settings.locationAddress || undefined; // may be null/empty — fine

  // createGroup requires a non-empty location string. Fall back to a placeholder
  // only for that NOT-NULL column when settings has none; the recurring event &
  // session location then mirror the group location (empty → undefined).
  const groupLocation = (location && location.trim()) || 'אילנית';

  console.log('[seed-summer-groups] start');
  console.log(`  window: ${WINDOW_START} .. ${WINDOW_END} (IL)`);
  console.log(`  monthlyPrice=${MONTHLY_PRICE} maxMembers=${MAX_MEMBERS} horizonDays=${HORIZON_DAYS}`);
  console.log(`  location(settings)=${JSON.stringify(location ?? null)} groupLocation=${JSON.stringify(groupLocation)}`);

  // Existing group names (idempotency).
  const existing = await db.select({ name: groups.name }).from(groups);
  const existingNames = new Set(existing.map((g) => g.name.trim()));

  const reports: GroupReport[] = [];

  for (const def of GROUP_DEFS) {
    const name = def.name.trim();
    if (existingNames.has(name)) {
      console.log(`[skip] "${name}" — already exists`);
      reports.push({ name, status: 'skipped' });
      continue;
    }

    try {
      const schedule: WeeklyScheduleInput[] = def.slots.map((s) => ({
        weekday: s.weekday,
        startTime: s.startTime,
        durationMin: s.durationMin,
        horizonDays: HORIZON_DAYS,
      }));

      const { group } = await createGroupWithSchedule(
        {
          name,
          monthlyPrice: MONTHLY_PRICE,
          location: groupLocation,
          maxMembers: MAX_MEMBERS,
        },
        schedule,
      );

      const slotReports = await reconcileGroupSlots(group.id, group.name, group.location);
      const sessionsCreated = slotReports.reduce((acc, s) => acc + s.dates.length, 0);

      console.log(
        `[created] "${name}" id=${group.id} sessions=${sessionsCreated} slots=${slotReports.length}`,
      );
      for (const s of slotReports) {
        console.log(
          `    slot wd=${s.weekday} ${s.startTime} (${s.durationMin}m): ` +
            `${s.dates.length} sessions [${s.dates.join(', ')}] deleted=${s.deleted} ` +
            `calEvent=${s.calendarEventId ?? 'NONE'} rebuilt=${s.calendarRebuilt}` +
            (s.calendarError ? ` CAL_ERROR=${s.calendarError}` : ''),
        );
      }

      reports.push({
        name,
        status: 'created',
        groupId: group.id,
        monthlyPrice: group.monthlyPrice,
        maxMembers: group.maxMembers,
        sessionsCreated,
        slots: slotReports,
      });
      existingNames.add(name);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[error] "${name}" — ${message}`);
      reports.push({ name, status: 'error', error: message });
    }
  }

  // ── Final summary (re-queried from DB for ground truth) ─────────────────────
  console.log('\n========== SUMMARY ==========');
  for (const def of GROUP_DEFS) {
    const name = def.name.trim();
    const rep = reports.find((r) => r.name === name);
    if (!rep) continue;
    if (rep.status === 'skipped') {
      console.log(`SKIPPED   "${name}"`);
      continue;
    }
    if (rep.status === 'error') {
      console.log(`ERROR     "${name}" — ${rep.error}`);
      continue;
    }

    // Re-query the DB for the authoritative session list.
    const sessions = await db
      .select({
        startsAt: lessons.startsAt,
        googleEventId: lessons.googleEventId,
      })
      .from(lessons)
      .where(and(eq(lessons.groupId, rep.groupId!), eq(lessons.type, 'group_session')))
      .orderBy(asc(lessons.startsAt));

    const dates = sessions.map((s) => toILDateStr(s.startsAt));
    const allInWindow = sessions.every((s) => inWindow(s.startsAt));
    const calEventIds = Array.from(
      new Set(sessions.map((s) => s.googleEventId).filter((x): x is string => !!x)),
    );

    console.log(
      `CREATED   "${name}"\n` +
        `          monthlyPrice=${rep.monthlyPrice}  maxMembers=${rep.maxMembers}\n` +
        `          group_session lessons=${sessions.length}  allWithinJul2-29=${allInWindow}\n` +
        `          dates=[${dates.join(', ')}]\n` +
        `          calendarEventIds=[${calEventIds.join(', ') || 'NONE'}] (count=${calEventIds.length})`,
    );
  }

  const created = reports.filter((r) => r.status === 'created').length;
  const skipped = reports.filter((r) => r.status === 'skipped').length;
  const errored = reports.filter((r) => r.status === 'error').length;
  console.log(`\nTotals: created=${created} skipped=${skipped} errors=${errored}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed-summer-groups] fatal:', err);
    process.exit(1);
  });
