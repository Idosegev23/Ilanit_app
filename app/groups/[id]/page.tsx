import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ChevronRight,
  Receipt,
  UserPlus,
  UserMinus,
  Users,
  Info,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { PageHeader } from '@/components/ui/page-header';
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
  const activeMembers = members.filter((m) => m.active);

  const currentMonth = toILDateStr(new Date()).slice(0, 7); // yyyy-MM

  return (
    <main className="mx-auto max-w-6xl p-6">
      <Link
        href="/groups"
        className="mb-3 inline-flex items-center gap-1 rounded-lg text-sm text-muted transition-colors duration-150 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
      >
        <ChevronRight className="size-4" aria-hidden="true" />
        כל הקבוצות
      </Link>

      <PageHeader
        title={group.name}
        subtitle={group.location}
        className="mb-8"
        actions={
          <Link href={`/groups/${id}/billing/${currentMonth}`}>
            <Button variant="secondary">
              <Receipt className="size-4" aria-hidden="true" />
              רוסטר חיוב — <span className="tabular-nums">{currentMonth}</span>
            </Button>
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Edit group */}
        <Card>
          <CardHeader>
            <CardTitle>פרטי הקבוצה</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <form action={updateGroupAction} className="space-y-4">
              <input type="hidden" name="id" value={group.id} />
              <div className="space-y-1.5">
                <Label htmlFor="name" required>
                  שם הקבוצה
                </Label>
                <Input id="name" name="name" required defaultValue={group.name} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="monthlyPrice" required>
                  מחיר חודשי (₪)
                </Label>
                <Input
                  id="monthlyPrice"
                  name="monthlyPrice"
                  type="number"
                  min="0"
                  step="1"
                  required
                  defaultValue={group.monthlyPrice}
                  className="tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="location" required>
                  מיקום
                </Label>
                <Input id="location" name="location" required defaultValue={group.location} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="description">תיאור</Label>
                <Textarea
                  id="description"
                  name="description"
                  rows={3}
                  defaultValue={group.description ?? ''}
                />
              </div>
              <label className="flex items-center gap-2.5 text-sm text-ink">
                <input
                  type="checkbox"
                  name="active"
                  defaultChecked={group.active}
                  className="size-4 rounded border-line text-primary accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
                />
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
            <CardTitle className="flex items-center gap-2">
              <Users className="size-5 text-primary-600" aria-hidden="true" />
              חברוֹת
              <span className="text-sm font-normal tabular-nums text-muted">
                ({activeMembers.length})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 pt-0">
            {activeMembers.length === 0 ? (
              <p className="rounded-xl bg-primary-50 px-4 py-6 text-center text-sm text-muted">
                אין חברוֹת פעילות בקבוצה.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {activeMembers.map((m) => (
                  <li
                    key={m.membershipId}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{m.name}</p>
                      <p className="truncate text-xs text-muted" dir="ltr">
                        {m.phone}
                      </p>
                    </div>
                    <form action={removeMemberAction}>
                      <input type="hidden" name="groupId" value={group.id} />
                      <input type="hidden" name="studentId" value={m.studentId} />
                      <Button type="submit" variant="ghost" size="sm" aria-label={`הסרת ${m.name}`}>
                        <UserMinus className="size-4" aria-hidden="true" />
                        הסרה
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}

            {addableStudents.length > 0 && (
              <form
                action={addMemberAction}
                className="flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-end"
              >
                <input type="hidden" name="groupId" value={group.id} />
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="studentId">הוספת חברה</Label>
                  <Select id="studentId" name="studentId" defaultValue="">
                    <option value="" disabled>
                      בחרי תלמיד/ה…
                    </option>
                    {addableStudents.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.phone})
                      </option>
                    ))}
                  </Select>
                </div>
                <Button type="submit" className="sm:w-auto">
                  <UserPlus className="size-4" aria-hidden="true" />
                  הוספה
                </Button>
              </form>
            )}

            <p className="flex items-start gap-2 rounded-xl bg-accent-soft px-3.5 py-3 text-xs text-accent-text">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                מחיר חודשי:{' '}
                <span className="font-medium tabular-nums">{formatShekels(group.monthlyPrice)}</span>{' '}
                לכל חברה. החיוב נוצר אוטומטית ב-1 לחודש.
              </span>
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
