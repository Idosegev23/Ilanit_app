'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  Users,
  Archive,
  Search,
  CircleDollarSign,
  UserCheck,
  Phone,
  Tag,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { formatShekels, cn } from '@/lib/utils';
import { StudentFormDialog } from './student-form-dialog';

// Client directory: a stat summary band, a live search field, and a premium
// table (avatar initials, phone, private-lesson price). Server data is passed in
// untouched; filtering happens client-side. The "תלמיד חדש" CTA + per-row prices
// expose the students.defaultPrice field set in the form dialog.

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
const AVATAR_TONES = [
  'bg-primary-soft text-primary-600',
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
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <MiniStat icon={Users} tone="primary" label="סה״כ תלמידים" value={stats.total} />
          <MiniStat icon={UserCheck} tone="success" label="פעילים" value={stats.active} />
          <MiniStat icon={Tag} tone="accent" label="עם מחיר מוגדר" value={stats.priced} />
          <MiniStat icon={Archive} tone="warning" label="בארכיון" value={stats.archived} />
        </div>
      )}

      {/* ── Search + actions toolbar ── */}
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search
            className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted"
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
            className="pe-10"
          />
        </div>
        <div className="shrink-0">
          <StudentFormDialog
            settingsDefaultPrice={settingsDefaultPrice}
            triggerVariant="gradient"
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
        <Card className="px-6 py-12 text-center">
          <p className="text-sm text-muted">
            לא נמצאו תלמידים שתואמים ל״<span className="font-medium text-ink">{query}</span>״.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {filtered.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/students/${s.id}`}
                  className="group flex items-center gap-3 px-4 py-3.5 transition-colors duration-150 hover:bg-primary-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:gap-4 sm:px-5"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex size-11 shrink-0 items-center justify-center rounded-2xl text-sm font-bold shadow-soft',
                      toneFor(s.name),
                    )}
                  >
                    {initials(s.name)}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold text-ink transition-colors duration-150 group-hover:text-primary-600">
                        {s.name}
                      </span>
                      {s.archived && (
                        <Badge tone="muted">
                          <Archive className="size-3.5" aria-hidden="true" />
                          ארכיון
                        </Badge>
                      )}
                    </div>
                    <span
                      dir="ltr"
                      className="mt-0.5 flex items-center justify-end gap-1.5 text-sm tabular-nums text-muted"
                    >
                      <span className="truncate">{s.phone}</span>
                      <Phone className="size-3.5 shrink-0" aria-hidden="true" />
                    </span>
                  </div>

                  <div className="hidden text-end sm:block">
                    {s.defaultPrice != null ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-sm font-semibold tabular-nums text-success">
                        <CircleDollarSign className="size-3.5" aria-hidden="true" />
                        {formatShekels(s.defaultPrice)}
                      </span>
                    ) : (
                      <span className="text-sm text-muted">ללא מחיר</span>
                    )}
                  </div>

                  <ChevronLeft
                    className="size-5 shrink-0 text-muted transition-transform duration-150 group-hover:text-primary-600 motion-safe:group-hover:-translate-x-0.5"
                    aria-hidden="true"
                  />
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
}: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>;
  tone: 'primary' | 'accent' | 'success' | 'warning';
  label: string;
  value: number;
}) {
  const chip = {
    primary: 'bg-primary-soft text-primary-600',
    accent: 'bg-accent-soft text-accent-text',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
  }[tone];
  return (
    <Card className="overflow-hidden">
      <div className="bg-gradient-tint px-4 pt-4">
        <span className={cn('flex size-9 items-center justify-center rounded-xl shadow-soft', chip)}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
      </div>
      <div className="px-4 pb-4 pt-2">
        <p className="text-2xl font-bold tabular-nums text-ink">{value}</p>
        <p className="mt-0.5 text-xs font-medium text-muted">{label}</p>
      </div>
    </Card>
  );
}
