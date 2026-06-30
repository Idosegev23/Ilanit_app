import { describe, it, expect, beforeEach, vi } from 'vitest';

// OpenAI SDK is mocked: a class whose instance exposes chat.completions.create.
const createMock = vi.fn();
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: createMock } };
    constructor(public opts: unknown) {}
  },
}));

vi.mock('@/lib/env', () => ({
  env: () => ({ OPENAI_API_KEY: 'sk-test', OPENAI_MODEL: 'gpt-5.4' }),
}));

import { parseLessonTitle } from '@/lib/ai/parse-lesson';

/** Convenience to make the mock return a JSON string content. */
function mockJson(obj: unknown) {
  createMock.mockResolvedValue({
    choices: [{ message: { content: JSON.stringify(obj) } }],
  });
}

beforeEach(() => {
  createMock.mockReset();
});

describe('parseLessonTitle', () => {
  it('extracts the student name and subject for a teaching lesson', async () => {
    mockJson({ isLesson: true, studentName: 'אמילי אירנה', subject: 'אנגלית' });

    const res = await parseLessonTitle('אמילי אירנה אנגלית');

    expect(res).toEqual({ isLesson: true, studentName: 'אמילי אירנה', subject: 'אנגלית' });
    // model + temperature 0 + strict JSON
    const arg = createMock.mock.calls[0][0];
    expect(arg.model).toBe('gpt-5.4');
    expect(arg.temperature).toBe(0);
    expect(arg.response_format).toEqual({ type: 'json_object' });
    expect(arg.messages[0].role).toBe('system');
    expect(arg.messages[1].content).toBe('אמילי אירנה אנגלית');
  });

  it('handles a grade-only subject', async () => {
    mockJson({ isLesson: true, studentName: 'רפאל', subject: 'כיתה ד' });
    const res = await parseLessonTitle('רפאל כיתה ד');
    expect(res).toEqual({ isLesson: true, studentName: 'רפאל', subject: 'כיתה ד' });
  });

  it('trims the parsed name and subject', async () => {
    mockJson({ isLesson: true, studentName: '  עמית וינגרטן  ', subject: ' כיתה ז ' });
    const res = await parseLessonTitle('עמית וינגרטן כיתה ז׳ מקיף א');
    expect(res.studentName).toBe('עמית וינגרטן');
    expect(res.subject).toBe('כיתה ז');
  });

  it('marks a personal event as not a lesson and nulls the fields', async () => {
    mockJson({ isLesson: false, studentName: null, subject: null });
    const res = await parseLessonTitle('מסיבת סיום של דנה');
    expect(res).toEqual({ isLesson: false, studentName: null, subject: null });
  });

  it('forces studentName/subject to null when not a lesson, even if model returns text', async () => {
    mockJson({ isLesson: false, studentName: 'דנה', subject: 'מתמטיקה' });
    const res = await parseLessonTitle('משהו');
    expect(res).toEqual({ isLesson: false, studentName: null, subject: null });
  });

  it('short-circuits Preply titles without calling OpenAI', async () => {
    const res = await parseLessonTitle('Preply lesson - Alexa F.');
    expect(res).toEqual({ isLesson: false, studentName: null, subject: null });
    expect(createMock).not.toHaveBeenCalled();
  });

  it('short-circuits a blank title without calling OpenAI', async () => {
    const res = await parseLessonTitle('   ');
    expect(res).toEqual({ isLesson: false, studentName: null, subject: null });
    expect(createMock).not.toHaveBeenCalled();
  });

  it('returns null subject when the model omits it', async () => {
    mockJson({ isLesson: true, studentName: 'נועה', subject: null });
    const res = await parseLessonTitle('נועה');
    expect(res).toEqual({ isLesson: true, studentName: 'נועה', subject: null });
  });

  it('throws on empty content', async () => {
    createMock.mockResolvedValue({ choices: [{ message: { content: '   ' } }] });
    await expect(parseLessonTitle('דנה מתמטיקה')).rejects.toThrow(/empty/i);
  });

  it('throws on non-JSON content', async () => {
    createMock.mockResolvedValue({ choices: [{ message: { content: 'not json' } }] });
    await expect(parseLessonTitle('דנה מתמטיקה')).rejects.toThrow(/non-JSON/i);
  });

  it('propagates OpenAI errors', async () => {
    createMock.mockRejectedValue(new Error('rate limit'));
    await expect(parseLessonTitle('דנה מתמטיקה')).rejects.toThrow('rate limit');
  });
});
