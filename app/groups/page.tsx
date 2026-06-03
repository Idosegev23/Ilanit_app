import Link from 'next/link';
import { Nav } from '@/components/ui/nav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { listGroups } from '@/lib/groups';
import { formatShekels } from '@/lib/utils';
import { createGroupAction } from '@/app/groups/actions';

// Groups overview: list of learning groups + a form to create a new one.
export const dynamic = 'force-dynamic';

export default async function GroupsPage() {
  const groups = await listGroups(true);

  return (
    <div>
      <Nav />
      <main className="mx-auto max-w-5xl p-6">
        <h1 className="mb-6 text-2xl font-bold text-slate-900">קבוצות למידה</h1>

        <div className="grid gap-6 md:grid-cols-[1fr_320px]">
          <section>
            {groups.length === 0 ? (
              <Card>
                <CardContent>
                  <p className="py-6 text-center text-sm text-slate-500">
                    עדיין אין קבוצות. צרי קבוצה ראשונה בטופס שמשמאל.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <ul className="space-y-3">
                {groups.map((g) => (
                  <li key={g.id}>
                    <Link href={`/groups/${g.id}`} className="block">
                      <Card className="transition-colors hover:border-brand">
                        <CardContent className="flex items-center justify-between p-5">
                          <div>
                            <p className="font-semibold text-slate-900">
                              {g.name}
                              {!g.active && (
                                <span className="mr-2 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                                  לא פעילה
                                </span>
                              )}
                            </p>
                            <p className="text-sm text-slate-500">{g.location}</p>
                          </div>
                          <div className="text-left">
                            <p className="font-medium text-slate-900">
                              {formatShekels(g.monthlyPrice)}
                              <span className="text-xs text-slate-400"> / חודש</span>
                            </p>
                            <p className="text-sm text-slate-500">{g.memberCount} חברוֹת</p>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <aside>
            <Card>
              <CardHeader>
                <CardTitle>קבוצה חדשה</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={createGroupAction} className="space-y-3">
                  <div>
                    <label className="mb-1 block text-sm text-slate-600" htmlFor="name">
                      שם הקבוצה
                    </label>
                    <Input id="name" name="name" required placeholder="למשל: מתמטיקה כיתה ח׳" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm text-slate-600" htmlFor="monthlyPrice">
                      מחיר חודשי (₪)
                    </label>
                    <Input
                      id="monthlyPrice"
                      name="monthlyPrice"
                      type="number"
                      min="0"
                      step="1"
                      required
                      placeholder="300"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm text-slate-600" htmlFor="location">
                      מיקום
                    </label>
                    <Input id="location" name="location" required placeholder="כתובת המפגשים" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm text-slate-600" htmlFor="description">
                      תיאור (אופציונלי)
                    </label>
                    <Input id="description" name="description" placeholder="פרטים נוספים" />
                  </div>
                  <Button type="submit" className="w-full">
                    צרי קבוצה
                  </Button>
                </form>
              </CardContent>
            </Card>
          </aside>
        </div>
      </main>
    </div>
  );
}
