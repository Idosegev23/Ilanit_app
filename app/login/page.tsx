import { signIn } from '@/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

// Owner login. A single Google sign-in grants both app access and Calendar
// (offline) access. Restricted to ALLOWED_LOGIN_EMAIL in the auth callback.
export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>כניסה למערכת</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-slate-600">
            התחברי עם חשבון Google שלך. ההתחברות מאשרת גם גישה ליומן.
          </p>
          <form
            action={async () => {
              'use server';
              await signIn('google', { redirectTo: '/dashboard' });
            }}
          >
            <Button type="submit" size="lg" className="w-full">
              התחברות עם Google
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
