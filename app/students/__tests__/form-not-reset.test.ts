import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
  React 19 resets a form given a FUNCTION action once that action settles — on
  failure exactly as on success. Every rejected save therefore wiped everything
  Ilanit had typed, and it made the sibling offer unusable: the moment it
  appeared the fields behind it were already blank, so confirming it would have
  saved an empty record.

  The forms that surface an inline error and expect her to correct it in place
  must therefore submit through a handler that calls preventDefault, never
  through `action={fn}`. This is a structural rule, so it is checked
  structurally — a behavioural test would need a DOM, a React renderer and a
  server action, and would still not stop the next form from being added the
  wrong way.
*/

const ROOT = join(__dirname, '..', '..', '..');

const FORMS_WITH_INLINE_ERRORS = [
  'app/students/student-form-dialog.tsx',
  'app/lessons/ManualLessonForm.tsx',
  'app/lessons/RecurringForm.tsx',
  'app/standby/StandbyForm.tsx',
];

describe('a form that reports errors inline must not be reset by React', () => {
  for (const file of FORMS_WITH_INLINE_ERRORS) {
    it(`${file} submits through a handler, not action={fn}`, () => {
      const raw = readFileSync(join(ROOT, file), 'utf8');
      // Comments in these files quote the very pattern being banned, so they
      // are stripped before the scan.
      const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

      // No <form action={someFunction}> — the reset comes free with that form.
      const formTags = src.match(/<form[^>]*>/g) ?? [];
      const withFnAction = formTags.filter((t) => /\saction=\{/.test(t));
      expect(withFnAction).toEqual([]);

      // …and the handler it uses actually stops the default submit.
      expect(src).toMatch(/onSubmit=\{handleSubmit\}/);
      expect(raw).toMatch(/e\.preventDefault\(\)/);
    });
  }
});
