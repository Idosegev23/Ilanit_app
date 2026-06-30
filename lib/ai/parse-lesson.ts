import OpenAI from 'openai';
import { env } from '@/lib/env';

// AI parsing of Google-Calendar event titles for the calendar-import flow.
// Ilanit's private-lesson titles encode the student's name + subject (מקצוע),
// e.g. "אמילי אירנה אנגלית" → name "אמילי אירנה", subject "אנגלית". This helper
// extracts those, and also flags titles that are NOT her teaching lessons
// (personal events, or the family's own Preply lessons) so they can be skipped.
//
// Uses the OpenAI SDK (model from env().OPENAI_MODEL, temperature 0, strict JSON).
// The SDK is mocked in unit tests, mirroring lib/insights.

export interface ParsedLesson {
  /** True only when this is one of Ilanit's teaching lessons. */
  isLesson: boolean;
  /** The student's name, trimmed; null when not a lesson / not extractable. */
  studentName: string | null;
  /** The subject (מקצוע), trimmed; null when absent. */
  subject: string | null;
}

const SYSTEM_PROMPT =
  'You are parsing a private teacher\'s Google-Calendar event titles. ' +
  'Extract the student\'s name and the subject (מקצוע), and whether this is ' +
  'actually a teaching lesson vs a personal event (party, conference, errand) ' +
  'or a Preply lesson (which is NOT hers). ' +
  'Return JSON {isLesson, studentName, subject}. ' +
  'Examples: "אמילי אירנה אנגלית" → {"isLesson": true, "studentName": "אמילי אירנה", "subject": "אנגלית"}; ' +
  '"רפאל כיתה ד" → {"isLesson": true, "studentName": "רפאל", "subject": "כיתה ד"}; ' +
  '"עמית וינגרטן כיתה ז׳ מקיף א" → {"isLesson": true, "studentName": "עמית וינגרטן", "subject": "כיתה ז"}; ' +
  '"מסיבת סיום..." → {"isLesson": false, "studentName": null, "subject": null}; ' +
  '"Preply lesson - Alexa F." → {"isLesson": false, "studentName": null, "subject": null}. ' +
  'Be robust to extra text; trim names. When not a lesson, set studentName and subject to null.';

/** Lazily-created OpenAI client (env read at call time, never at import). */
function openaiClient(): OpenAI {
  return new OpenAI({ apiKey: env().OPENAI_API_KEY });
}

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Parses a calendar event title into {isLesson, studentName, subject}. A blank
 * title, or a title that obviously mentions Preply, short-circuits to
 * not-a-lesson without an API call. Otherwise calls OpenAI with strict JSON.
 * Throws on API failure so callers can decide whether to skip that one title.
 */
export async function parseLessonTitle(title: string): Promise<ParsedLesson> {
  const trimmed = (title ?? '').trim();
  if (!trimmed) return { isLesson: false, studentName: null, subject: null };
  // Preply is unambiguously not Ilanit's lesson — no need to spend a call.
  if (trimmed.toLowerCase().includes('preply')) {
    return { isLesson: false, studentName: null, subject: null };
  }

  const client = openaiClient();
  const completion = await client.chat.completions.create({
    model: env().OPENAI_MODEL,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: trimmed },
    ],
  });

  const content = completion.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('OpenAI returned empty parse result');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('OpenAI returned non-JSON parse result');
  }

  const obj = (parsed ?? {}) as Record<string, unknown>;
  const isLesson = obj.isLesson === true;
  if (!isLesson) {
    return { isLesson: false, studentName: null, subject: null };
  }
  return {
    isLesson: true,
    studentName: cleanString(obj.studentName),
    subject: cleanString(obj.subject),
  };
}
