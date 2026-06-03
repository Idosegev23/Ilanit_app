import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHash } from 'crypto';

// In-memory store standing in for the booking_links table. The fake DB models
// the two operations booking-links.ts performs: insert(...).values(...) and the
// select(...).from(...).where(...).limit() lookup used by resolveBookingLink.

interface Row {
  tokenHash: string;
  studentId: string;
  expiresAt: Date | null;
}

const store: { rows: Row[] } = { rows: [] };

// Holds the predicate captured from the most recent .where(...) call.
let pendingWhere: ((r: Row) => boolean) | null = null;

vi.mock('@/lib/db', () => ({
  db: {
    insert: () => ({
      values: (vals: Row) => {
        store.rows.push({ ...vals });
        return Promise.resolve([]);
      },
    }),
    select: () => ({
      from: () => ({
        where: (predicate: (r: Row) => boolean) => {
          pendingWhere = predicate;
          return {
            limit: () => {
              const matched = store.rows
                .filter((r) => (pendingWhere ? pendingWhere(r) : false))
                .map((r) => ({ studentId: r.studentId }));
              pendingWhere = null;
              return Promise.resolve(matched.slice(0, 1));
            },
          };
        },
      }),
    }),
  },
}));

// drizzle operators → plain predicate builders matching the fake store rows.
vi.mock('drizzle-orm', () => {
  const and =
    (...preds: Array<(r: Row) => boolean>) =>
    (r: Row) =>
      preds.every((p) => p(r));
  const or =
    (...preds: Array<(r: Row) => boolean>) =>
    (r: Row) =>
      preds.some((p) => p(r));
  const eq = (col: { __k: keyof Row }, val: unknown) => (r: Row) => r[col.__k] === val;
  const gt = (col: { __k: keyof Row }, val: Date) => (r: Row) => {
    const v = r[col.__k];
    return v instanceof Date ? v.getTime() > val.getTime() : false;
  };
  const isNull = (col: { __k: keyof Row }) => (r: Row) => r[col.__k] == null;
  return { and, or, eq, gt, isNull };
});

// Schema columns → tagged keys so the mocked operators know which field to read.
vi.mock('@/db/schema', () => ({
  bookingLinks: {
    tokenHash: { __k: 'tokenHash' },
    studentId: { __k: 'studentId' },
    expiresAt: { __k: 'expiresAt' },
  },
}));

vi.mock('@/lib/env', () => ({
  env: () => ({ NEXT_PUBLIC_APP_URL: 'https://ilanit.test/' }),
}));

import { createBookingLink, resolveBookingLink } from '@/lib/booking-links';

function hashOf(raw: string) {
  return createHash('sha256').update(raw).digest('hex');
}

describe('booking links', () => {
  beforeEach(() => {
    store.rows = [];
    pendingWhere = null;
  });

  it('creates a link, stores only the hash, returns the raw token + URL', async () => {
    const { token, url } = await createBookingLink('student-1');
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(20);
    expect(url).toBe(`https://ilanit.test/book/${token}`);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].tokenHash).toBe(hashOf(token));
    expect(store.rows[0].tokenHash).not.toBe(token);
    expect(store.rows[0].studentId).toBe('student-1');
  });

  it('defaults to a ~30-day expiry', async () => {
    const before = Date.now();
    await createBookingLink('student-1');
    const expiry = store.rows[0].expiresAt;
    expect(expiry).toBeInstanceOf(Date);
    const ms = (expiry as Date).getTime() - before;
    // ~30 days, allow generous slack
    expect(ms).toBeGreaterThan(29 * 24 * 60 * 60_000);
    expect(ms).toBeLessThan(31 * 24 * 60 * 60_000);
  });

  it('honors a custom ttlDays', async () => {
    const before = Date.now();
    await createBookingLink('student-1', 7);
    const ms = (store.rows[0].expiresAt as Date).getTime() - before;
    expect(ms).toBeGreaterThan(6.9 * 24 * 60 * 60_000);
    expect(ms).toBeLessThan(7.1 * 24 * 60 * 60_000);
  });

  it('treats ttlDays <= 0 as a never-expiring link (NULL expiry)', async () => {
    await createBookingLink('student-1', 0);
    expect(store.rows[0].expiresAt).toBeNull();
  });

  it('resolves a valid token to its student id', async () => {
    const { token } = await createBookingLink('student-42');
    expect(await resolveBookingLink(token)).toEqual({ studentId: 'student-42' });
  });

  it('is NOT single-use: resolves repeatedly', async () => {
    const { token } = await createBookingLink('student-9');
    expect(await resolveBookingLink(token)).toEqual({ studentId: 'student-9' });
    expect(await resolveBookingLink(token)).toEqual({ studentId: 'student-9' });
  });

  it('resolves a never-expiring token', async () => {
    const { token } = await createBookingLink('student-7', 0);
    expect(await resolveBookingLink(token)).toEqual({ studentId: 'student-7' });
  });

  it('rejects an expired token', async () => {
    // Seed a row whose expiry is in the past (a link created earlier with a TTL
    // that has since elapsed). resolveBookingLink must treat it as gone.
    const raw = 'expired-raw-token-aaaaaaaaaaaaaaaaaaaa';
    store.rows.push({
      tokenHash: hashOf(raw),
      studentId: 'student-1',
      expiresAt: new Date(Date.now() - 60_000),
    });
    expect(await resolveBookingLink(raw)).toBeNull();
  });

  it('returns null for an unknown token', async () => {
    expect(await resolveBookingLink('does-not-exist')).toBeNull();
  });

  it('returns null for an empty token', async () => {
    expect(await resolveBookingLink('')).toBeNull();
  });
});
