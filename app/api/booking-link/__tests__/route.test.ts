import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/students', () => ({
  findStudentByPhone: vi.fn(),
  createStudent: vi.fn(),
  getStudent: vi.fn(),
  contactPhoneFor: (s: { phone: string; guardianPhone?: string | null }) =>
    s.guardianPhone?.trim() || s.phone,
}));
vi.mock('@/lib/booking-links', () => ({ createBookingLink: vi.fn() }));
vi.mock('@/lib/notifications/dispatch', () => ({ notify: vi.fn() }));
vi.mock('@/lib/settings', () => ({ getSettings: vi.fn() }));

import { POST } from '@/app/api/booking-link/route';
import { auth } from '@/auth';
import { findStudentByPhone, createStudent, getStudent } from '@/lib/students';
import { createBookingLink } from '@/lib/booking-links';
import { notify } from '@/lib/notifications/dispatch';
import { getSettings } from '@/lib/settings';

const EXISTING = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'דנה לוי',
  phone: '+972501234567',
  email: null,
  guardianName: null,
  guardianPhone: null,
  receiptLabel: null,
  defaultPrice: 150,
  defaultDurationMin: 60,
  notes: null,
  archived: false,
  createdAt: new Date(),
};

function req(body: unknown): Request {
  return new Request('http://localhost/api/booking-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue({ user: { email: 'ilanit@example.com' } } as never);
  vi.mocked(getStudent).mockResolvedValue(EXISTING as never);
  vi.mocked(findStudentByPhone).mockResolvedValue(null);
  vi.mocked(createStudent).mockResolvedValue({ ...EXISTING, id: 'new-student' } as never);
  vi.mocked(createBookingLink).mockResolvedValue({
    token: 'raw-token',
    url: 'https://ilanit.test/book/raw-token',
  });
  vi.mocked(notify).mockResolvedValue({ ok: true });
  vi.mocked(getSettings).mockResolvedValue({ defaultDurationMin: 60 } as never);
});

describe('POST /api/booking-link — auth', () => {
  it('returns 401 with no session', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await POST(req({ studentId: EXISTING.id }));
    expect(res.status).toBe(401);
    expect(createBookingLink).not.toHaveBeenCalled();
  });
});

describe('POST /api/booking-link — existing student', () => {
  it('mints a link for the chosen student and WhatsApps it', async () => {
    const res = await POST(req({ studentId: EXISTING.id }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, url: 'https://ilanit.test/book/raw-token', sent: true });
    expect(getStudent).toHaveBeenCalledWith(EXISTING.id);
    expect(createBookingLink).toHaveBeenCalledWith(EXISTING.id);
    expect(notify).toHaveBeenCalledWith(
      'booking_link_student',
      '+972501234567',
      expect.objectContaining({
        studentName: 'דנה לוי',
        bookingUrl: 'https://ilanit.test/book/raw-token',
      }),
    );
  });

  it('returns 404 when the student id is unknown', async () => {
    vi.mocked(getStudent).mockResolvedValue(null);
    const res = await POST(req({ studentId: EXISTING.id }));
    expect(res.status).toBe(404);
    expect(createBookingLink).not.toHaveBeenCalled();
  });

  it('routes the WhatsApp to the guardian phone when one is set', async () => {
    vi.mocked(getStudent).mockResolvedValue({
      ...EXISTING,
      guardianName: 'רוני לוי',
      guardianPhone: '+972527654321',
    } as never);
    const res = await POST(req({ studentId: EXISTING.id }));
    expect(res.status).toBe(200);
    expect(notify).toHaveBeenCalledWith(
      'booking_link_student',
      '+972527654321',
      expect.objectContaining({ studentName: 'דנה לוי' }),
    );
  });
});

describe('POST /api/booking-link — new student', () => {
  it('creates the student (normalized phone) then mints + sends the link', async () => {
    const res = await POST(req({ name: 'יוסי כהן', phone: '050-123-4567' }));
    expect(res.status).toBe(200);
    expect((await res.json())).toMatchObject({ ok: true, url: 'https://ilanit.test/book/raw-token' });
    expect(createStudent).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'יוסי כהן', phone: '+972501234567' }),
    );
    expect(createBookingLink).toHaveBeenCalledWith('new-student');
  });

  it('persists guardian fields + receipt label and routes the link to the parent', async () => {
    vi.mocked(createStudent).mockResolvedValue({
      ...EXISTING,
      id: 'new-student',
      phone: '+972501234567',
      guardianName: 'רוני כהן',
      guardianPhone: '+972527654321',
      receiptLabel: 'הוראה מתקנת',
    } as never);
    const res = await POST(
      req({
        name: 'יוסי כהן',
        phone: '050-123-4567',
        guardianName: 'רוני כהן',
        guardianPhone: '052-765-4321',
        receiptLabel: 'הוראה מתקנת',
        defaultPrice: '180',
      }),
    );
    expect(res.status).toBe(200);
    expect(createStudent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'יוסי כהן',
        phone: '+972501234567',
        guardianName: 'רוני כהן',
        guardianPhone: '+972527654321',
        receiptLabel: 'הוראה מתקנת',
        defaultPrice: 180,
      }),
    );
    // Link routes to the guardian (contactPhoneFor) once the student is created.
    expect(notify).toHaveBeenCalledWith(
      'booking_link_student',
      '+972527654321',
      expect.any(Object),
    );
  });

  it('rejects an invalid guardian phone (400)', async () => {
    const res = await POST(
      req({ name: 'יוסי', phone: '0501234567', guardianPhone: 'nope' }),
    );
    expect(res.status).toBe(400);
    expect(createStudent).not.toHaveBeenCalled();
  });

  it('reuses an existing student matched by phone (no create)', async () => {
    vi.mocked(findStudentByPhone).mockResolvedValue(EXISTING as never);
    const res = await POST(req({ name: 'דנה', phone: '0501234567' }));
    expect(res.status).toBe(200);
    expect(createStudent).not.toHaveBeenCalled();
    expect(createBookingLink).toHaveBeenCalledWith(EXISTING.id);
  });

  it('rejects an invalid phone (400)', async () => {
    const res = await POST(req({ name: 'דנה', phone: 'abc' }));
    expect(res.status).toBe(400);
    expect(createBookingLink).not.toHaveBeenCalled();
  });

  it('rejects a missing name (400)', async () => {
    const res = await POST(req({ phone: '0501234567' }));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/booking-link — robustness', () => {
  it('still returns the URL with sent:false when WhatsApp fails', async () => {
    vi.mocked(notify).mockResolvedValue({ ok: false, error: 'green down' });
    const res = await POST(req({ studentId: EXISTING.id }));
    expect(res.status).toBe(200);
    expect((await res.json())).toMatchObject({ ok: true, sent: false });
  });

  it('returns 400 on invalid JSON', async () => {
    const bad = new Request('http://localhost/api/booking-link', { method: 'POST', body: '{bad' });
    const res = await POST(bad);
    expect(res.status).toBe(400);
  });
});
