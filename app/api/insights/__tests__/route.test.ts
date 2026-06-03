import { describe, it, expect, beforeEach, vi } from 'vitest';

const authMock = vi.fn();
vi.mock('@/auth', () => ({ auth: () => authMock() }));

const generateMock = vi.fn();
const getCachedMock = vi.fn();
vi.mock('@/lib/insights', () => ({
  generateInsights: (...a: unknown[]) => generateMock(...a),
  getCachedInsights: (...a: unknown[]) => getCachedMock(...a),
}));

import { GET, POST } from '@/app/api/insights/route';

function req(url: string, body?: unknown): Request {
  return new Request(url, {
    method: body === undefined ? 'GET' : 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
  });
}

describe('GET /api/insights', () => {
  beforeEach(() => {
    authMock.mockReset();
    getCachedMock.mockReset();
  });

  it('401s without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(req('https://x.test/api/insights'));
    expect(res.status).toBe(401);
  });

  it('returns the cached insight for the clamped period', async () => {
    authMock.mockResolvedValue({ user: { email: 'ilanit@example.com' } });
    getCachedMock.mockResolvedValue({ period: '30d', text: 'תובנה', stats: {}, model: 'gpt-5.4' });
    const res = await GET(req('https://x.test/api/insights?periodDays=30'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.periodDays).toBe(30);
    expect(json.cached.text).toBe('תובנה');
    expect(getCachedMock).toHaveBeenCalledWith(30);
  });

  it('defaults the period to 30 when missing/invalid', async () => {
    authMock.mockResolvedValue({ user: {} });
    getCachedMock.mockResolvedValue(null);
    await GET(req('https://x.test/api/insights?periodDays=abc'));
    expect(getCachedMock).toHaveBeenCalledWith(30);
  });

  it('clamps out-of-range periods', async () => {
    authMock.mockResolvedValue({ user: {} });
    getCachedMock.mockResolvedValue(null);
    await GET(req('https://x.test/api/insights?periodDays=99999'));
    expect(getCachedMock).toHaveBeenCalledWith(365);
  });
});

describe('POST /api/insights', () => {
  beforeEach(() => {
    authMock.mockReset();
    generateMock.mockReset();
  });

  it('401s without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(req('https://x.test/api/insights', { periodDays: 30 }));
    expect(res.status).toBe(401);
    expect(generateMock).not.toHaveBeenCalled();
  });

  it('generates insights and returns them', async () => {
    authMock.mockResolvedValue({ user: {} });
    generateMock.mockResolvedValue({ stats: { periodDays: 7 }, text: 'בוצע' });
    const res = await POST(req('https://x.test/api/insights', { periodDays: 7 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.periodDays).toBe(7);
    expect(json.text).toBe('בוצע');
    expect(generateMock).toHaveBeenCalledWith(7);
  });

  it('returns 502 when generation fails', async () => {
    authMock.mockResolvedValue({ user: {} });
    generateMock.mockRejectedValue(new Error('OpenAI down'));
    const res = await POST(req('https://x.test/api/insights', {}));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toBe('insights_generation_failed');
    expect(json.detail).toContain('OpenAI down');
  });
});
