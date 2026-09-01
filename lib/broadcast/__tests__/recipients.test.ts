import { describe, it, expect, vi } from 'vitest';

// contactPhoneFor is the real routing rule (guardian wins), so use it rather
// than re-implementing it in the test.
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/whatsapp/provider', () => ({ sendText: vi.fn() }));
vi.mock('@/lib/message-log', () => ({ logMessage: vi.fn(), updateMessageLog: vi.fn() }));

import { resolveRecipients, renderBody, NAME_TOKEN } from '@/lib/broadcast';

type S = Parameters<typeof resolveRecipients>[0][number];
const student = (id: string, name: string, phone: string | null, guardianPhone: string | null = null) =>
  ({ id, name, phone, guardianPhone }) as S;

describe('resolveRecipients — one message per person, not per student', () => {
  it('collapses siblings sharing a guardian number into a single delivery', () => {
    // The real case: four Rashef children under their mother's phone. Sending
    // per-student would put four identical messages on one handset.
    const { recipients } = resolveRecipients([
      student('a', 'לינוי רשף', null, '+972528773140'),
      student('b', 'מתן רשף', null, '+972528773140'),
      student('c', 'נטע רשף', null, '+972528773140'),
      student('d', 'אמילי רשף', null, '+972528773140'),
    ]);

    expect(recipients).toHaveLength(1);
    expect(recipients[0].phone).toBe('+972528773140');
    // Rendered name is deterministic (first by Hebrew collation), and the rest
    // are recorded so the history can show who the one message covered.
    expect(recipients[0].primary.name).toBe('אמילי רשף');
    expect(recipients[0].alsoCovers).toHaveLength(3);
  });

  it('keeps students on distinct numbers separate', () => {
    const { recipients } = resolveRecipients([
      student('a', 'דנה', '+972501111111'),
      student('b', 'יוסי', '+972502222222'),
    ]);
    expect(recipients).toHaveLength(2);
  });

  it('prefers the guardian number over the student’s own', () => {
    const { recipients } = resolveRecipients([
      student('a', 'ילד', '+972500000000', '+972509999999'),
    ]);
    expect(recipients[0].phone).toBe('+972509999999');
  });

  it('reports students with no reachable number instead of dropping them silently', () => {
    const { recipients, unreachable } = resolveRecipients([
      student('a', 'עם טלפון', '+972501111111'),
      student('b', 'בלי טלפון', null),
    ]);
    expect(recipients).toHaveLength(1);
    expect(unreachable).toEqual(['בלי טלפון']);
  });

  it('treats an empty-string phone as unreachable', () => {
    const { recipients, unreachable } = resolveRecipients([student('a', 'ריק', '', '')]);
    expect(recipients).toHaveLength(0);
    expect(unreachable).toEqual(['ריק']);
  });
});

describe('renderBody', () => {
  it('substitutes every occurrence of the name token', () => {
    expect(renderBody(`שלום ${NAME_TOKEN}! ${NAME_TOKEN}, נתראה`, 'נועה')).toBe(
      'שלום נועה! נועה, נתראה',
    );
  });

  it('leaves a message without the token untouched', () => {
    expect(renderBody('הודעה כללית', 'נועה')).toBe('הודעה כללית');
  });

  it('does not treat the name as a pattern', () => {
    // split/join, not replace with a regex — a name containing $& would corrupt
    // the output under naive replacement.
    expect(renderBody(NAME_TOKEN, '$& דנה')).toBe('$& דנה');
  });
});
