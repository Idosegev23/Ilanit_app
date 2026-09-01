import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/tokens', () => ({
  consumeActionToken: vi.fn(),
}));

vi.mock('@/lib/morning/receipt-service', () => ({
  markLessonPaidAndIssueReceipt: vi.fn(),
  sendPaymentRequest: vi.fn(),
}));

import { POST } from '@/app/api/payment/route';
import { consumeActionToken } from '@/lib/tokens';
import { markLessonPaidAndIssueReceipt, sendPaymentRequest } from '@/lib/morning/receipt-service';

function req(body: unknown): Request {
  return new Request('http://localhost/api/payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(consumeActionToken).mockResolvedValue({ type: 'payment', lessonId: 'lesson-1', groupBillingId: null });
  vi.mocked(markLessonPaidAndIssueReceipt).mockResolvedValue({
    ok: true,
    receiptId: 'r1',
    docNumber: '1042',
    pdfUrl: 'https://blob/r.pdf',
    sent: true,
  });
  vi.mocked(sendPaymentRequest).mockResolvedValue({ ok: true });
});

describe('POST /api/payment', () => {
  it('paid → consumes token then issues receipt with integer amount + method + description', async () => {
    const res = await POST(
      req({ token: 'tok', decision: 'paid', amount: 120, method: 'bit', description: 'חוג' }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, decision: 'paid', docNumber: '1042', sent: true });
    expect(markLessonPaidAndIssueReceipt).toHaveBeenCalledWith({
      lessonId: 'lesson-1',
      amount: 120,
      method: 'bit',
      description: 'חוג',
    });
  });

  it('rounds a decimal amount to whole shekels', async () => {
    await POST(req({ token: 'tok', decision: 'paid', amount: 119.6, method: 'cash' }));
    expect(markLessonPaidAndIssueReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 120 }),
    );
  });

  it('defaults the description when omitted and trims/caps free text', async () => {
    await POST(req({ token: 'tok', decision: 'paid', amount: 100, method: 'cash' }));
    expect(markLessonPaidAndIssueReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'שיעור פרטי' }),
    );

    vi.clearAllMocks();
    vi.mocked(consumeActionToken).mockResolvedValue({ type: 'payment', lessonId: 'lesson-1', groupBillingId: null });
    vi.mocked(markLessonPaidAndIssueReceipt).mockResolvedValue({
      ok: true,
      docNumber: '1043',
      sent: true,
    });
    await POST(
      req({ token: 'tok', decision: 'paid', amount: 100, method: 'cash', description: '   ' }),
    );
    expect(markLessonPaidAndIssueReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'שיעור פרטי' }),
    );
  });

  it('request → sends payment request (no receipt)', async () => {
    const res = await POST(req({ token: 'tok', decision: 'request' }));
    expect(res.status).toBe(200);
    expect((await res.json())).toMatchObject({ ok: true, decision: 'request' });
    expect(sendPaymentRequest).toHaveBeenCalledWith('lesson-1');
    expect(markLessonPaidAndIssueReceipt).not.toHaveBeenCalled();
  });

  it('rejects a missing token (400)', async () => {
    const res = await POST(req({ decision: 'request' }));
    expect(res.status).toBe(400);
    expect(consumeActionToken).not.toHaveBeenCalled();
  });

  it('rejects an invalid decision (400)', async () => {
    const res = await POST(req({ token: 'tok', decision: 'bogus' }));
    expect(res.status).toBe(400);
  });

  it('rejects a non-positive amount for paid (400) before consuming token', async () => {
    const res = await POST(req({ token: 'tok', decision: 'paid', amount: 0, method: 'cash' }));
    expect(res.status).toBe(400);
    expect(consumeActionToken).not.toHaveBeenCalled();
  });

  it('rejects an invalid payment method (400)', async () => {
    const res = await POST(req({ token: 'tok', decision: 'paid', amount: 100, method: 'paypal' }));
    expect(res.status).toBe(400);
    expect(consumeActionToken).not.toHaveBeenCalled();
  });

  it('returns 410 when the token is invalid/used', async () => {
    vi.mocked(consumeActionToken).mockResolvedValue(null);
    const res = await POST(req({ token: 'tok', decision: 'request' }));
    expect(res.status).toBe(410);
    expect(sendPaymentRequest).not.toHaveBeenCalled();
  });

  it('returns 410 when the token is the wrong type', async () => {
    vi.mocked(consumeActionToken).mockResolvedValue({ type: 'approve', lessonId: 'l', groupBillingId: null });
    const res = await POST(req({ token: 'tok', decision: 'request' }));
    expect(res.status).toBe(410);
  });

  it('returns 502 when the service reports failure (paid)', async () => {
    vi.mocked(markLessonPaidAndIssueReceipt).mockResolvedValue({ ok: false, error: 'morning down' });
    const res = await POST(req({ token: 'tok', decision: 'paid', amount: 100, method: 'cash' }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/morning down/);
  });

  it('returns 400 on invalid JSON body', async () => {
    const bad = new Request('http://localhost/api/payment', { method: 'POST', body: '{not json' });
    const res = await POST(bad);
    expect(res.status).toBe(400);
  });
});
