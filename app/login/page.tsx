import { CalendarHeart } from 'lucide-react';
import { signIn } from '@/auth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

// Owner login. A single Google sign-in grants both app access and Calendar
// (offline) access. Restricted to ALLOWED_LOGIN_EMAIL in the auth callback.

// Official Google "G" brand mark (multi-color). Inline SVG — not an emoji.
function GoogleMark() {
  return (
    <svg className="size-5 shrink-0" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-primary-soft to-cream px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-6 py-8 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary-600">
            <CalendarHeart className="size-7" aria-hidden="true" />
          </span>

          <div className="space-y-1.5">
            <h1 className="text-2xl font-bold text-ink">כניסה למערכת</h1>
            <p className="text-sm leading-relaxed text-muted">
              התחברי עם חשבון Google שלך. ההתחברות מאשרת גם גישה ליומן.
            </p>
          </div>

          <form
            className="w-full"
            action={async () => {
              'use server';
              await signIn('google', { redirectTo: '/dashboard' });
            }}
          >
            <Button type="submit" variant="secondary" size="lg" className="w-full">
              <GoogleMark />
              התחבר עם Google
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
