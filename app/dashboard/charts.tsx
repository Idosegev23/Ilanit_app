'use client';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import { formatShekels } from '@/lib/utils';
import type {
  RevenuePoint,
  LessonsPerWeekPoint,
  WeekdayDistributionPoint,
  TopStudentPoint,
} from '@/lib/insights/aggregates';

// Recharts visualizations for the dashboard. Client component (Recharts needs
// the DOM). Hebrew labels; ₪ formatting via the shared util. Empty datasets
// render a friendly RTL placeholder rather than a blank canvas.

const BRAND = '#4f46e5';
const ACCENT = '#10b981';
const BAR_PALETTE = ['#4f46e5', '#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe'];

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex h-[260px] items-center justify-center text-sm text-slate-400">
      {label}
    </div>
  );
}

/** Short Hebrew day/month label `dd/MM` from a yyyy-MM-dd string. */
function shortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

export function RevenueChart({ data }: { data: RevenuePoint[] }) {
  if (data.length === 0) return <EmptyState label="אין נתוני הכנסה לתקופה זו" />;
  const rows = data.map((p) => ({ ...p, label: shortDate(p.date) }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="label" reversed tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} width={48} />
        <Tooltip
          formatter={(value: number) => [formatShekels(value), 'הכנסה']}
          labelFormatter={(l) => `תאריך ${l}`}
        />
        <Line type="monotone" dataKey="amount" stroke={BRAND} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function LessonsPerWeekChart({ data }: { data: LessonsPerWeekPoint[] }) {
  if (data.length === 0) return <EmptyState label="אין שיעורים לתקופה זו" />;
  const rows = data.map((p) => ({ ...p, label: shortDate(p.week) }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="label" reversed tick={{ fontSize: 12 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={32} />
        <Tooltip
          formatter={(value: number) => [value, 'שיעורים']}
          labelFormatter={(l) => `שבוע ${l}`}
        />
        <Bar dataKey="count" fill={ACCENT} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function OccupancyTrendChart({ data }: { data: WeekdayDistributionPoint[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) return <EmptyState label="אין נתוני תפוסה לתקופה זו" />;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={32} />
        <Tooltip
          formatter={(value: number) => [value, 'שיעורים']}
          labelFormatter={(l) => `יום ${l}`}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={BAR_PALETTE[i % BAR_PALETTE.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TopStudentsChart({ data }: { data: TopStudentPoint[] }) {
  if (data.length === 0) return <EmptyState label="אין נתוני תלמידים לתקופה זו" />;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
        <YAxis
          type="category"
          dataKey="firstName"
          orientation="right"
          width={72}
          tick={{ fontSize: 12 }}
        />
        <Tooltip
          formatter={(value: number, key) =>
            key === 'revenue' ? [formatShekels(value), 'הכנסה'] : [value, 'שיעורים']
          }
        />
        <Bar dataKey="lessons" radius={[4, 4, 4, 4]}>
          {data.map((_, i) => (
            <Cell key={i} fill={BAR_PALETTE[i % BAR_PALETTE.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
