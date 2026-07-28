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
 * fully opaque white surface, so ink/muted text always clears WCAG AA no matter
 * what the aurora is doing behind the band. The glyph uses primary-700, not
 * primary: #f493be on white is 2.15:1, below the 3:1 a meaningful icon needs.
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
    // Stacks on the phone: at 390px a 2-up row leaves ~90px beside the glyph,
    // which would truncate every label. From `sm:` it becomes a side-by-side.
    <div className="hover-lift group flex flex-col items-start gap-2.5 rounded-2xl border border-white/70 bg-surface px-4 py-3.5 shadow-card sm:flex-row sm:items-center sm:gap-3.5">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-700 shadow-soft ring-1 ring-inset ring-white/70">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium leading-snug text-muted">{label}</p>
        <p className="text-2xl font-extrabold leading-tight tracking-tight tabular-nums text-ink">
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
          v4 replaces the v3 warm-gradient-plus-rescue-scrim composition with a
          glass panel: the live aurora reads straight through it, and every glyph
          of copy is ink on near-white (13.4:1) instead of white on a mid-tone
          gradient that needed a darkening layer to survive AA.

          `.blob` is z-index 0, so the real content carries `relative z-10`. */}
      <section className="glass rise relative overflow-hidden rounded-[28px] p-6 shadow-pop sm:p-9">
        <div
          aria-hidden="true"
          className="blob -top-24 end-[-4rem] size-64 bg-primary"
        />
        <div
          aria-hidden="true"
          className="blob bottom-[-5rem] start-[-3rem] size-56 bg-accent"
        />

        <div className="relative z-10">
          {/* Brand lockup — wordmark + calendar-heart mark. */}
          <div className="flex items-center gap-2.5">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-fg shadow-glow">
              <CalendarHeart className="size-5" aria-hidden="true" />
            </span>
            <span className="text-lg font-extrabold tracking-tight text-ink">
              אילנית
            </span>
          </div>

          <div className="mt-6 max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-700">
              תצוגה מהירה של ההגדרות
            </p>
            <p className="mt-2.5 text-lg font-medium leading-relaxed text-ink sm:text-xl">
              כך נראית הזמינות שלך כרגע. כל שינוי כאן משפיע ישירות על הסלוטים
              והמחירים שתלמידים רואים בלינק התיאום.
            </p>
          </div>

          <div className="mt-7 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
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

      <div className="stagger space-y-8">
        <AvailabilityEditor windows={windows} onChange={handleWindows} />
        <ExceptionsEditor exceptions={exceptions} windows={windows} onChange={handleExceptions} />
        <BusinessSettingsForm values={settings} onChange={handleSettings} />
      </div>

      {/* Sticky save bar — feedback lives next to the action, floating on glass
          so the aurora keeps moving underneath the shelf. */}
      <div className="glass-strong sticky bottom-4 z-20 flex flex-col gap-3 rounded-3xl p-4 shadow-pop sm:flex-row sm:items-center sm:justify-between sm:ps-6">
        <div aria-live="polite" className="min-h-6 text-sm">
          {save.kind === 'saved' && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1.5 font-bold text-success">
              <Check className="size-4" aria-hidden="true" />
              ההגדרות נשמרו
            </span>
          )}
          {save.kind === 'error' && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-danger-soft px-3 py-1.5 font-bold text-danger"
              role="alert"
            >
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
        {/* The one highest-emphasis action on the page → the ink variant. */}
        <Button
          type="button"
          variant="ink"
          size="lg"
          onClick={onSave}
          loading={saving}
          className="w-full sm:w-auto"
        >
          {!saving && <Save className="size-5" aria-hidden="true" />}
          שמירת הגדרות
        </Button>
      </div>
    </div>
  );
}
