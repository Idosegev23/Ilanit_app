'use client';

import * as React from 'react';
import {
  CalendarX2,
  CalendarOff,
  Plane,
  Clock,
  Trash2,
  AlertCircle,
  Plus,
  Info,
} from 'lucide-react';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/ui/empty-state';
import type { BlockRow } from '@/lib/availability/blocks';
import {
  fetchBlocks,
  blockFullDayAction,
  blockRangeAction,
  blockWindowAction,
  removeBlockAction,
} from './actions';

const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'] as const;

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function dateLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y) return iso;
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `יום ${WEEKDAYS[wd]}, ${d}.${m}.${y}`;
}

export function AvailabilityView({ initialBlocks }: { initialBlocks: BlockRow[] }) {
  const [blocks, setBlocks] = React.useState<BlockRow[]>(initialBlocks);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // full-day form
  const [dayDate, setDayDate] = React.useState(todayISO());
  // range form
  const [fromDate, setFromDate] = React.useState(todayISO());
  const [toDate, setToDate] = React.useState(todayISO());
  // window form
  const [winDate, setWinDate] = React.useState(todayISO());
  const [winStart, setWinStart] = React.useState('16:00');
  const [winEnd, setWinEnd] = React.useState('17:00');

  const refresh = React.useCallback(async () => {
    try {
      setBlocks(await fetchBlocks());
    } catch {
      /* keep current */
    }
  }, []);

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(key);
    setError(null);
    try {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? 'הפעולה נכשלה');
        return;
      }
      await refresh();
    } catch {
      setError('שגיאה — נסי שוב');
    } finally {
      setBusy(null);
    }
  }

  const grouped = React.useMemo(() => {
    const map = new Map<string, BlockRow[]>();
    for (const b of blocks) {
      const arr = map.get(b.date) ?? [];
      arr.push(b);
      map.set(b.date, arr);
    }
    return Array.from(map.entries());
  }, [blocks]);

  return (
    <div className="space-y-6">
      {/* Model explainer */}
      <div className="flex items-start gap-3 rounded-2xl border border-primary-100 bg-gradient-tint p-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface text-primary-600 shadow-soft">
          <Info className="size-5" aria-hidden="true" />
        </span>
        <p className="text-sm leading-relaxed text-muted">
          בתוך <span className="font-semibold text-ink">שעות הפעילות</span> (נקבעות ב״הגדרות״) הכל
          פתוח לתיאום — חוץ משיעורים שכבר נקבעו וממה שתחסמי כאן. חסימה גוברת ומורידה את השעות
          מהלינק הציבורי.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Block a time window */}
        <Card className="overflow-hidden">
          <CardHeader variant="gradient">
            <CardTitle className="flex items-center gap-2.5 text-base">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary-soft text-primary-600 shadow-soft">
                <Clock className="size-5" aria-hidden="true" />
              </span>
              חסימת שעות ביום
            </CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="win-date">תאריך</Label>
              <Input
                id="win-date"
                type="date"
                value={winDate}
                onChange={(e) => setWinDate(e.target.value)}
                className="tabular-nums"
              />
            </div>
            <div className="flex items-end gap-2" dir="ltr">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="win-start">מ־</Label>
                <Input
                  id="win-start"
                  type="time"
                  value={winStart}
                  onChange={(e) => setWinStart(e.target.value)}
                />
              </div>
              <span className="pb-3 text-muted">–</span>
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="win-end">עד</Label>
                <Input
                  id="win-end"
                  type="time"
                  value={winEnd}
                  onChange={(e) => setWinEnd(e.target.value)}
                />
              </div>
            </div>
            <Button
              type="button"
              className="w-full"
              loading={busy === 'window'}
              onClick={() => run('window', () => blockWindowAction(winDate, winStart, winEnd))}
            >
              <Plus className="size-4" aria-hidden="true" />
              חסום שעות אלו
            </Button>
          </CardBody>
        </Card>

        {/* Block a full day */}
        <Card className="overflow-hidden">
          <CardHeader variant="gradient">
            <CardTitle className="flex items-center gap-2.5 text-base">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary-soft text-primary-600 shadow-soft">
                <CalendarOff className="size-5" aria-hidden="true" />
              </span>
              סגירת יום מלא
            </CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="day-date">תאריך</Label>
              <Input
                id="day-date"
                type="date"
                value={dayDate}
                onChange={(e) => setDayDate(e.target.value)}
                className="tabular-nums"
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              loading={busy === 'day'}
              onClick={() => run('day', () => blockFullDayAction(dayDate))}
            >
              <CalendarX2 className="size-4" aria-hidden="true" />
              סגור את כל היום
            </Button>
          </CardBody>
        </Card>

        {/* Block a date range (vacation) */}
        <Card className="overflow-hidden">
          <CardHeader variant="gradient">
            <CardTitle className="flex items-center gap-2.5 text-base">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary-soft text-primary-600 shadow-soft">
                <Plane className="size-5" aria-hidden="true" />
              </span>
              סגירת תקופה (חופשה)
            </CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="from-date">מתאריך</Label>
              <Input
                id="from-date"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="to-date">עד תאריך</Label>
              <Input
                id="to-date"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="tabular-nums"
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              loading={busy === 'range'}
              onClick={() => run('range', () => blockRangeAction(fromDate, toDate))}
            >
              <Plane className="size-4" aria-hidden="true" />
              סגור את התקופה
            </Button>
          </CardBody>
        </Card>
      </div>

      {/* Upcoming blocks */}
      <Card className="overflow-hidden">
        <CardHeader variant="gradient">
          <CardTitle className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary-soft text-primary-600 shadow-soft">
              <CalendarX2 className="size-5" aria-hidden="true" />
            </span>
            חסימות קרובות
          </CardTitle>
          <CardDescription className="ps-[46px]">
            כל מה שסגור בטווח הקרוב. אפשר להסיר חסימה כדי לפתוח מחדש.
          </CardDescription>
        </CardHeader>
        <CardBody>
          {grouped.length === 0 ? (
            <EmptyState
              icon={CalendarX2}
              title="אין חסימות"
              description="כל שעות הפעילות פתוחות לתיאום (חוץ משיעורים שנקבעו)."
            />
          ) : (
            <ul className="space-y-3">
              {grouped.map(([date, rows]) => (
                <li key={date} className="rounded-2xl border border-line bg-surface p-3.5 shadow-soft">
                  <p className="mb-2 text-sm font-bold text-ink">{dateLabel(date)}</p>
                  <ul className="space-y-1.5">
                    {rows.map((b) => (
                      <li
                        key={b.id}
                        className="flex items-center gap-2 rounded-xl bg-surface-2/50 px-3 py-2"
                      >
                        {b.kind === 'full_day' ? (
                          <>
                            <CalendarOff className="size-4 shrink-0 text-danger" aria-hidden="true" />
                            <span className="text-sm font-medium text-ink">כל היום חסום</span>
                          </>
                        ) : (
                          <>
                            <Clock className="size-4 shrink-0 text-primary-600" aria-hidden="true" />
                            <span className="text-sm font-medium text-ink" dir="ltr">
                              {b.startTime}–{b.endTime}
                            </span>
                            <span className="text-sm text-muted">חסום</span>
                          </>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="ms-auto text-danger hover:bg-danger-soft"
                          loading={busy === `rm-${b.id}`}
                          onClick={() => run(`rm-${b.id}`, () => removeBlockAction(b.id))}
                          aria-label="הסר חסימה"
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                          הסר
                        </Button>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
