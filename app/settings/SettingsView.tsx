'use client';

import * as React from 'react';
import { AlertCircle, Check, Save } from 'lucide-react';
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

// Client orchestrator for the settings page. Holds the editable state for the
// business settings, the weekly availability template and the date exceptions,
// then PUTs the whole payload to /api/settings on save.
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

  return (
    <div className="space-y-6">
      <AvailabilityEditor windows={windows} onChange={handleWindows} />
      <ExceptionsEditor exceptions={exceptions} onChange={handleExceptions} />
      <BusinessSettingsForm values={settings} onChange={handleSettings} />

      {/* Sticky save bar — feedback lives next to the action. */}
      <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-2xl border border-line bg-surface/95 p-4 shadow-card backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div aria-live="polite" className="min-h-6 text-sm">
          {save.kind === 'saved' && (
            <span className="inline-flex items-center gap-1.5 font-medium text-success">
              <Check className="size-4" aria-hidden="true" />
              ההגדרות נשמרו
            </span>
          )}
          {save.kind === 'error' && (
            <span className="inline-flex items-center gap-1.5 font-medium text-danger">
              <AlertCircle className="size-4" aria-hidden="true" />
              {save.message}
            </span>
          )}
          {(save.kind === 'idle' || save.kind === 'saving') && (
            <span className="text-muted">
              שמירה מעדכנת את הזמנים בלינק התיאום הציבורי.
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
