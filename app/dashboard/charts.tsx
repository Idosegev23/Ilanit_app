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
import type {
  RevenuePoint,
  LessonsPerWeekPoint,
  WeekdayDistributionPoint,
  TopStudentPoint,
} from '@/lib/insights/aggregates';

/*
  Recharts visualizations for the dashboard. Client component (Recharts needs the
  DOM). Hebrew labels; ₪ formatting via the shared util. Empty datasets render a
  friendly RTL placeholder rather than a blank canvas.

  ── Color contract (v4 "Blush Aurora") ──
  Series fills are the ONLY place in app/** allowed to carry literal hex: SVG
  paint is resolved per-shape and the gradient <stop> elements need real values.
  Everything that is chrome rather than data — gridlines, axis ticks, cursors,
  tooltip — is driven from the design tokens instead.

  Those tokens are applied through `style` (inline CSS), never through the SVG
  presentation attribute: `var()` is only reliably substituted in a CSS
  declaration, and an unresolved `stroke="var(--x)"` would silently erase the
  gridlines. Recharts forwards `style` down to each rendered SVG node, and an
  inline declaration outranks the presentation attribute it sets alongside it.

  Data hues favour the deep blush (#b84a7b, 4.9:1 on white) for strokes and the
  lead bar, because #f493be alone is 2.15:1 — fine as a large tinted area, too
  faint to carry a 2px line.
*/
const PINK = '#f493be'; // primary blush — large fills
const PEACH = '#fad5bb'; // accent peach — secondary fills
const DEEP = '#b84a7b'; // deep blush — strokes, lead series
const GREEN = '#2e7d5b'; // success green — third categorical

// Categorical ramp, ordered strongest-first so the dominant bar is the legible one.
const BAR_PALETTE = [DEEP, PINK, GREEN, PEACH];
const CHART_H = 248;

// Ticks: token color via inline style so it survives as a CSS declaration.
const AXIS_TICK = {
  fontSize: 12,
  fontWeight: 500,
  style: { fill: 'var(--color-muted)' },
} as const;

// Gridlines: same technique — the hairline is decorative, so it uses --color-line.
const GRID_STYLE = { stroke: 'var(--color-line)' } as const;

// Tooltip reads as a small glass card: translucent white, blur, pink-tinted pop.
const TOOLTIP_STYLE = {
  borderRadius: 18,
  border: '1px solid var(--color-line)',
  backgroundColor: 'rgba(var(--color-glass), 0.92)',
  backdropFilter: 'blur(16px) saturate(1.3)',
  WebkitBackdropFilter: 'blur(16px) saturate(1.3)',
  boxShadow: '0 28px 64px -18px rgba(var(--shadow-tint), 0.34)',
  fontSize: 13,
  padding: '10px 14px',
} as const;
const TOOLTIP_LABEL_STYLE = {
  color: 'var(--color-ink)',
  fontWeight: 700,
  marginBottom: 2,
} as const;
const TOOLTIP_ITEM_STYLE = { color: 'var(--color-ink)' } as const;

// Hover cursors — a blush wash behind bars, a dashed blush guide on the area.
const BAR_CURSOR = {
  style: { fill: 'var(--color-primary-100)' },
  radius: 8,
} as const;
const LINE_CURSOR = {
  style: { stroke: 'var(--color-primary-300)' },
  strokeWidth: 1.5,
  strokeDasharray: '4 5',
} as const;

// Active point on the revenue area: deep blush disc ringed in the card surface.
const ACTIVE_DOT = {
  r: 4.5,
  fill: DEEP,
  strokeWidth: 2,
  style: { stroke: 'var(--color-surface)' },
} as const;

function ChartEmpty({ label }: { label: string }) {
  return (
    <div className="flex h-[248px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line bg-primary-50/50 px-6 text-center">
      {/* primary-700, not primary: #f493be on white is 2.15:1 — too faint for a glyph. */}
      <span className="flex size-14 items-center justify-center rounded-full bg-surface text-primary-700 shadow-soft ring-1 ring-primary-100">
        <CalendarRange className="size-6" aria-hidden="true" />
      </span>
      <p className="text-sm font-medium text-muted">{label}</p>
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
            <stop offset="0%" stopColor={PINK} stopOpacity={0.55} />
            <stop offset="55%" stopColor={PEACH} stopOpacity={0.24} />
            <stop offset="100%" stopColor={PEACH} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="2 6" style={GRID_STYLE} vertical={false} />
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
          cursor={LINE_CURSOR}
          formatter={(value: number) => [formatShekels(value), 'הכנסה']}
          labelFormatter={(l) => `תאריך ${l}`}
        />
        <Area
          type="monotone"
          dataKey="amount"
          stroke={DEEP}
          strokeWidth={2.5}
          fill="url(#revenueFill)"
          dot={false}
          activeDot={ACTIVE_DOT}
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
            <stop offset="0%" stopColor={DEEP} stopOpacity={1} />
            <stop offset="100%" stopColor={PINK} stopOpacity={0.9} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="2 6" style={GRID_STYLE} vertical={false} />
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
          cursor={BAR_CURSOR}
          formatter={(value: number) => [value, 'שיעורים']}
          labelFormatter={(l) => `שבוע ${l}`}
        />
        <Bar dataKey="count" fill="url(#lessonsBar)" radius={[10, 10, 4, 4]} maxBarSize={44} />
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
              <stop offset="100%" stopColor={c} stopOpacity={0.62} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="2 6" style={GRID_STYLE} vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} />
        <YAxis allowDecimals={false} tick={AXIS_TICK} width={32} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          itemStyle={TOOLTIP_ITEM_STYLE}
          cursor={BAR_CURSOR}
          formatter={(value: number) => [value, 'שיעורים']}
          labelFormatter={(l) => `יום ${l}`}
        />
        <Bar dataKey="count" radius={[10, 10, 4, 4]} maxBarSize={40}>
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
              <stop offset="100%" stopColor={c} stopOpacity={0.68} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="2 6" style={GRID_STYLE} horizontal={false} />
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
          cursor={BAR_CURSOR}
          formatter={(value: number, key) =>
            key === 'revenue' ? [formatShekels(value), 'הכנסה'] : [value, 'שיעורים']
          }
        />
        <Bar dataKey="lessons" radius={[10, 10, 10, 10]} maxBarSize={26}>
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
