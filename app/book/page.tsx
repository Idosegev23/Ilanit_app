import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Placeholder public booking page. Feature agent B2 replaces this with the real
// availability picker + booking form.
export default function BookPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>קביעת שיעור</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">
            עמוד התיאום בבנייה. כאן תוכלו לבחור מועד פנוי ולקבוע שיעור.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
