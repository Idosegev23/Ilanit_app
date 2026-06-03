// Barrel export for the Ilanit design-system component library.
// Existing pages import directly from '@/components/ui/<name>' — those paths
// keep working; this barrel is an additive convenience for new code.
export { Button, buttonVariants, type ButtonProps } from './button';
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardBody,
  CardContent,
  CardFooter,
} from './card';
export { Input, fieldClasses, type InputProps } from './input';
export { Textarea, type TextareaProps } from './textarea';
export { Select, type SelectProps } from './select';
export { Label, type LabelProps } from './label';
export {
  Badge,
  StatusPill,
  badgeVariants,
  type BadgeProps,
  type StatusPillProps,
  type StatusKind,
} from './badge';
export {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableNumCell,
} from './table';
export { StatCard, type StatCardProps } from './stat-card';
export { EmptyState, type EmptyStateProps } from './empty-state';
export { PageHeader, type PageHeaderProps } from './page-header';
export { Skeleton } from './skeleton';
export { Sidebar } from './sidebar';
export { Topbar } from './topbar';
export { AppShell } from './app-shell';
export {
  SendBookingLinkDialog,
  type BookingLinkStudent,
} from './send-booking-link-dialog';
export { NAV_ITEMS, isActivePath, type NavItem } from './nav-items';
