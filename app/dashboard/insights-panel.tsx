'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toBullets } from './format';

// AI insights panel. Renders the cached Hebrew insight text and lets Ilanit
// trigger a fresh generation via POST /api/insights. The expensive OpenAI call
// is never made on page load — only on explicit regenerate.

export interface InsightsPanelProps {
  periodDays: number;
  initialText: string | null;
  initialGeneratedAt: string | null; // pre-formatted Hebrew date string
  initialModel: string | null;
}

export function InsightsPanel({
  periodDays,
  initialText,
  initialGeneratedAt,
  initialModel,
}: InsightsPanelProps) {
  const [text, setText] = useState<string | null>(initialText);
  const [generatedAt, setGeneratedAt] = useState<string | null>(initialGeneratedAt);
  const [model, setModel] = useState<string | null>(initialModel);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function regenerate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ periodDays }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(body?.detail || 'יצירת התובנות נכשלה');
      }
      const data = (await res.json()) as { text: string };
      setText(data.text);
      setGeneratedAt(new Intl.DateTimeFormat('he-IL', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'Asia/Jerusalem',
      }).format(new Date()));
      setModel('gpt-5.4');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה לא צפויה');
    } finally {
      setLoading(false);
    }
  }

  const bullets = text ? toBullets(text) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-slate-500">
          {generatedAt ? (
            <span>
              עודכן {generatedAt}
              {model ? ` · ${model}` : ''}
            </span>
          ) : (
            <span>טרם הופקו תובנות</span>
          )}
        </div>
        <Button size="sm" onClick={regenerate} disabled={loading}>
          {loading ? 'מפיק תובנות…' : 'הפק תובנות חדשות'}
        </Button>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {bullets.length > 0 ? (
        <ul className="list-disc space-y-2 pr-5 text-sm text-slate-700 marker:text-brand">
          {bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      ) : (
        !error && (
          <p className="text-sm text-slate-500">
            לחצי על &quot;הפק תובנות חדשות&quot; כדי לקבל ניתוח AI של הלו&quot;ז וההכנסות.
          </p>
        )
      )}
    </div>
  );
}
