import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/env', () => ({
  env: () => ({ CRON_SECRET: 'super-secret-cron-value-1234' }),
}));

import { isAuthorizedCron } from '@/lib/jobs/cron-auth';

function reqWith(headers: Record<string, string>): Request {
  return new Request('https://example.com/api/cron/tick', { headers });
}

describe('isAuthorizedCron', () => {
  beforeEach(() => vi.clearAllMocks());

  it('accepts a correct Bearer token', () => {
    expect(isAuthorizedCron(reqWith({ authorization: 'Bearer super-secret-cron-value-1234' }))).toBe(
      true,
    );
  });

  it('accepts case-variant Authorization header name', () => {
    expect(isAuthorizedCron(reqWith({ Authorization: 'Bearer super-secret-cron-value-1234' }))).toBe(
      true,
    );
  });

  it('rejects a wrong token', () => {
    expect(isAuthorizedCron(reqWith({ authorization: 'Bearer wrong-token-value-000000000' }))).toBe(
      false,
    );
  });

  it('rejects a token of different length', () => {
    expect(isAuthorizedCron(reqWith({ authorization: 'Bearer short' }))).toBe(false);
  });

  it('rejects when header is missing', () => {
    expect(isAuthorizedCron(reqWith({}))).toBe(false);
  });

  it('rejects a bare token without Bearer prefix', () => {
    expect(isAuthorizedCron(reqWith({ authorization: 'super-secret-cron-value-1234' }))).toBe(false);
  });
});
