'use client';

import * as React from 'react';
import { Search, Users, CheckSquare, Square, Phone, PhoneOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AudienceRow } from './types';

/*
  Recipient selection: search, checkboxes, filters and sorting.

  Selection is by STUDENT, but delivery is by PHONE — siblings share a guardian's
  number, so the running total shown here is the number of MESSAGES that will
  actually go out, not the number of boxes ticked. Ilanit should never be
  surprised by that difference at the confirm step.
*/

type SortKey = 'name' | 'lastLesson' | 'nextLesson';

interface Props {
  audience: AudienceRow[];
  groupNames: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}

function displayPhone(v: string | null): string | null {
  if (!v) return null;
  return v.startsWith('+972') ? '0' + v.slice(4) : v;
}

/** The number a message to this student actually goes to (guardian wins). */
function contactOf(s: AudienceRow): string | null {
  const g = s.guardianPhone?.trim();
  return g ? g : (s.phone?.trim() || null);
}

export function RecipientPicker({ audience, groupNames, selected, onChange }: Props) {
  const [query, setQuery] = React.useState('');
  const [group, setGroup] = React.useState('');
  const [sort, setSort] = React.useState<SortKey>('name');
  const [onlyUpcoming, setOnlyUpcoming] = React.useState(false);
  const [includeArchived, setIncludeArchived] = React.useState(false);

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const qDigits = query.replace(/\D/g, '');
    let rows = audience.filter((s) => {
      if (!includeArchived && s.archived) return false;
      if (group && !s.groups.includes(group)) return false;
      if (onlyUpcoming && !s.nextLessonAt) return false;
      if (!q) return true;
      if (s.name.toLowerCase().includes(q)) return true;
      if (s.guardianName?.toLowerCase().includes(q)) return true;
      if (!qDigits) return false;
      return (
        (s.phone ?? '').includes(qDigits) || (s.guardianPhone ?? '').includes(qDigits)
      );
    });
    rows = [...rows].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, 'he');
      const key = sort === 'lastLesson' ? 'lastLessonAt' : 'nextLessonAt';
      const av = a[key] ? new Date(a[key] as string).getTime() : 0;
      const bv = b[key] ? new Date(b[key] as string).getTime() : 0;
      return bv - av; // most recent / soonest-known first
    });
    return rows;
  }, [audience, query, group, sort, onlyUpcoming, includeArchived]);

  const visibleIds = React.useMemo(() => visible.map((s) => s.id), [visible]);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  function toggleAllVisible() {
    const next = new Set(selected);
    if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
    else visibleIds.forEach((id) => next.add(id));
    onChange(next);
  }

  // The figure that matters: distinct phones among the selected, plus anyone
  // selected who has no number at all and simply cannot be reached.
  const { messages, unreachable } = React.useMemo(() => {
    const phones = new Set<string>();
    let none = 0;
    for (const s of audience) {
      if (!selected.has(s.id)) continue;
      const p = contactOf(s);
      if (p) phones.add(p);
      else none++;
    }
    return { messages: phones.size, unreachable: none };
  }, [audience, selected]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="primary" className="px-3 py-1.5 text-sm">
          <Users className="size-4" aria-hidden="true" />
          {selected.size} נבחרו
        </Badge>
        <Badge tone={messages > 0 ? 'success' : 'muted'} className="px-3 py-1.5 text-sm">
          <Phone className="size-4" aria-hidden="true" />
          {messages} הודעות יישלחו
        </Badge>
        {unreachable > 0 && (
          <Badge tone="warning" className="px-3 py-1.5 text-sm">
            <PhoneOff className="size-4" aria-hidden="true" />
            {unreachable} ללא טלפון
          </Badge>
        )}
      </div>

      {selected.size > messages + unreachable && (
        <p className="rounded-xl bg-accent-soft px-3.5 py-2.5 text-xs leading-relaxed text-accent-text">
          חלק מהנבחרים חולקים מספר טלפון (אחים תחת אותו הורה) — הם יקבלו הודעה
          אחת משותפת ולא אחת לכל אחד.
        </p>
      )}

      <div className="relative">
        <Search
          className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חיפוש לפי שם, הורה או טלפון…"
          className="pe-10"
          aria-label="חיפוש נמענים"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Select value={group} onChange={(e) => setGroup(e.target.value)} aria-label="סינון לפי קבוצה">
          <option value="">כל הקבוצות</option>
          {groupNames.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </Select>
        <Select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="מיון"
        >
          <option value="name">מיון: שם</option>
          <option value="lastLesson">מיון: שיעור אחרון</option>
          <option value="nextLesson">מיון: שיעור הבא</option>
        </Select>
      </div>

      <div className="flex flex-wrap gap-2">
        <FilterChip active={onlyUpcoming} onClick={() => setOnlyUpcoming((v) => !v)}>
          רק עם שיעור עתידי
        </FilterChip>
        <FilterChip active={includeArchived} onClick={() => setIncludeArchived((v) => !v)}>
          כולל ארכיון
        </FilterChip>
      </div>

      <button
        type="button"
        onClick={toggleAllVisible}
        disabled={visibleIds.length === 0}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-line bg-white/70 px-4 text-sm font-semibold text-ink transition hover:bg-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
      >
        {allVisibleSelected ? (
          <Square className="size-4" aria-hidden="true" />
        ) : (
          <CheckSquare className="size-4" aria-hidden="true" />
        )}
        {allVisibleSelected ? 'ניקוי הבחירה המוצגת' : `בחירת כל ${visibleIds.length} המוצגים`}
      </button>

      <ul
        className="max-h-[26rem] space-y-1 overflow-y-auto rounded-2xl border border-line bg-white/60 p-1.5"
        aria-label="רשימת נמענים"
      >
        {visible.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-muted">אין תוצאות לסינון הזה.</li>
        )}
        {visible.map((s) => {
          const on = selected.has(s.id);
          const phone = displayPhone(contactOf(s));
          return (
            <li key={s.id}>
              <label
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-colors',
                  on ? 'bg-primary-50 ring-1 ring-primary-200' : 'hover:bg-primary-50/60',
                )}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(s.id)}
                  className="size-5 shrink-0 accent-ink"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium text-ink">{s.name}</span>
                    {s.archived && (
                      <Badge tone="muted" className="shrink-0 text-[10px]">
                        ארכיון
                      </Badge>
                    )}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {phone ? (
                      <span dir="ltr" className="tabular-nums">
                        {phone}
                      </span>
                    ) : (
                      'ללא טלפון — לא יקבל/ת'
                    )}
                    {s.guardianName ? ` · ${s.guardianName}` : ''}
                    {s.groups.length ? ` · ${s.groups.join(', ')}` : ''}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-11 items-center rounded-full border px-4 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink',
        active
          ? 'border-transparent bg-ink text-white shadow-card'
          : 'border-line bg-white/70 text-muted hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}
