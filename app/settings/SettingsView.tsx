'use client';

import * as React from 'react';
import {
  AlertCircle,
  CalendarCheck2,
  CalendarHeart,
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

/**
 * A single live summary chip in the settings hero band. The chip sits on a
 * fully opaque white surface (not a translucent tint over the gradient), so the
 * ink/muted text always clears WCAG AA regardless of the gradient stop behind
 * it. A soft hover-lift gives the band tactile depth.
 */
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
    <div className="hover-lift group flex items-center gap-3.5 rounded-2xl border border-white/40 bg-surface px-4 py-3.5 shadow-card ring-1 ring-black/[0.03]">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-tint text-primary-600 shadow-soft ring-1 ring-primary-100">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-muted">{label}</p>
        <p className="text-xl font-extrabold leading-tight tabular-nums text-ink">
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
    <div className="space-y-10">
      {/* ── Hero overview band ──────────────────────────────────────────────
          Premium full-bleed warm composition: brand mark + value prop + live
          figures. WCAG: the descriptive copy sits in a dedicated dark-terracotta
          scrim panel (not raw over the honey/peach stops), so full-opacity white
          text clears 4.5:1 across the whole region; the live-stat chips ride on
          opaque white surfaces. */}
      <section className="relative overflow-hidden rounded-[28px] bg-gradient-warm p-6 shadow-pop sm:p-9">
        {/* Decorative depth: dotted relief + soft blurred color blobs. */}
        <div aria-hidden="true" className="texture-dots absolute inset-0 opacity-50" />
        <div
          aria-hidden="true"
          className="blob -top-20 end-[-4rem] size-64 bg-[var(--grad-warm-3)]"
        />
        <div
          aria-hidden="true"
          className="blob bottom-[-5rem] start-[-3rem] size-56 bg-white/50"
        />
        {/* Inline-start vertical sheen for a crafted, lit edge. */}
        <div
          aria-hidden="true"
          className="absolute inset-y-0 start-0 w-1/3 bg-gradient-to-l from-transparent to-white/10"
        />

        <div className="relative">
          {/* Brand lockup — wordmark + calendar-heart mark. */}
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-white/20 text-white shadow-soft ring-1 ring-white/30 backdrop-blur-sm">
              <CalendarHeart className="size-5" aria-hidden="true" />
            </span>
            <span className="text-lg font-extrabold tracking-tight text-white drop-shadow-sm">
              אילנית
            </span>
          </div>

          {/* Copy lives in its own deep-teal scrim → guaranteed contrast. */}
          <div className="mt-5 max-w-2xl rounded-2xl bg-[#12302b]/60 p-5 ring-1 ring-white/10 backdrop-blur-[2px]">
            <p className="text-xs font-bold tracking-wide text-white">
              תצוגה מהירה של ההגדרות
            </p>
            <p className="mt-2 text-base font-medium leading-relaxed text-white">
              כך נראית הזמינות שלך כרגע. כל שינוי כאן משפיע ישירות על הסלוטים
              והמחירים שתלמידים רואים בלינק התיאום.
            </p>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
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

      <div className="space-y-8">
        <AvailabilityEditor windows={windows} onChange={handleWindows} />
        <ExceptionsEditor exceptions={exceptions} windows={windows} onChange={handleExceptions} />
        <BusinessSettingsForm values={settings} onChange={handleSettings} />
      </div>

      {/* Sticky save bar — feedback lives next to the action, raised on a soft
          ring + warm shadow so it reads as a floating action shelf. */}
      <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-2xl border border-white/60 bg-surface/95 p-4 shadow-pop ring-1 ring-primary-100/60 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
        <div aria-live="polite" className="min-h-6 text-sm">
          {save.kind === 'saved' && (
            <span className="inline-flex items-center gap-1.5 font-semibold text-success">
              <Check className="size-4" aria-hidden="true" />
              ההגדרות נשמרו
            </span>
          )}
          {save.kind === 'error' && (
            <span className="inline-flex items-center gap-1.5 font-semibold text-danger" role="alert">
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
        <Button
          type="button"
          variant="gradient"
          size="lg"
          onClick={onSave}
          loading={saving}
          className="sm:w-auto"
        >
          {!saving && <Save className="size-5" aria-hidden="true" />}
          שמירת הגדרות
        </Button>
      </div>
    </div>
  );
}
