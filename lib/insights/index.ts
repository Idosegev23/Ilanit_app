import OpenAI from 'openai';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { insightsCache, type InsightsCache } from '@/db/schema';
import { env } from '@/lib/env';
import { nowIL } from '@/lib/time';
import { buildStatsForPeriod } from '@/lib/insights/metrics';
import type { AnonymizedStats } from '@/lib/insights/aggregates';

// AI insights (spec §5.5): build ANONYMIZED aggregates (first names only) →
// OpenAI (model from env OPENAI_MODEL, default gpt-5.4) → actionable Hebrew
// insights → cache in insights_cache. The OpenAI SDK is mocked in unit tests.

/** Cache key for a given trailing period (e.g. "30d"). */
export function periodKey(periodDays: number): string {
  return `${periodDays}d`;
}

const SYSTEM_PROMPT =
  'את יועצת עסקית למורה פרטית בישראל. תקבלי נתונים מספריים מצטברים (אנונימיים, ' +
  'שמות פרטיים בלבד) על השיעורים, ההכנסות והתפוסה. החזירי תובנות קצרות, מעשיות ' +
  'וברורות בעברית — דגש על ייעול הלו"ז, הגדלת הכנסות, גביית חובות ושימור תלמידים. ' +
  'כתבי 3 עד 6 נקודות (bullet) קצרות, כל אחת ממוקדת ופעולתית. ללא הקדמות מיותרות.';

/** Builds the user message describing the anonymized stats for the model. */
export function buildUserPrompt(stats: AnonymizedStats): string {
  const lines: string[] = [];
  lines.push(`תקופה: ${stats.periodDays} ימים אחרונים.`);
  lines.push(`הכנסות ששולמו בפועל: ${stats.totalRevenue} ש"ח (${stats.paidCount} תשלומים).`);
  lines.push(
    `חובות פתוחים: ${stats.outstandingAmount} ש"ח (${stats.outstandingCount} תשלומים שטרם שולמו).`,
  );
  lines.push(`אחוז תפוסה: ${stats.occupancyPct}%.`);
  lines.push(`תלמידים פעילים: ${stats.activeStudents}.`);

  const byStatus = Object.entries(stats.lessonsByStatus)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
  lines.push(`שיעורים לפי סטטוס: ${byStatus || 'אין'}.`);

  const byWeekday = stats.weekdayDistribution
    .filter((d) => d.count > 0)
    .map((d) => `${d.label}: ${d.count}`)
    .join(', ');
  lines.push(`התפלגות שיעורים לפי יום: ${byWeekday || 'אין'}.`);

  const byHour = stats.hourDistribution.map((h) => `${h.hour}:00 → ${h.count}`).join(', ');
  lines.push(`התפלגות שיעורים לפי שעה: ${byHour || 'אין'}.`);

  const top = stats.topStudents
    .map((t) => `${t.firstName} (${t.lessons} שיעורים, ${t.revenue} ש"ח)`)
    .join('; ');
  lines.push(`תלמידים מובילים: ${top || 'אין'}.`);

  lines.push('הפיקי תובנות מעשיות בעברית על בסיס הנתונים הללו.');
  return lines.join('\n');
}

/** Lazily-created OpenAI client (env read at call time, never at import). */
function openaiClient(): OpenAI {
  return new OpenAI({ apiKey: env().OPENAI_API_KEY });
}

/**
 * Calls OpenAI with the anonymized stats and returns the Hebrew insight text.
 * Throws on API failure so the caller can decide whether to surface or degrade.
 */
async function requestInsightText(stats: AnonymizedStats, model: string): Promise<string> {
  const client = openaiClient();
  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(stats) },
    ],
    temperature: 0.4,
  });
  const text = completion.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('OpenAI returned empty insights');
  return text;
}

/**
 * Generates fresh AI insights for the trailing `periodDays`, persists them to
 * `insights_cache`, and returns the stats + Hebrew text. Implements the
 * foundation contract `generateInsights(periodDays)`.
 */
export async function generateInsights(
  periodDays: number,
): Promise<{ stats: AnonymizedStats; text: string }> {
  const model = env().OPENAI_MODEL;
  const stats = await buildStatsForPeriod(periodDays);
  const text = await requestInsightText(stats, model);

  await db.insert(insightsCache).values({
    period: periodKey(periodDays),
    stats,
    aiText: text,
    model,
    generatedAt: nowIL(),
  });

  return { stats, text };
}

export interface CachedInsight {
  period: string;
  stats: AnonymizedStats;
  text: string;
  model: string;
  generatedAt: Date;
}

/**
 * Returns the most recent cached insight for the period, or null if none has
 * been generated yet. Used by the dashboard to render without an API call.
 */
export async function getCachedInsights(periodDays: number): Promise<CachedInsight | null> {
  const rows = await db
    .select()
    .from(insightsCache)
    .where(eq(insightsCache.period, periodKey(periodDays)))
    .orderBy(desc(insightsCache.generatedAt))
    .limit(1);
  const row = rows[0] as InsightsCache | undefined;
  if (!row) return null;
  return {
    period: row.period,
    stats: row.stats as AnonymizedStats,
    text: row.aiText,
    model: row.model,
    generatedAt: row.generatedAt,
  };
}
