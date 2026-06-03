import Link from 'next/link';
import { Nav } from '@/components/ui/nav';
import { Card, CardContent } from '@/components/ui/card';
import { listStudents } from '@/lib/students';
import { formatShekels } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// Protected (middleware-guarded) student directory. Each row links to the full
// client file at /students/[id].
export default async function StudentsPage() {
  const students = await listStudents();

  return (
    <div>
      <Nav />
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="mb-6 text-2xl font-bold text-slate-900">תלמידים</h1>

        {students.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-slate-500">
              עדיין אין תלמידים. תלמידים נוספים אוטומטית בעת תיאום שיעור.
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-2">
            {students.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/students/${s.id}`}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-brand hover:bg-brand-light"
                >
                  <div>
                    <p className="font-medium text-slate-900">{s.name}</p>
                    <p className="text-sm text-slate-500" dir="ltr">
                      {s.phone}
                    </p>
                  </div>
                  <div className="text-left text-sm text-slate-600">
                    {s.defaultPrice != null ? (
                      <span>מחיר ברירת מחדל: {formatShekels(s.defaultPrice)}</span>
                    ) : (
                      <span className="text-slate-400">ללא מחיר ברירת מחדל</span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
