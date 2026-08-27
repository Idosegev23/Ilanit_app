'use client';

import * as React from 'react';
import { Search, SearchX, Check, UserPlus, X } from 'lucide-react';
import { Input } from './input';
import { cn } from '@/lib/utils';

/*
  Searchable student picker.

  This exists to make duplicate students hard to create. The manual scheduling
  form used to ask Ilanit to TYPE a name and phone, then resolved that phone to
  a student or silently made a new one — so a single mistyped digit minted a
  second record for someone who already existed. That is how the duplicates we
  cleaned up on 17/08 were born.

  Picking from the roster is therefore the primary path, and creating someone new
  is a separate, deliberate act (`onCreateNew`) rather than the fallback that
  happens when you get a digit wrong.

  Search matches name AND phone — including the guardian's, because siblings
  share a parent's number and are otherwise indistinguishable in a list.
*/

export interface PickableStudent {
  id: string;
  name: string;
  phone: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
}

interface StudentPickerProps {
  students: PickableStudent[];
  value: string | null;
  onChange: (studentId: string | null) => void;
  /** Renders an explicit "add someone new" row. Omit to forbid creation. */
  onCreateNew?: (typedQuery: string) => void;
  label?: string;
  id?: string;
  /** Students to hide (e.g. the lesson's current student on a replace). */
  excludeIds?: string[];
}

/** Digits only, so "050-123 4567", "0501234567" and "+972501234567" all match. */
function digits(v: string): string {
  return v.replace(/\D/g, '');
}

/** Trailing 9 digits — makes local and E.164 forms of one number comparable. */
function phoneKey(v: string | null | undefined): string {
  const d = digits(v ?? '');
  return d.length > 9 ? d.slice(-9) : d;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2);
  return parts[0][0] + parts[parts.length - 1][0];
}

const TONES = [
  'bg-primary-soft text-primary-700',
  'bg-accent-soft text-accent-text',
  'bg-success-soft text-success',
  'bg-warning-soft text-warning',
] as const;

function toneFor(name: string): string {
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  return TONES[sum % TONES.length];
}

/** E.164 → local display, kept LTR inside the RTL layout. */
function displayPhone(v: string | null | undefined): string | null {
  if (!v) return null;
  return v.startsWith('+972') ? '0' + v.slice(4) : v;
}

export function StudentPicker({
  students,
  value,
  onChange,
  onCreateNew,
  label = 'תלמיד/ה',
  id = 'student-picker',
  excludeIds,
}: StudentPickerProps) {
  const [query, setQuery] = React.useState('');
  const [activeIndex, setActiveIndex] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement>(null);

  const pool = React.useMemo(
    () => (excludeIds?.length ? students.filter((s) => !excludeIds.includes(s.id)) : students),
    [students, excludeIds],
  );

  const selected = React.useMemo(
    () => pool.find((s) => s.id === value) ?? null,
    [pool, value],
  );

  const results = React.useMemo(() => {
    const q = query.trim();
    if (!q) return pool;
    const qDigits = digits(q);
    const qLower = q.toLowerCase();
    return pool.filter((s) => {
      if (s.name.toLowerCase().includes(qLower)) return true;
      if (s.guardianName?.toLowerCase().includes(qLower)) return true;
      if (!qDigits) return false;
      // Match on any number that reaches this student, own or guardian's.
      return (
        phoneKey(s.phone).includes(qDigits) || phoneKey(s.guardianPhone).includes(qDigits)
      );
    });
  }, [pool, query]);

  React.useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function commit(index: number) {
    const s = results[index];
    if (s) {
      onChange(s.id);
      setQuery('');
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      // Never let Enter submit the surrounding form while choosing.
      e.preventDefault();
      commit(activeIndex);
    }
  }

  // ── A student is chosen: show them as a removable chip, not a list ──
  if (selected) {
    return (
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-ink">{label}</p>
        <div className="flex items-center gap-3 rounded-xl border border-primary-200 bg-primary-soft/60 p-2.5">
          <span
            aria-hidden="true"
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold',
              toneFor(selected.name),
            )}
          >
            {initials(selected.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold text-ink">{selected.name}</span>
            {displayPhone(selected.phone ?? selected.guardianPhone) && (
              <span className="block text-xs tabular-nums text-muted" dir="ltr">
                {displayPhone(selected.phone ?? selected.guardianPhone)}
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="החלפת תלמיד/ה"
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-white hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  // ── Nothing chosen yet: search ──
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <Input
          id={id}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="חיפוש לפי שם או טלפון…"
          className="pe-10"
          role="combobox"
          aria-expanded="true"
          aria-controls={`${id}-list`}
          autoComplete="off"
        />
      </div>

      <div
        ref={listRef}
        id={`${id}-list`}
        role="listbox"
        aria-label="תוצאות חיפוש"
        className="max-h-64 overflow-y-auto rounded-xl border border-line bg-white/70 p-1.5"
      >
        {results.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-7 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-primary-soft/60 text-primary-700 ring-1 ring-primary-100">
              <SearchX className="size-5" aria-hidden="true" />
            </span>
            <p className="text-sm font-medium text-ink">לא נמצא תלמיד/ה</p>
            <p className="text-xs text-muted">נסי שם אחר או מספר טלפון.</p>
          </div>
        ) : (
          <ul className="space-y-1">
            {results.map((s, i) => {
              const active = i === activeIndex;
              const shown = displayPhone(s.phone) ?? displayPhone(s.guardianPhone);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => commit(i)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-start transition-colors',
                      active ? 'bg-primary-50 ring-1 ring-primary-200' : 'hover:bg-primary-50/60',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold',
                        toneFor(s.name),
                      )}
                    >
                      {initials(s.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink">{s.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {shown ? (
                          <span dir="ltr" className="tabular-nums">
                            {shown}
                          </span>
                        ) : (
                          'ללא טלפון'
                        )}
                        {s.guardianName ? ` · ${s.guardianName}` : ''}
                      </span>
                    </span>
                    {active && <Check className="size-4 shrink-0 text-primary-700" aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {onCreateNew && (
        <button
          type="button"
          onClick={() => onCreateNew(query.trim())}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-dashed border-primary-300 bg-white/60 px-4 text-sm font-semibold text-primary-700 transition hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
        >
          <UserPlus className="size-4" aria-hidden="true" />
          {query.trim() ? `הוספת "${query.trim()}" כתלמיד/ה חדש/ה` : 'תלמיד/ה חדש/ה'}
        </button>
      )}
    </div>
  );
}
