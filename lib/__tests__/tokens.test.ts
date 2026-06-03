import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHash } from 'crypto';

// In-memory store standing in for the action_tokens table. The fake DB models
// the exact two operations tokens.ts performs: insert(...).values(...) and the
// guarded update(...).set(...).where(...).returning() that enforces single-use.

interface Row {
  tokenHash: string;
  type: string;
  lessonId: string;
  expiresAt: Date;
  usedAt: Date | null;
}

const store: { rows: Row[] } = { rows: [] };

// Holds the predicate captured from the most recent .where(...) call.
let pendingWhere: ((r: Row) => boolean) | null = null;
let pendingSet: Partial<Row> | null = null;

vi.mock('@/lib/db', () => {
  return {
    db: {
      insert: () => ({
        values: (vals: Omit<Row, 'usedAt'>) => {
          store.rows.push({ ...vals, usedAt: null });
          return { returning: () => Promise.resolve([]) };
        },
      }),
      update: () => ({
        set: (patch: Partial<Row>) => {
          pendingSet = patch;
          return {
            where: (predicate: (r: Row) => boolean) => {
              pendingWhere = predicate;
              return {
                returning: () => {
                  const matched = store.rows.filter((r) =>
                    pendingWhere ? pendingWhere(r) : false,
                  );
                  for (const r of matched) Object.assign(r, pendingSet);
                  pendingWhere = null;
                  pendingSet = null;
                  return Promise.resolve(matched.map((r) => ({ ...r })));
                },
              };
            },
          };
        },
      }),
    },
  };
});

// drizzle operators → plain predicate builders matching the fake store rows.
vi.mock('drizzle-orm', () => {
  const and =
    (...preds: Array<(r: Row) => boolean>) =>
    (r: Row) =>
      preds.every((p) => p(r));
  const eq = (col: { __k: keyof Row }, val: unknown) => (r: Row) => r[col.__k] === val;
  const gt = (col: { __k: keyof Row }, val: Date) => (r: Row) =>
    (r[col.__k] as Date).getTime() > val.getTime();
  const isNull = (col: { __k: keyof Row }) => (r: Row) => r[col.__k] == null;
  return { and, eq, gt, isNull };
});

// Schema columns → tagged keys so the mocked operators know which field to read.
vi.mock('@/db/schema', () => ({
  actionTokens: {
    tokenHash: { __k: 'tokenHash' },
    type: { __k: 'type' },
    lessonId: { __k: 'lessonId' },
    expiresAt: { __k: 'expiresAt' },
    usedAt: { __k: 'usedAt' },
  },
}));

import { createActionToken, consumeActionToken } from '@/lib/tokens';

function hashOf(raw: string) {
  return createHash('sha256').update(raw).digest('hex');
}

describe('action tokens', () => {
  beforeEach(() => {
    store.rows = [];
    pendingWhere = null;
    pendingSet = null;
  });

  it('creates a token, stores only the hash, returns the raw token', async () => {
    const raw = await createActionToken('approve', 'lesson-1', 60);
    expect(typeof raw).toBe('string');
    expect(raw.length).toBeGreaterThan(20);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].tokenHash).toBe(hashOf(raw));
    expect(store.rows[0].tokenHash).not.toBe(raw);
  });

  it('consumes a valid token once and returns its type + lessonId', async () => {
    const raw = await createActionToken('payment', 'lesson-2', 60);
    const result = await consumeActionToken(raw);
    expect(result).toEqual({ type: 'payment', lessonId: 'lesson-2' });
  });

  it('is single-use: a second consume returns null', async () => {
    const raw = await createActionToken('approve', 'lesson-3', 60);
    const first = await consumeActionToken(raw);
    expect(first).not.toBeNull();
    const second = await consumeActionToken(raw);
    expect(second).toBeNull();
  });

  it('rejects an expired token', async () => {
    const raw = await createActionToken('assign_student', 'lesson-4', -1); // already expired
    const result = await consumeActionToken(raw);
    expect(result).toBeNull();
  });

  it('returns null for an unknown token', async () => {
    expect(await consumeActionToken('does-not-exist')).toBeNull();
  });

  it('returns null for an empty token', async () => {
    expect(await consumeActionToken('')).toBeNull();
  });
});
