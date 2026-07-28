'use client';

import { useState, type CSSProperties } from 'react';
import { Sparkles, AlertCircle, Clock3 } from 'lucide-react';
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Provenance chip — quiet, but present, so "how fresh is this?" is answerable. */}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1.5 text-xs tabular-nums text-muted ring-1 ring-inset ring-white/60">
          <Clock3 className="size-3.5 shrink-0" aria-hidden="true" />
          {generatedAt ? (
            <span dir="rtl">
              עודכן {generatedAt}
              {model ? ` · ${model}` : ''}
            </span>
          ) : (
            <span>טרם הופקו תובנות</span>
          )}
        </span>
        <Button size="md" onClick={regenerate} loading={loading} className="w-full sm:w-auto">
          <Sparkles className="size-4" aria-hidden="true" />
          {loading ? 'מפיק תובנות…' : 'הפק תובנות חדשות'}
        </Button>
      </div>

      {error && (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger ring-1 ring-inset ring-white/50"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {bullets.length > 0 ? (
        /*
          Each insight is its own soft card rather than a `list-disc` row: the
          native marker inherits `color`, and a pink marker on white is 2.15:1.
          A drawn dot is decorative, sits on a ring, and can carry the blush.
        */
        <ul className="stagger space-y-2.5">
          {bullets.map((b, i) => (
            <li
              key={i}
              style={{ '--i': i } as CSSProperties}
              className="flex items-start gap-3 rounded-2xl border border-line bg-white/70 px-4 py-3 text-sm leading-relaxed text-ink shadow-soft backdrop-blur transition-shadow duration-200 hover:shadow-card"
            >
              <span
                aria-hidden="true"
                className="mt-[9px] size-2 shrink-0 rounded-full bg-primary ring-2 ring-primary-100"
              />
              <span className="min-w-0">{b}</span>
            </li>
          ))}
        </ul>
      ) : (
        !error && (
          <p className="rounded-2xl border border-dashed border-line bg-primary-50/50 px-4 py-6 text-center text-sm text-muted">
            לחצי על &quot;הפק תובנות חדשות&quot; כדי לקבל ניתוח AI של הלו&quot;ז וההכנסות.
          </p>
        )
      )}
    </div>
  );
}
