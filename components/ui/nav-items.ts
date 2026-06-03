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

export interface NavGroup {
  /** Subtle section label shown above the group (optional). */
  label?: string;
  items: NavItem[];
}

// Primary navigation for Ilanit's private (owner) area. Order matters.
export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'דשבורד', icon: LayoutDashboard },
  { href: '/students', label: 'תלמידים', icon: Users },
  { href: '/lessons', label: 'שיעורים', icon: CalendarDays },
  { href: '/groups', label: 'קבוצות', icon: UsersRound },
  { href: '/settings', label: 'הגדרות', icon: Settings },
];

// Grouped navigation — used by the v2 sidebar for clearer section rhythm.
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'ראשי',
    items: [{ href: '/dashboard', label: 'דשבורד', icon: LayoutDashboard }],
  },
  {
    label: 'ניהול',
    items: [
      { href: '/students', label: 'תלמידים', icon: Users },
      { href: '/lessons', label: 'שיעורים', icon: CalendarDays },
      { href: '/groups', label: 'קבוצות', icon: UsersRound },
    ],
  },
  {
    label: 'מערכת',
    items: [{ href: '/settings', label: 'הגדרות', icon: Settings }],
  },
];

/** True when `pathname` belongs to (or nests under) the nav `href`. */
export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
