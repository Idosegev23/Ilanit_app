import { describe, it, expect } from 'vitest';
import { renderTemplate } from '@/lib/notifications/templates';

/*
  The confirmation is the first message a parent gets about a lesson, and until
  now it never mentioned money. The first number they saw was the payment
  request AFTER the lesson had already happened — which is a bad moment to
  learn a price, and the reason a charge could feel like a surprise.

  Stating it at confirmation costs nothing and removes that surprise entirely.
*/

const base = {
  studentName: 'תהל בישלה',
  datetime: '03/09/2026 16:15',
  location: 'עתניאל 10/2',
};

describe('booking_approved_student', () => {
  it('states the price when there is one', () => {
    const body = renderTemplate('booking_approved_student', { ...base, price: 140 });

    expect(body).toContain('עלות השיעור');
    expect(body).toContain('140');
  });

  it('says nothing about money for a 0₪ student', () => {
    /*
      עומריקה is a standing exemption, not a free trial. "עלות השיעור: 0 ₪"
      reads like a bug and invites a question nobody wants to have.
    */
    const body = renderTemplate('booking_approved_student', { ...base, price: 0 });

    expect(body).not.toContain('עלות');
    // The rest of the confirmation is unaffected.
    expect(body).toContain('תהל בישלה');
    expect(body).toContain('03/09/2026 16:15');
  });

  it('says nothing about money when no price was passed at all', () => {
    // Older call sites and any future one that forgets must degrade to the
    // previous message, never to "עלות השיעור: NaN".
    const body = renderTemplate('booking_approved_student', base);

    expect(body).not.toContain('עלות');
    expect(body).not.toContain('NaN');
  });

  it('keeps the address line', () => {
    const body = renderTemplate('booking_approved_student', {
      ...base,
      location: 'עתניאל 10/2, מאחורי בית הכנסת "משכן ברנע"',
      price: 140,
    });

    expect(body).toContain('משכן ברנע');
  });
});
