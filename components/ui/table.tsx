import * as React from 'react';
import { cn } from '@/lib/utils';

// Clean warm table. Wrap in <Table> (provides rounded-2xl clip + horizontal
// scroll on mobile). Header row = primary-50; body rows zebra-stripe.
export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
      <table
        className={cn('w-full border-collapse text-start text-sm', className)}
        {...props}
      />
    </div>
  );
}

export function TableHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn('border-b border-line bg-surface-2/70', className)}
      {...props}
    />
  );
}

export function TableBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody
      className={cn('[&>tr:nth-child(even)]:bg-cream/50', className)}
      {...props}
    />
  );
}

export function TableRow({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        'border-b border-line transition-colors duration-150 last:border-0 hover:bg-primary-50/60',
        className,
      )}
      {...props}
    />
  );
}

export function TableHead({
  className,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn(
        'px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-muted',
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('px-4 py-3 text-start align-middle text-ink', className)} {...props} />
  );
}

/** Numeric cell helper — tabular figures + end alignment (money / counts). */
export function TableNumCell({
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn('px-4 py-3 text-end align-middle tabular-nums text-ink', className)}
      {...props}
    />
  );
}
