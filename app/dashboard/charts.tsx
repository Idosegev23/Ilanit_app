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
import { CalendarRange } from 'lucide-react';
import { formatShekels } from '@/lib/utils';
import { EmptyState as UIEmptyState } from '@/components/ui/empty-state';
import type {
  RevenuePoint,
  LessonsPerWeekPoint,
  WeekdayDistributionPoint,
  TopStudentPoint,
} from '@/lib/insights/aggregates';

// Recharts visualizations for the dashboard. Client component (Recharts needs
// the DOM). Hebrew labels; ₪ formatting via the shared util. Empty datasets
// render a friendly RTL placeholder rather than a blank canvas.
//
// Colors use the warm "terracotta / honey" design-system palette (resolved
// hexes — SVG fills need literal values, not CSS vars).
const PRIMARY = '#b84e26'; // terracotta 500
const ACCENT = '#c98a2b'; // honey 500
// Terracotta → peach ramp for categorical bars (all ≥3:1 against white grid).
const BAR_PALETTE = ['#b84e26', '#9e4220', '#e29b78', '#c98a2b', '#eec0a8'];
const GRID = '#eadfd2'; // border-line
const AXIS = '#6f6157'; // muted text

const AXIS_TICK = { fontSize: 12, fill: AXIS } as const;

const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: '1px solid #eadfd2',
  boxShadow: '0 12px 32px rgba(46,37,33,.12)',
  fontSize: 13,
} as const;

function ChartEmpty({ label }: { label: string }) {
  return (
    <div className="flex h-[260px] items-center justify-center">
      <UIEmptyState icon={CalendarRange} title={label} className="border-0 bg-transparent py-0" />
    </div>
  );
}

/** Short Hebrew day/month label `dd/MM` from a yyyy-MM-dd string. */
function shortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

export function RevenueChart({ data }: { data: RevenuePoint[] }) {
  if (data.length === 0) return <ChartEmpty label="אין נתוני הכנסה לתקופה זו" />;
  const rows = data.map((p) => ({ ...p, label: shortDate(p.date) }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
        <XAxis dataKey="label" reversed tick={AXIS_TICK} stroke={GRID} />
        <YAxis tick={AXIS_TICK} width={48} stroke={GRID} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          cursor={{ stroke: GRID }}
          formatter={(value: number) => [formatShekels(value), 'הכנסה']}
          labelFormatter={(l) => `תאריך ${l}`}
        />
        <Line type="monotone" dataKey="amount" stroke={PRIMARY} strokeWidth={2.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function LessonsPerWeekChart({ data }: { data: LessonsPerWeekPoint[] }) {
  if (data.length === 0) return <ChartEmpty label="אין שיעורים לתקופה זו" />;
  const rows = data.map((p) => ({ ...p, label: shortDate(p.week) }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
        <XAxis dataKey="label" reversed tick={AXIS_TICK} stroke={GRID} />
        <YAxis allowDecimals={false} tick={AXIS_TICK} width={32} stroke={GRID} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          cursor={{ fill: '#fbeee4' }}
          formatter={(value: number) => [value, 'שיעורים']}
          labelFormatter={(l) => `שבוע ${l}`}
        />
        <Bar dataKey="count" fill={ACCENT} radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function OccupancyTrendChart({ data }: { data: WeekdayDistributionPoint[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) return <ChartEmpty label="אין נתוני תפוסה לתקופה זו" />;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
        <XAxis dataKey="label" tick={AXIS_TICK} stroke={GRID} />
        <YAxis allowDecimals={false} tick={AXIS_TICK} width={32} stroke={GRID} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          cursor={{ fill: '#fbeee4' }}
          formatter={(value: number) => [value, 'שיעורים']}
          labelFormatter={(l) => `יום ${l}`}
        />
        <Bar dataKey="count" radius={[6, 6, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={BAR_PALETTE[i % BAR_PALETTE.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TopStudentsChart({ data }: { data: TopStudentPoint[] }) {
  if (data.length === 0) return <ChartEmpty label="אין נתוני תלמידים לתקופה זו" />;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} stroke={GRID} />
        <YAxis
          type="category"
          dataKey="firstName"
          orientation="right"
          width={72}
          tick={AXIS_TICK}
          stroke={GRID}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          cursor={{ fill: '#fbeee4' }}
          formatter={(value: number, key) =>
            key === 'revenue' ? [formatShekels(value), 'הכנסה'] : [value, 'שיעורים']
          }
        />
        <Bar dataKey="lessons" radius={[6, 6, 6, 6]}>
          {data.map((_, i) => (
            <Cell key={i} fill={BAR_PALETTE[i % BAR_PALETTE.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
