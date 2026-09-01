import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/*
  A guard for a bug that has now shipped twice.

  An <input type="number"> validates against min + n*step, so `min` is the STEP
  BASE, not just a floor. min="1" step="5" therefore accepts 1, 6, 11 … 46, 51
  and REJECTS 50 — with the browser refusing the form and the server never
  hearing about it. It bit the student duration field, and then the group
  session field, where 50 is the only value anyone ever wants.

  The first fix came with a claim that no other input had the shape, based on a
  grep for `step={5}` that missed `step="5"` written as a string attribute. This
  reads the JSX for both spellings instead.
*/

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of require('node:fs').readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

interface Found {
  file: string;
  line: number;
  name: string;
  min: number;
  step: number;
}

function numberInputs(): Found[] {
  const files = [...walk('app'), ...walk('components')];
  const found: Found[] = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/<Input\b[\s\S]*?\/>/g)) {
      const tag = m[0];
      const min = tag.match(/min=(?:\{(\d+)\}|"(\d+)")/);
      const step = tag.match(/step=(?:\{(\d+)\}|"(\d+)")/);
      if (!min || !step) continue;
      const nameM = tag.match(/name=(?:\{`([^`]+)`\}|"([^"]+)")/);
      found.push({
        file,
        line: src.slice(0, m.index).split('\n').length,
        name: nameM?.[1] ?? nameM?.[2] ?? '(unnamed)',
        min: Number(min[1] ?? min[2]),
        step: Number(step[1] ?? step[2]),
      });
    }
  }
  return found;
}

describe('number inputs: min must be a multiple of step', () => {
  it('finds the inputs at all, so the check cannot pass by matching nothing', () => {
    expect(numberInputs().length).toBeGreaterThan(5);
  });

  it('has no input whose own step base rejects ordinary values', () => {
    const broken = numberInputs().filter((i) => i.step > 1 && i.min % i.step !== 0);
    const detail = broken
      .map(
        (b) =>
          `${b.file}:${b.line} name=${b.name} min=${b.min} step=${b.step} ` +
          `→ accepts only ${b.min}, ${b.min + b.step}, ${b.min + 2 * b.step}…`,
      )
      .join('\n');
    expect(broken, `min must be a multiple of step:\n${detail}`).toEqual([]);
  });
});
