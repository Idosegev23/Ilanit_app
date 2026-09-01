import type { ReportFilters } from './query';

/*
  The questions Ilanit actually asks, as one-tap filter sets.

  A preset is not a shortcut around the filters — it SETS them, visibly, so the
  answer stays inspectable and she can nudge one field instead of starting over.
  Each preset also names which number answers it, because the same result set
  answers "how much came in" and "how many lessons" with different figures.
*/

export type AnswerKey = 'paid' | 'due' | 'lessons' | 'unbilled';

export interface Preset {
  id: string;
  question: string;
  answer: AnswerKey;
  filters: ReportFilters;
}

/** First and last IL calendar day of the month containing `ref`. */
export function monthRange(ref: Date): { from: string; to: string } {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const pad = (n: number) => String(n).padStart(2, '0');
  const last = new Date(y, m + 1, 0).getDate();
  return {
    from: `${y}-${pad(m + 1)}-01`,
    to: `${y}-${pad(m + 1)}-${pad(last)}`,
  };
}

export function presetsFor(now: Date): Preset[] {
  const month = monthRange(now);
  return [
    {
      id: 'debts',
      question: 'מי חייב לי כסף?',
      answer: 'due',
      // No date bound on purpose: a debt does not expire at the end of a month.
      filters: { paymentStatus: 'due', lessonStatus: 'all', type: 'all' },
    },
    {
      id: 'income-month',
      question: 'כמה שולם על שיעורי החודש?',
      answer: 'paid',
      filters: {
        paymentStatus: 'paid',
        lessonStatus: 'all',
        type: 'all',
        ...month,
      },
    },
    {
      id: 'lessons-month',
      question: 'כמה שיעורים היו החודש?',
      answer: 'lessons',
      filters: {
        lessonStatus: 'completed',
        paymentStatus: 'all',
        type: 'all',
        ...month,
      },
    },
    {
      id: 'cancelled-month',
      question: 'מה בוטל החודש?',
      answer: 'lessons',
      filters: {
        lessonStatus: 'cancelled',
        paymentStatus: 'all',
        type: 'all',
        ...month,
      },
    },
    {
      id: 'unbilled',
      question: 'אילו שיעורים לא חויבו בכלל?',
      answer: 'unbilled',
      filters: {
        lessonStatus: 'completed',
        paymentStatus: 'unbilled',
        type: 'individual',
      },
    },
  ];
}
