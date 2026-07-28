import type { Metadata, Viewport } from 'next';
import { Heebo } from 'next/font/google';
import './globals.css';
import { AppShell } from '@/components/ui/app-shell';
import { AuroraBackground } from '@/components/ui/aurora-background';

const heebo = Heebo({
  subsets: ['hebrew', 'latin'],
  variable: '--font-heebo',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'מערכת השיעורים של אילנית',
  description: 'ניהול שיעורים פרטיים — תיאום, אישור, תזכורות, תשלומים וקבלות',
};

export const viewport: Viewport = {
  themeColor: '#fff9fb',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body className="min-h-screen text-ink antialiased">
        {/*
          The living backdrop, mounted ONCE here so route changes never rebuild
          the WebGL context. It sits at z-0 and every piece of app content is
          wrapped below in `relative z-10` — a negative z-index would put the
          canvas behind the page background and hide it entirely.
        */}
        <AuroraBackground />

        <div className="relative z-10">
          {/* AppShell wraps ONLY authenticated owner pages; standalone routes
              (/book, /login, /a, /m, /p, /c) render bare via its internal guard. */}
          <AppShell>{children}</AppShell>
        </div>
      </body>
    </html>
  );
}
