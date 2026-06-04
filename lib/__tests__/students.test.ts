import { describe, it, expect } from 'vitest';

// Pure unit test for contactPhoneFor. No DB needed — but the module imports
// '@/lib/db' at top level, so we stub it to a harmless object.
import { vi } from 'vitest';
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/db/schema', () => ({
  students: {},
  lessons: {},
  payments: {},
  receipts: {},
  groupMembers: {},
  groups: {},
  groupBilling: {},
}));
vi.mock('drizzle-orm', () => ({
  and: () => ({}),
  desc: () => ({}),
  eq: () => ({}),
  inArray: () => ({}),
}));

import { contactPhoneFor } from '@/lib/students';

describe('contactPhoneFor', () => {
  it('returns the guardian phone when present', () => {
    expect(
      contactPhoneFor({ phone: '+972500000001', guardianPhone: '+972500000002' }),
    ).toBe('+972500000002');
  });

  it('falls back to the student phone when guardian is null', () => {
    expect(contactPhoneFor({ phone: '+972500000001', guardianPhone: null })).toBe(
      '+972500000001',
    );
  });

  it('falls back to the student phone when guardian is blank/whitespace', () => {
    expect(contactPhoneFor({ phone: '+972500000001', guardianPhone: '   ' })).toBe(
      '+972500000001',
    );
  });
});
