// Barrel export for the Ilanit design-system component library.
// Existing pages import directly from '@/components/ui/<name>' — those paths
// keep working; this barrel is an additive convenience for new code.
export { Button, buttonVariants, type ButtonProps } from './button';
export { Brand, type BrandProps } from './brand';
export { AuthLayout, type AuthLayoutProps } from './auth-layout';
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardBody,
  CardContent,
  CardFooter,
  type CardProps,
  type CardHeaderProps,
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
export { StatCard, type StatCardProps, type StatTone } from './stat-card';
export { EmptyState, type EmptyStateProps } from './empty-state';
export { PageHeader, type PageHeaderProps } from './page-header';
export { Skeleton } from './skeleton';
export { Topbar } from './topbar';
export { AppShell } from './app-shell';
export { AuroraBackground } from './aurora-background';
export { NavOverlay, NavTrigger } from './nav-overlay';
export { default as OptionWheel, type OptionWheelProps } from './option-wheel';
export {
  SendBookingLinkDialog,
  type BookingLinkStudent,
} from './send-booking-link-dialog';
export {
  NAV_ITEMS,
  NAV_GROUPS,
  isActivePath,
  type NavItem,
  type NavGroup,
} from './nav-items';
