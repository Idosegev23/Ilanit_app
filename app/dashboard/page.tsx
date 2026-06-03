import { Nav } from '@/components/ui/nav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Placeholder dashboard. Feature agent B6 replaces this with real KPIs,
// Recharts visualizations, action lists, and AI insights.
export default function DashboardPage() {
  return (
    <div>
      <Nav />
      <main className="mx-auto max-w-5xl p-6">
        <h1 className="mb-6 text-2xl font-bold text-slate-900">דשבורד</h1>
        <Card>
          <CardHeader>
            <CardTitle>ברוכה הבאה</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600">
              לוח הבקרה בבנייה. כאן יוצגו הכנסות, תפוסה, תלמידים פעילים ותובנות AI.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
