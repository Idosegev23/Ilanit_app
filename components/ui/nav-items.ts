import {
  LayoutDashboard,
  Users,
  CalendarDays,
  UsersRound,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

// Primary navigation for Ilanit's private (owner) area. Order matters.
export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'דשבורד', icon: LayoutDashboard },
  { href: '/students', label: 'תלמידים', icon: Users },
  { href: '/lessons', label: 'שיעורים', icon: CalendarDays },
  { href: '/groups', label: 'קבוצות', icon: UsersRound },
  { href: '/settings', label: 'הגדרות', icon: Settings },
];

/** True when `pathname` belongs to (or nests under) the nav `href`. */
export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
