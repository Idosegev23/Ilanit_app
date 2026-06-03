import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AnonymizedStats } from '@/lib/insights/aggregates';

// ── Mocks ────────────────────────────────────────────────────────────────────
// OpenAI SDK is mocked: a class whose instance exposes chat.completions.create.
const createMock = vi.fn();
vi.mock('openai', () => {
  return {
    default: class {
      chat = { completions: { create: createMock } };
      constructor(public opts: unknown) {}
    },
  };
});

// env() supplies the model + key without real secrets.
vi.mock('@/lib/env', () => ({
  env: () => ({ OPENAI_API_KEY: 'sk-test', OPENAI_MODEL: 'gpt-5.4' }),
}));

// time helper — deterministic.
vi.mock('@/lib/time', () => ({
  nowIL: () => new Date('2026-06-03T08:00:00.000Z'),
}));

// metrics layer — return a fixed anonymized stats payload.
const SAMPLE_STATS: AnonymizedStats = {
  periodDays: 30,
  totalRevenue: 2400,
  paidCount: 20,
  lessonsByStatus: { completed: 18, confirmed: 4, pending: 2 },
  activeStudents: 7,
  outstandingAmount: 360,
  outstandingCount: 3,
  occupancyPct: 55,
  revenueByDay: [{ date: '2026-06-01', amount: 240 }],
  lessonsPerWeek: [{ week: '2026-05-31', count: 6 }],
  weekdayDistribution: [
    { weekday: 0, label: 'ראשון', count: 3 },
    { weekday: 1, label: 'שני', count: 0 },
    { weekday: 2, label: 'שלישי', count: 4 },
    { weekday: 3, label: 'רביעי', count: 0 },
    { weekday: 4, label: 'חמישי', count: 0 },
    { weekday: 5, label: 'שישי', count: 0 },
    { weekday: 6, label: 'שבת', count: 0 },
  ],
  hourDistribution: [{ hour: 16, count: 5 }],
  topStudents: [{ firstName: 'דנה', lessons: 6, revenue: 720 }],
};
const buildStatsMock = vi.fn();
vi.mock('@/lib/insights/metrics', () => ({
  buildStatsForPeriod: (...args: unknown[]) => buildStatsMock(...args),
}));

// db — capture inserts and serve cached selects.
interface CacheRow {
  period: string;
  stats: unknown;
  aiText: string;
  model: string;
  generatedAt: Date;
}
const cacheStore: { rows: CacheRow[] } = { rows: [] };
let selectPredicate: ((r: CacheRow) => boolean) | null = null;

vi.mock('@/lib/db', () => ({
  db: {
    insert: () => ({
      values: (vals: CacheRow) => {
        cacheStore.rows.push(vals);
        return Promise.resolve([vals]);
      },
    }),
    select: () => ({
      from: () => ({
        where: (pred: (r: CacheRow) => boolean) => {
          selectPredicate = pred;
          return {
            orderBy: () => ({
              limit: () => {
                const filtered = cacheStore.rows
                  .filter((r) => (selectPredicate ? selectPredicate(r) : true))
                  // newest first
                  .sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime());
                return Promise.resolve(filtered.slice(0, 1));
              },
            }),
          };
        },
      }),
    }),
  },
}));

// drizzle eq → predicate matching the period column.
vi.mock('drizzle-orm', () => ({
  eq: (_col: unknown, val: string) => (r: CacheRow) => r.period === val,
  desc: (col: unknown) => col,
}));

vi.mock('@/db/schema', () => ({
  insightsCache: { period: { __k: 'period' }, generatedAt: { __k: 'generatedAt' } },
}));

import {
  generateInsights,
  getCachedInsights,
  buildUserPrompt,
  periodKey,
} from '@/lib/insights';

describe('periodKey', () => {
  it('formats the cache key', () => {
    expect(periodKey(30)).toBe('30d');
    expect(periodKey(7)).toBe('7d');
  });
});

describe('buildUserPrompt', () => {
  it('includes the headline figures and first names, no PII', () => {
    const prompt = buildUserPrompt(SAMPLE_STATS);
    expect(prompt).toContain('2400');
    expect(prompt).toContain('360');
    expect(prompt).toContain('55%');
    expect(prompt).toContain('דנה');
    expect(prompt).not.toMatch(/@|\+972|05\d{8}/);
  });
});

describe('generateInsights', () => {
  beforeEach(() => {
    createMock.mockReset();
    buildStatsMock.mockReset();
    cacheStore.rows = [];
    selectPredicate = null;
    buildStatsMock.mockResolvedValue(SAMPLE_STATS);
  });

  it('calls OpenAI with the configured model + system/user messages, caches result', async () => {
    createMock.mockResolvedValue({
      choices: [{ message: { content: '• הגדילי שיעורים בימי שלישי\n• גבי חובות פתוחים' } }],
    });

    const result = await generateInsights(30);

    // model + message structure
    expect(createMock).toHaveBeenCalledTimes(1);
    const callArg = createMock.mock.calls[0][0];
    expect(callArg.model).toBe('gpt-5.4');
    expect(callArg.messages[0].role).toBe('system');
    expect(callArg.messages[1].role).toBe('user');
    expect(callArg.messages[1].content).toContain('2400');

    // returned + cached
    expect(result.text).toContain('הגדילי שיעורים');
    expect(result.stats).toEqual(SAMPLE_STATS);
    expect(cacheStore.rows).toHaveLength(1);
    expect(cacheStore.rows[0]).toMatchObject({
      period: '30d',
      model: 'gpt-5.4',
      aiText: result.text,
      stats: SAMPLE_STATS,
    });
  });

  it('throws and does not cache when OpenAI returns empty content', async () => {
    createMock.mockResolvedValue({ choices: [{ message: { content: '   ' } }] });
    await expect(generateInsights(30)).rejects.toThrow(/empty/i);
    expect(cacheStore.rows).toHaveLength(0);
  });

  it('propagates OpenAI errors and does not cache', async () => {
    createMock.mockRejectedValue(new Error('rate limit'));
    await expect(generateInsights(30)).rejects.toThrow('rate limit');
    expect(cacheStore.rows).toHaveLength(0);
  });
});

describe('getCachedInsights', () => {
  beforeEach(() => {
    cacheStore.rows = [];
    selectPredicate = null;
  });

  it('returns null when no cache exists for the period', async () => {
    expect(await getCachedInsights(30)).toBeNull();
  });

  it('returns the newest cached insight for the matching period', async () => {
    cacheStore.rows.push(
      {
        period: '30d',
        stats: SAMPLE_STATS,
        aiText: 'ישן',
        model: 'gpt-5.4',
        generatedAt: new Date('2026-06-01T00:00:00Z'),
      },
      {
        period: '30d',
        stats: SAMPLE_STATS,
        aiText: 'חדש',
        model: 'gpt-5.4',
        generatedAt: new Date('2026-06-03T00:00:00Z'),
      },
      {
        period: '7d',
        stats: SAMPLE_STATS,
        aiText: 'אחר',
        model: 'gpt-5.4',
        generatedAt: new Date('2026-06-03T00:00:00Z'),
      },
    );
    const cached = await getCachedInsights(30);
    expect(cached).not.toBeNull();
    expect(cached!.text).toBe('חדש');
    expect(cached!.period).toBe('30d');
    expect(cached!.stats).toEqual(SAMPLE_STATS);
  });
});
