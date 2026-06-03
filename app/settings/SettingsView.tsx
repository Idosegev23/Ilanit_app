'use client';

import * as React from 'react';
import {
  AlertCircle,
  CalendarCheck2,
  CalendarX2,
  Check,
  Clock,
  Save,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AvailabilityEditor } from './AvailabilityEditor';
import { ExceptionsEditor } from './ExceptionsEditor';
import { BusinessSettingsForm } from './BusinessSettingsForm';
import type {
  AvailabilityExceptionInput,
  AvailabilityWindow,
  SettingsPayload,
  SettingsValues,
} from './types';

interface SettingsViewProps {
  initialSettings: SettingsValues;
  initialAvailability: AvailabilityWindow[];
  initialExceptions: AvailabilityExceptionInput[];
}

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'error'; message: string };

/** A single live summary chip in the settings hero band. */
function SummaryStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface/85 px-4 py-3 shadow-soft backdrop-blur-sm">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-600 shadow-soft">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-muted">{label}</p>
        <p className="text-lg font-bold leading-tight tabular-nums text-ink">
          {value}
        </p>
      </div>
    </div>
  );
}

// Client orchestrator for the settings page. Holds the editable state for the
// business settings, the weekly availability template and the date exceptions,
// then PUTs the whole payload to /api/settings on save. A live overview band
// anchors the page so the editors never float in an empty void.
export function SettingsView({
  initialSettings,
  initialAvailability,
  initialExceptions,
}: SettingsViewProps) {
  const [settings, setSettings] = React.useState<SettingsValues>(initialSettings);
  const [windows, setWindows] = React.useState<AvailabilityWindow[]>(initialAvailability);
  const [exceptions, setExceptions] =
    React.useState<AvailabilityExceptionInput[]>(initialExceptions);
  const [save, setSave] = React.useState<SaveState>({ kind: 'idle' });

  // Reset the transient "saved" confirmation once the owner edits again.
  const touch = React.useCallback(() => {
    setSave((s) => (s.kind === 'idle' ? s : { kind: 'idle' }));
  }, []);

  const handleSettings = React.useCallback(
    (next: SettingsValues) => {
      touch();
      setSettings(next);
    },
    [touch],
  );

  const handleWindows = React.useCallback(
    (next: AvailabilityWindow[]) => {
      touch();
      setWindows(next);
    },
    [touch],
  );

  const handleExceptions = React.useCallback(
    (next: AvailabilityExceptionInput[]) => {
      touch();
      setExceptions(next);
    },
    [touch],
  );

  async function onSave() {
    setSave({ kind: 'saving' });
    const payload: SettingsPayload = { settings, availability: windows, exceptions };
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setSave({ kind: 'error', message: data.error ?? 'שמירת ההגדרות נכשלה' });
        return;
      }
      setSave({ kind: 'saved' });
    } catch {
      setSave({ kind: 'error', message: 'שגיאת רשת — נסי שוב' });
    }
  }

  const saving = save.kind === 'saving';

  // ── Live overview figures ──────────────────────────────────────────────
  const activeDays = React.useMemo(
    () => new Set(windows.filter((w) => w.active).map((w) => w.weekday)).size,
    [windows],
  );
  const activeWindows = React.useMemo(
    () => windows.filter((w) => w.active).length,
    [windows],
  );
  const priceLabel =
    settings.defaultPrivatePrice !== null &&
    Number.isFinite(settings.defaultPrivatePrice)
      ? `₪${settings.defaultPrivatePrice}`
      : '—';

  return (
    <div className="space-y-8">
      {/* ── Hero overview band — warm gradient, brand depth, live figures ── */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-warm p-6 shadow-pop sm:p-8">
        {/* Decorative soft blobs + dotted relief so the band has depth. */}
        <div aria-hidden="true" className="texture-dots absolute inset-0 opacity-40" />
        <div
          aria-hidden="true"
          className="blob -top-16 end-[-3rem] size-56 bg-[var(--grad-warm-3)]"
        />
        <div
          aria-hidden="true"
          className="blob bottom-[-4rem] start-[-2rem] size-48 bg-white/40"
        />
        <div className="relative">
          <p className="text-sm font-semibold text-white/90">
            תצוגה מהירה של ההגדרות
          </p>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-white/80">
            כך נראית הזמינות שלך כרגע. כל שינוי כאן משפיע ישירות על הסלוטים והמחירים
            שתלמידים רואים בלינק התיאום.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryStat
              icon={CalendarCheck2}
              label="ימים פעילים בשבוע"
              value={`${activeDays}/7`}
            />
            <SummaryStat
              icon={Clock}
              label="חלונות זמן פעילים"
              value={String(activeWindows)}
            />
            <SummaryStat
              icon={CalendarX2}
              label="חריגים מוגדרים"
              value={String(exceptions.length)}
            />
            <SummaryStat
              icon={Wallet}
              label="מחיר שיעור פרטי"
              value={priceLabel}
            />
          </div>
        </div>
      </section>

      <AvailabilityEditor windows={windows} onChange={handleWindows} />
      <ExceptionsEditor exceptions={exceptions} onChange={handleExceptions} />
      <BusinessSettingsForm values={settings} onChange={handleSettings} />

      {/* Sticky save bar — feedback lives next to the action. */}
      <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-2xl border border-line bg-surface/90 p-4 shadow-pop backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
        <div aria-live="polite" className="min-h-6 text-sm">
          {save.kind === 'saved' && (
            <span className="inline-flex items-center gap-1.5 font-medium text-success">
              <Check className="size-4" aria-hidden="true" />
              ההגדרות נשמרו
            </span>
          )}
          {save.kind === 'error' && (
            <span className="inline-flex items-center gap-1.5 font-medium text-danger" role="alert">
              <AlertCircle className="size-4" aria-hidden="true" />
              {save.message}
            </span>
          )}
          {(save.kind === 'idle' || save.kind === 'saving') && (
            <span className="text-muted">
              שמירה מעדכנת את הזמנים והמחירים בלינק התיאום הציבורי.
            </span>
          )}
        </div>
        <Button type="button" onClick={onSave} loading={saving} className="sm:w-auto">
          {!saving && <Save className="size-4" aria-hidden="true" />}
          שמירת הגדרות
        </Button>
      </div>
    </div>
  );
}
