import * as React from 'react';
import {
  Clock,
  CheckCircle2,
  XCircle,
  Ban,
  CircleDollarSign,
  ReceiptText,
  HelpCircle,
  type LucideIcon,
} from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// Soft pill: rounded-full, soft-bg + colored text. Color is never the only
// signal — every semantic status also carries a lucide icon.
export const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium leading-none',
  {
    variants: {
      tone: {
        neutral: 'bg-primary-50 text-ink',
        primary: 'bg-primary-soft text-primary-600',
        accent: 'bg-accent-soft text-accent-text',
        success: 'bg-success-soft text-success',
        warning: 'bg-warning-soft text-warning',
        danger: 'bg-danger-soft text-danger',
        muted: 'bg-primary-50 text-muted',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

// ── Status → tone + icon + Hebrew label map (per design contract §badge) ──
export type StatusKind =
  | 'pending'
  | 'confirmed'
  | 'completed'
  | 'rejected'
  | 'cancelled'
  | 'due'
  | 'paid'
  | 'waived'
  | 'needs_match';

const STATUS_MAP: Record<
  StatusKind,
  { tone: NonNullable<BadgeProps['tone']>; icon: LucideIcon; label: string }
> = {
  pending: { tone: 'accent', icon: Clock, label: 'ממתין' },
  confirmed: { tone: 'success', icon: CheckCircle2, label: 'מאושר' },
  completed: { tone: 'success', icon: CheckCircle2, label: 'בוצע' },
  rejected: { tone: 'muted', icon: XCircle, label: 'נדחה' },
  cancelled: { tone: 'muted', icon: Ban, label: 'בוטל' },
  due: { tone: 'warning', icon: CircleDollarSign, label: 'לתשלום' },
  paid: { tone: 'success', icon: ReceiptText, label: 'שולם' },
  waived: { tone: 'muted', icon: ReceiptText, label: 'פטור' },
  needs_match: { tone: 'danger', icon: HelpCircle, label: 'דורש שיוך' },
};

export interface StatusPillProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: StatusKind;
  /** Override the default Hebrew label. */
  label?: string;
}

export function StatusPill({ status, label, className, ...props }: StatusPillProps) {
  const cfg = STATUS_MAP[status] ?? STATUS_MAP.pending;
  const Icon = cfg.icon;
  return (
    <Badge tone={cfg.tone} className={className} {...props}>
      <Icon className="size-3.5" aria-hidden="true" />
      {label ?? cfg.label}
    </Badge>
  );
}
