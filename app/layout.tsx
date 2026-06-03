import type { Metadata } from 'next';
import { Heebo } from 'next/font/google';
import './globals.css';
import { AppShell } from '@/components/ui/app-shell';

const heebo = Heebo({
  subsets: ['hebrew', 'latin'],
  variable: '--font-heebo',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'מערכת השיעורים של אילנית',
  description: 'ניהול שיעורים פרטיים — תיאום, אישור, תזכורות, תשלומים וקבלות',
};

// Public app URL (safe to read at build/render — it's a NEXT_PUBLIC_* var).
// Used for the "שתף לינק תיאום" affordance in the shell Topbar.
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
const BOOKING_URL = `${APP_URL}/book`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body className="min-h-screen bg-cream text-ink antialiased">
        {/* AppShell wraps ONLY authenticated owner pages; standalone routes
            (/book, /login, /a, /m, /p) render bare via its internal guard. */}
        <AppShell bookingUrl={BOOKING_URL}>{children}</AppShell>
      </body>
    </html>
  );
}
