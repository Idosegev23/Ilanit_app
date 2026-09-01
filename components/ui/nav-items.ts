import {
  LayoutDashboard,
  Users,
  CalendarDays,
  CalendarClock,
  UsersRound,
  MessageCircle,
  BarChart3,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** One-line Hebrew blurb shown in the wheel overlay's preview panel. */
  description?: string;
}

export interface NavGroup {
  /** Subtle section label shown above the group (optional). */
  label?: string;
  items: NavItem[];
}

// Primary navigation for Ilanit's private (owner) area. Order matters.
export const NAV_ITEMS: NavItem[] = [
  {
    href: '/dashboard',
    label: 'דשבורד',
    icon: LayoutDashboard,
    description: 'מבט־על על השבוע, ההכנסות והתובנות',
  },
  {
    href: '/students',
    label: 'תלמידים',
    icon: Users,
    description: 'תיקי תלמידים, פרטי קשר ומחירים',
  },
  {
    href: '/lessons',
    label: 'שיעורים',
    icon: CalendarDays,
    description: 'יומן השיעורים — קביעה, שינוי וביטול',
  },
  {
    href: '/availability',
    label: 'זמינות',
    icon: CalendarClock,
    description: 'לוח חודשי — פתיחה וסגירה של שעות',
  },
  {
    href: '/groups',
    label: 'קבוצות',
    icon: UsersRound,
    description: 'קבוצות לימוד, רישום חברים וגבייה חודשית',
  },
  {
    href: '/reports',
    label: 'שאלות ודוחות',
    icon: BarChart3,
    description: 'מי חייב, כמה נכנס, כמה שיעורים היו — עם סינון חופשי',
  },
  {
    href: '/messages',
    label: 'הודעות',
    icon: MessageCircle,
    description: 'תיבת הוואטסאפ — שיחות עם התלמידים',
  },
  {
    href: '/settings',
    label: 'הגדרות',
    icon: Settings,
    description: 'שעות פעילות, מחירים והגדרות העסק',
  },
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
      { href: '/availability', label: 'זמינות', icon: CalendarClock },
      { href: '/groups', label: 'קבוצות', icon: UsersRound },
      { href: '/reports', label: 'שאלות ודוחות', icon: BarChart3 },
      { href: '/messages', label: 'הודעות', icon: MessageCircle },
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
