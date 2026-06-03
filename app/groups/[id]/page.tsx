import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Nav } from '@/components/ui/nav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getGroup, listMembers } from '@/lib/groups';
import { listStudents } from '@/lib/students';
import { formatShekels } from '@/lib/utils';
import { toILDateStr } from '@/lib/time';
import {
  updateGroupAction,
  addMemberAction,
  removeMemberAction,
} from '@/app/groups/actions';

// Group detail: edit group settings, manage members, jump to monthly billing.
export const dynamic = 'force-dynamic';

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const group = await getGroup(id);
  if (!group) notFound();

  const [members, allStudents] = await Promise.all([listMembers(id, true), listStudents()]);
  const memberStudentIds = new Set(members.filter((m) => m.active).map((m) => m.studentId));
  const addableStudents = allStudents.filter((s) => !memberStudentIds.has(s.id));

  const currentMonth = toILDateStr(new Date()).slice(0, 7); // yyyy-MM

  return (
    <div>
      <Nav />
      <main className="mx-auto max-w-4xl p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <Link href="/groups" className="text-sm text-slate-500 hover:text-slate-700">
              ← כל הקבוצות
            </Link>
            <h1 className="text-2xl font-bold text-slate-900">{group.name}</h1>
          </div>
          <Link href={`/groups/${id}/billing/${currentMonth}`}>
            <Button variant="outline">רוסטר חיוב — {currentMonth}</Button>
          </Link>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Edit group */}
          <Card>
            <CardHeader>
              <CardTitle>פרטי הקבוצה</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={updateGroupAction} className="space-y-3">
                <input type="hidden" name="id" value={group.id} />
                <div>
                  <label className="mb-1 block text-sm text-slate-600" htmlFor="name">
                    שם הקבוצה
                  </label>
                  <Input id="name" name="name" required defaultValue={group.name} />
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
                    defaultValue={group.monthlyPrice}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-slate-600" htmlFor="location">
                    מיקום
                  </label>
                  <Input id="location" name="location" required defaultValue={group.location} />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-slate-600" htmlFor="description">
                    תיאור
                  </label>
                  <Input
                    id="description"
                    name="description"
                    defaultValue={group.description ?? ''}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" name="active" defaultChecked={group.active} />
                  קבוצה פעילה
                </label>
                <Button type="submit" className="w-full">
                  שמירה
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Members */}
          <Card>
            <CardHeader>
              <CardTitle>
                חברוֹת ({members.filter((m) => m.active).length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {members.filter((m) => m.active).length === 0 ? (
                <p className="text-sm text-slate-500">אין חברוֹת פעילות בקבוצה.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {members
                    .filter((m) => m.active)
                    .map((m) => (
                      <li
                        key={m.membershipId}
                        className="flex items-center justify-between py-2"
                      >
                        <div>
                          <p className="text-sm font-medium text-slate-900">{m.name}</p>
                          <p className="text-xs text-slate-500">{m.phone}</p>
                        </div>
                        <form action={removeMemberAction}>
                          <input type="hidden" name="groupId" value={group.id} />
                          <input type="hidden" name="studentId" value={m.studentId} />
                          <Button type="submit" variant="ghost" size="sm">
                            הסרה
                          </Button>
                        </form>
                      </li>
                    ))}
                </ul>
              )}

              {addableStudents.length > 0 && (
                <form action={addMemberAction} className="flex items-end gap-2 border-t border-slate-100 pt-4">
                  <input type="hidden" name="groupId" value={group.id} />
                  <div className="flex-1">
                    <label className="mb-1 block text-sm text-slate-600" htmlFor="studentId">
                      הוספת חברה
                    </label>
                    <select
                      id="studentId"
                      name="studentId"
                      className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      defaultValue=""
                    >
                      <option value="" disabled>
                        בחרי תלמיד/ה…
                      </option>
                      {addableStudents.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.phone})
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button type="submit">הוספה</Button>
                </form>
              )}

              <p className="text-xs text-slate-400">
                מחיר חודשי: {formatShekels(group.monthlyPrice)} לכל חברה. החיוב נוצר אוטומטית ב-1
                לחודש.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
