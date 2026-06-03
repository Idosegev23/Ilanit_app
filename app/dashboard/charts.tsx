'use client';

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  LabelList,
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
// hexes — SVG fills need literal values, not CSS vars). Charts lean on warm
// gradient fills + muted, horizontal-only gridlines so the data leads and the
// chrome recedes (trend-emphasis, gridline-subtle).
const PRIMARY = '#b5471f'; // terracotta 500
const ACCENT = '#d98a2c'; // honey 500
// Terracotta → honey → peach ramp for categorical bars (all ≥3:1 against white).
const BAR_PALETTE = ['#b5471f', '#c2531f', '#d98a2c', '#e09a72', '#eebda1'];
const GRID = '#f0e6da'; // softened border-line (recedes behind data)
const AXIS = '#6e5f54'; // muted text
const CHART_H = 248;

const AXIS_TICK = { fontSize: 12, fill: AXIS, fontWeight: 500 } as const;

const TOOLTIP_STYLE = {
  borderRadius: 14,
  border: '1px solid #ecdfd2',
  boxShadow: '0 20px 48px -12px rgba(70,40,25,.28)',
  fontSize: 13,
  padding: '8px 12px',
} as const;
const TOOLTIP_LABEL_STYLE = { color: '#2b211c', fontWeight: 600 } as const;
const TOOLTIP_ITEM_STYLE = { color: '#6e5f54' } as const;

function ChartEmpty({ label }: { label: string }) {
  return (
    <div className="flex h-[248px] items-center justify-center">
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
    <ResponsiveContainer width="100%" height={CHART_H}>
      <AreaChart data={rows} margin={{ top: 10, right: 6, left: 6, bottom: 0 }}>
        <defs>
          <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={PRIMARY} stopOpacity={0.32} />
            <stop offset="55%" stopColor={ACCENT} stopOpacity={0.14} />
            <stop offset="100%" stopColor={ACCENT} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="2 6" stroke={GRID} vertical={false} />
        <XAxis
          dataKey="label"
          reversed
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          minTickGap={24}
        />
        <YAxis
          tick={AXIS_TICK}
          width={52}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => formatShekels(v)}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          itemStyle={TOOLTIP_ITEM_STYLE}
          cursor={{ stroke: ACCENT, strokeWidth: 1, strokeDasharray: '4 4' }}
          formatter={(value: number) => [formatShekels(value), 'הכנסה']}
          labelFormatter={(l) => `תאריך ${l}`}
        />
        <Area
          type="monotone"
          dataKey="amount"
          stroke={PRIMARY}
          strokeWidth={2.5}
          fill="url(#revenueFill)"
          dot={false}
          activeDot={{ r: 4, fill: PRIMARY, stroke: '#fff', strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function LessonsPerWeekChart({ data }: { data: LessonsPerWeekPoint[] }) {
  if (data.length === 0) return <ChartEmpty label="אין שיעורים לתקופה זו" />;
  const rows = data.map((p) => ({ ...p, label: shortDate(p.week) }));
  return (
    <ResponsiveContainer width="100%" height={CHART_H}>
      <BarChart data={rows} margin={{ top: 10, right: 6, left: 6, bottom: 0 }}>
        <defs>
          <linearGradient id="lessonsBar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity={1} />
            <stop offset="100%" stopColor="#f0b27a" stopOpacity={0.85} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="2 6" stroke={GRID} vertical={false} />
        <XAxis
          dataKey="label"
          reversed
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          minTickGap={16}
        />
        <YAxis allowDecimals={false} tick={AXIS_TICK} width={32} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          itemStyle={TOOLTIP_ITEM_STYLE}
          cursor={{ fill: '#fdefe6', radius: 6 }}
          formatter={(value: number) => [value, 'שיעורים']}
          labelFormatter={(l) => `שבוע ${l}`}
        />
        <Bar dataKey="count" fill="url(#lessonsBar)" radius={[8, 8, 0, 0]} maxBarSize={44} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function OccupancyTrendChart({ data }: { data: WeekdayDistributionPoint[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) return <ChartEmpty label="אין נתוני תפוסה לתקופה זו" />;
  return (
    <ResponsiveContainer width="100%" height={CHART_H}>
      <BarChart data={data} margin={{ top: 10, right: 6, left: 6, bottom: 0 }}>
        <defs>
          {BAR_PALETTE.map((c, i) => (
            <linearGradient key={i} id={`weekdayBar-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c} stopOpacity={1} />
              <stop offset="100%" stopColor={c} stopOpacity={0.7} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="2 6" stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} />
        <YAxis allowDecimals={false} tick={AXIS_TICK} width={32} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          itemStyle={TOOLTIP_ITEM_STYLE}
          cursor={{ fill: '#fdefe6', radius: 6 }}
          formatter={(value: number) => [value, 'שיעורים']}
          labelFormatter={(l) => `יום ${l}`}
        />
        <Bar dataKey="count" radius={[8, 8, 0, 0]} maxBarSize={40}>
          {data.map((_, i) => (
            <Cell key={i} fill={`url(#weekdayBar-${i % BAR_PALETTE.length})`} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TopStudentsChart({ data }: { data: TopStudentPoint[] }) {
  if (data.length === 0) return <ChartEmpty label="אין נתוני תלמידים לתקופה זו" />;
  return (
    <ResponsiveContainer width="100%" height={CHART_H}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 6, right: 28, left: 6, bottom: 0 }}
      >
        <defs>
          {BAR_PALETTE.map((c, i) => (
            <linearGradient key={i} id={`topBar-${i}`} x1="1" y1="0" x2="0" y2="0">
              <stop offset="0%" stopColor={c} stopOpacity={1} />
              <stop offset="100%" stopColor={c} stopOpacity={0.78} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="2 6" stroke={GRID} horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
        <YAxis
          type="category"
          dataKey="firstName"
          orientation="right"
          width={76}
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          itemStyle={TOOLTIP_ITEM_STYLE}
          cursor={{ fill: '#fdefe6', radius: 6 }}
          formatter={(value: number, key) =>
            key === 'revenue' ? [formatShekels(value), 'הכנסה'] : [value, 'שיעורים']
          }
        />
        <Bar dataKey="lessons" radius={[8, 8, 8, 8]} maxBarSize={26}>
          {data.map((_, i) => (
            <Cell key={i} fill={`url(#topBar-${i % BAR_PALETTE.length})`} />
          ))}
          <LabelList
            dataKey="lessons"
            position="left"
            offset={8}
            className="fill-ink"
            style={{ fontSize: 12, fontWeight: 600 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
