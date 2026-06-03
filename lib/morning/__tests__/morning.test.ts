import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock env + settings (cross-module deps) before importing the SUT.
vi.mock('@/lib/env', () => ({
  env: () => ({
    MORNING_API_KEY: 'morning-id',
    MORNING_API_SECRET: 'morning-secret',
    MORNING_BASE_URL: 'https://api.greeninvoice.co.il/api/v1',
    MORNING_DOC_TYPE: undefined,
  }),
}));

vi.mock('@/lib/settings', () => ({
  getSettings: vi.fn(async () => ({ morningDocType: null })),
}));

import { createReceipt } from '@/lib/morning';
import { getSettings } from '@/lib/settings';

type FetchMock = ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('lib/morning createReceipt', () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(getSettings).mockResolvedValue({ morningDocType: null } as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('authenticates with id+secret then creates a document and returns docId/number/pdfUrl', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ token: 'jwt-123' }))
      .mockResolvedValueOnce(
        jsonResponse({ id: 'DOC1', number: 1042, url: { he: 'https://m.co/he.pdf', origin: 'https://m.co/o.pdf' } }),
      );

    const result = await createReceipt({
      clientName: 'דנה כהן',
      clientPhone: '+972501234567',
      amount: 120,
      description: 'שיעור פרטי',
      method: 'bit',
    });

    expect(result).toEqual({ docId: 'DOC1', docNumber: '1042', pdfUrl: 'https://m.co/he.pdf' });

    // first call = auth with id+secret
    const [authUrl, authInit] = fetchMock.mock.calls[0];
    expect(authUrl).toBe('https://api.greeninvoice.co.il/api/v1/account/token');
    expect(JSON.parse((authInit as RequestInit).body as string)).toEqual({
      id: 'morning-id',
      secret: 'morning-secret',
    });

    // second call = create document with bearer token
    const [docUrl, docInit] = fetchMock.mock.calls[1];
    expect(docUrl).toBe('https://api.greeninvoice.co.il/api/v1/documents');
    const headers = (docInit as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer jwt-123');
  });

  it('sends integer-shekel amount with default doc type 400 and maps cash payment type', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ token: 't' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'D', number: 5, url: 'https://m.co/x.pdf' }));

    await createReceipt({ clientName: 'משה', amount: 200, description: 'שיעור', method: 'cash' });

    const body = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(body.type).toBe(400);
    expect(body.income[0].price).toBe(200);
    expect(body.payment[0].price).toBe(200);
    expect(body.payment[0].type).toBe(1); // cash
    expect(body.currency).toBe('ILS');
  });

  it('prefers MORNING_DOC_TYPE from settings when env unset', async () => {
    vi.mocked(getSettings).mockResolvedValue({ morningDocType: '320' } as never);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ token: 't' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'D', number: 9, url: 'https://m.co/x.pdf' }));

    await createReceipt({ clientName: 'X', amount: 100, description: 'd' });

    const body = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(body.type).toBe(320);
  });

  it('handles plain-string url and missing method (defaults to "other")', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ token: 't' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'D', number: 7, url: 'https://m.co/plain.pdf' }));

    const r = await createReceipt({ clientName: 'X', amount: 50, description: 'd' });
    expect(r.pdfUrl).toBe('https://m.co/plain.pdf');

    const body = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(body.payment[0].type).toBe(10); // other
  });

  it('throws on non-integer or non-positive amount', async () => {
    await expect(
      createReceipt({ clientName: 'X', amount: 0, description: 'd' }),
    ).rejects.toThrow(/positive integer/);
    await expect(
      createReceipt({ clientName: 'X', amount: 12.5, description: 'd' }),
    ).rejects.toThrow(/positive integer/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws when auth returns no token', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ errorMessage: 'bad creds' }));
    await expect(
      createReceipt({ clientName: 'X', amount: 100, description: 'd' }),
    ).rejects.toThrow(/no token/);
  });

  it('throws when auth http fails', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 401));
    await expect(
      createReceipt({ clientName: 'X', amount: 100, description: 'd' }),
    ).rejects.toThrow(/Morning auth failed \(401\)/);
  });

  it('throws when document creation returns an errorCode', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ token: 't' }))
      .mockResolvedValueOnce(jsonResponse({ errorCode: 1001, errorMessage: 'invalid' }));
    await expect(
      createReceipt({ clientName: 'X', amount: 100, description: 'd' }),
    ).rejects.toThrow(/Morning createReceipt error 1001/);
  });

  it('throws when document http fails', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ token: 't' }))
      .mockResolvedValueOnce(jsonResponse({}, false, 500));
    await expect(
      createReceipt({ clientName: 'X', amount: 100, description: 'd' }),
    ).rejects.toThrow(/Morning createReceipt failed \(500\)/);
  });
});
