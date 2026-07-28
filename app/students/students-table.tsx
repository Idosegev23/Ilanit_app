'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  Users,
  Archive,
  Search,
  SearchX,
  X,
  CircleDollarSign,
  UserCheck,
  Phone,
  Tag,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { formatShekels, cn } from '@/lib/utils';
import { StudentFormDialog } from './student-form-dialog';
import { ScheduleLessonDialog } from './schedule-lesson-dialog';

// Client directory: a stat summary band, a live search field, and a premium
// list (avatar initials, phone, private-lesson price). Server data is passed in
// untouched; filtering happens client-side. The "תלמיד חדש" CTA + per-row prices
// expose the students.defaultPrice field set in the form dialog.
//
// Layout is phone-first: at 390px each row is a two-line card (name + archived
// chip on top, phone and price side by side underneath) with a 44px schedule
// button and a 44px chevron; the price only moves out to its own column from
// `sm:` upward, where there is room for it.

export interface StudentRow {
  id: string;
  name: string;
  phone: string;
  defaultPrice: number | null;
  defaultDurationMin: number;
  email: string | null;
  notes: string | null;
  archived: boolean;
}

interface StudentsTableProps {
  students: StudentRow[];
  settingsDefaultPrice: number | null;
}

// Deterministic warm chip color from the name (no randomness on re-render).
// The blush tone uses primary-700 (4.9:1), never primary-600 (2.8:1) — initials
// are text and have to be readable.
const AVATAR_TONES = [
  'bg-primary-soft text-primary-700',
  'bg-accent-soft text-accent-text',
  'bg-success-soft text-success',
  'bg-warning-soft text-warning',
] as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2);
  return parts[0][0] + parts[parts.length - 1][0];
}

function toneFor(name: string): string {
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  return AVATAR_TONES[sum % AVATAR_TONES.length];
}

export function StudentsTable({ students, settingsDefaultPrice }: StudentsTableProps) {
  const [query, setQuery] = React.useState('');

  const stats = React.useMemo(() => {
    const active = students.filter((s) => !s.archived).length;
    const archived = students.length - active;
    const priced = students.filter((s) => s.defaultPrice != null).length;
    return { total: students.length, active, archived, priced };
  }, [students]);

  const filtered = React.useMemo(() => {
    const q = query.trim();
    if (!q) return students;
    const digits = q.replace(/[\s-]/g, '');
    return students.filter(
      (s) => s.name.includes(q) || (digits && s.phone.includes(digits)),
    );
  }, [students, query]);

  return (
    <div className="space-y-6">
      {/* ── Stat summary band ── */}
      {students.length > 0 && (
        <div className="stagger grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <MiniStat index={0} icon={Users} tone="primary" label="סה״כ תלמידים" value={stats.total} />
          <MiniStat index={1} icon={UserCheck} tone="success" label="פעילים" value={stats.active} />
          <MiniStat index={2} icon={Tag} tone="accent" label="עם מחיר מוגדר" value={stats.priced} />
          <MiniStat index={3} icon={Archive} tone="warning" label="בארכיון" value={stats.archived} />
        </div>
      )}

      {/* ── Search + actions toolbar ── */}
      <Card className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="relative w-full sm:max-w-sm">
          <Search
            className="pointer-events-none absolute end-4 top-1/2 size-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <label htmlFor="students-search" className="sr-only">
            חיפוש תלמיד לפי שם או טלפון
          </label>
          <Input
            id="students-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש לפי שם או טלפון…"
            className="h-12 rounded-full pe-11"
          />
        </div>
        <div className="shrink-0">
          <StudentFormDialog
            settingsDefaultPrice={settingsDefaultPrice}
            triggerVariant="gradient"
            triggerClassName="w-full sm:w-auto"
          />
        </div>
      </Card>

      {/* ── List ── */}
      {students.length === 0 ? (
        <EmptyState
          icon={Users}
          title="עדיין אין תלמידים"
          description="הוסיפי תלמיד/ה ידנית, או שלחי לינק לתיאום — תלמידים נוספים אוטומטית למאגר."
          action={
            <StudentFormDialog
              settingsDefaultPrice={settingsDefaultPrice}
              triggerVariant="primary"
            />
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="לא נמצאו תלמידים תואמים"
          description={`אין תלמיד/ה שתואם/ת ל״${query}״. נסי שם או מספר טלפון אחר.`}
          action={
            <Button type="button" variant="secondary" onClick={() => setQuery('')}>
              <X className="size-4" aria-hidden="true" />
              ניקוי החיפוש
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden p-1.5 sm:p-2">
          <ul className="flex flex-col gap-1">
            {filtered.map((s) => (
              <li
                key={s.id}
                className="group flex items-center gap-1.5 rounded-2xl px-1 py-1 transition-colors duration-150 hover:bg-primary-50/70 sm:gap-2 sm:px-1.5"
              >
                <Link
                  href={`/students/${s.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink sm:gap-4"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex size-12 shrink-0 items-center justify-center rounded-2xl text-sm font-bold shadow-soft ring-1 ring-inset ring-white/70',
                      toneFor(s.name),
                    )}
                  >
                    {initials(s.name)}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-bold tracking-tight text-ink transition-colors duration-150 group-hover:text-primary-700">
                        {s.name}
                      </span>
                      {s.archived && (
                        <Badge tone="muted" className="shrink-0">
                          <Archive className="size-3.5" aria-hidden="true" />
                          ארכיון
                        </Badge>
                      )}
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <span
                        dir="ltr"
                        className="inline-flex items-center gap-1.5 text-sm tabular-nums text-muted"
                      >
                        <span className="truncate">{s.phone}</span>
                        <Phone className="size-3.5 shrink-0" aria-hidden="true" />
                      </span>
                      {/* Price rides along under the name on a phone; from `sm:`
                          it lives in its own column at the inline-end instead. */}
                      {s.defaultPrice != null ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-xs font-semibold tabular-nums text-success sm:hidden">
                          <CircleDollarSign className="size-3" aria-hidden="true" />
                          {formatShekels(s.defaultPrice)}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="hidden text-end sm:block">
                    {s.defaultPrice != null ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1.5 text-sm font-semibold tabular-nums text-success ring-1 ring-inset ring-white/60">
                        <CircleDollarSign className="size-3.5" aria-hidden="true" />
                        {formatShekels(s.defaultPrice)}
                      </span>
                    ) : (
                      <span className="text-sm text-muted">ללא מחיר</span>
                    )}
                  </div>
                </Link>

                {/* Primary admin action: Ilanit sets the lesson herself. */}
                <ScheduleLessonDialog
                  student={{
                    id: s.id,
                    name: s.name,
                    defaultPrice: s.defaultPrice,
                    defaultDurationMin: s.defaultDurationMin,
                  }}
                  settingsDefaultPrice={settingsDefaultPrice}
                  triggerVariant="primary"
                  triggerSize="sm"
                  triggerClassName="shrink-0"
                />

                <Link
                  href={`/students/${s.id}`}
                  aria-label={`פתיחת תיק ${s.name}`}
                  className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors duration-150 hover:bg-primary-50 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                >
                  <ChevronLeft className="size-5" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function MiniStat({
  icon: Icon,
  tone,
  label,
  value,
  index,
}: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>;
  tone: 'primary' | 'accent' | 'success' | 'warning';
  label: string;
  value: number;
  index: number;
}) {
  // primary-700, not primary-600: a glyph needs ≥3:1 and #e06b9f is 2.8:1 here.
  const chip = {
    primary: 'bg-primary-soft text-primary-700',
    accent: 'bg-accent-soft text-accent-text',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
  }[tone];
  return (
    <Card
      className="hover-lift overflow-hidden"
      style={{ '--i': index } as React.CSSProperties}
    >
      <div className="flex items-start justify-between gap-2 bg-gradient-tint px-4 pt-4">
        <p className="pt-1 text-xs font-medium text-muted">{label}</p>
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-2xl shadow-soft ring-1 ring-inset ring-white/70',
            chip,
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>
      </div>
      <div className="px-4 pb-4 pt-1">
        <p className="text-3xl font-extrabold tracking-tight tabular-nums text-ink">{value}</p>
      </div>
    </Card>
  );
}
