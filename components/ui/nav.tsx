import Link from 'next/link';

// Primary navigation for Ilanit's private area (RTL Hebrew).
const NAV_ITEMS: Array<{ href: string; label: string }> = [
  { href: '/dashboard', label: 'דשבורד' },
  { href: '/lessons', label: 'שיעורים' },
  { href: '/students', label: 'תלמידים' },
  { href: '/groups', label: 'קבוצות' },
  { href: '/settings', label: 'הגדרות' },
];

export function Nav() {
  return (
    <nav className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-white px-4 py-2">
      <span className="ml-4 font-semibold text-brand">אילנית</span>
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
