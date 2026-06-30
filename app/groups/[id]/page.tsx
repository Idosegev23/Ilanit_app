import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ChevronRight,
  Receipt,
  UserMinus,
  Users,
  Banknote,
  Settings2,
  MapPin,
  ShieldCheck,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { getGroup, listMembers } from '@/lib/groups';
import { listStudents } from '@/lib/students';
import { formatShekels } from '@/lib/utils';
import { toILDateStr } from '@/lib/time';
import { updateGroupAction, removeMemberAction } from '@/app/groups/actions';
import { AddMembersSection } from './AddMembersSection';

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

  const [members, allStudents] = await Promise.all([
    listMembers(id, true),
    listStudents(),
  ]);
  const memberStudentIds = new Set(
    members.filter((m) => m.active).map((m) => m.studentId),
  );
  const addableStudents = allStudents.filter((s) => !memberStudentIds.has(s.id));
  const activeMembers = members.filter((m) => m.active);

  const currentMonth = toILDateStr(new Date()).slice(0, 7); // yyyy-MM
  const projectedMonthly = activeMembers.length * group.monthlyPrice;
  // Capacity (active members vs. cap). At/over cap we warn before enrolling, but
  // never hard-block — enrolment past the cap is allowed (override).
  const atCapacity = activeMembers.length >= group.maxMembers;

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/groups"
          className="mb-4 inline-flex items-center gap-1 rounded-lg text-sm text-muted transition-colors duration-150 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
        >
          <ChevronRight className="size-4" aria-hidden="true" />
          כל הקבוצות
        </Link>

        {/* Hero card — group identity + key facts + the primary billing action. */}
        <Card className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-tint"
          />
          <div
            aria-hidden="true"
            className="blob -end-10 -top-16 size-48 bg-accent-soft"
          />
          <CardContent className="relative flex flex-col gap-6 p-6 sm:p-7 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-fg shadow-card">
                <Users className="size-7" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold leading-tight text-ink sm:text-3xl">
                    {group.name}
                  </h1>
                  {!group.active && <Badge tone="muted">לא פעילה</Badge>}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-muted">
                  {group.location && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="size-4 shrink-0" aria-hidden="true" />
                      {group.location}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <Users className="size-4 shrink-0" aria-hidden="true" />
                    <span className="tabular-nums">
                      {activeMembers.length}/{group.maxMembers}
                    </span>{' '}
                    רשומים
                    {atCapacity && (
                      <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[0.65rem] font-medium text-accent-text">
                        מלא
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Banknote className="size-4 shrink-0" aria-hidden="true" />
                    <span className="font-semibold tabular-nums text-ink">
                      {formatShekels(group.monthlyPrice)}
                    </span>
                    <span>לחבר / חודש</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-start gap-3 lg:items-end">
              <div className="rounded-2xl border border-line bg-surface/80 px-4 py-3 text-start shadow-soft backdrop-blur-sm lg:text-end">
                <p className="text-xs text-muted">הכנסה חודשית צפויה</p>
                <p className="text-2xl font-bold tabular-nums text-primary-600">
                  {formatShekels(projectedMonthly)}
                </p>
              </div>
              <Link href={`/groups/${id}/billing/${currentMonth}`} className="w-full">
                <Button className="w-full">
                  <Receipt className="size-4" aria-hidden="true" />
                  רוסטר חיוב — <span className="tabular-nums">{currentMonth}</span>
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Edit group */}
        <Card>
          <CardHeader variant="tint">
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="size-5 text-primary-600" aria-hidden="true" />
              פרטי הקבוצה
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form action={updateGroupAction} className="space-y-5">
              <input type="hidden" name="id" value={group.id} />
              <div className="space-y-1.5">
                <Label htmlFor="name" required>
                  שם הקבוצה
                </Label>
                <Input id="name" name="name" required defaultValue={group.name} />
              </div>

              {/* Prominent pricing field — money per member, integer shekels. */}
              <div className="space-y-1.5 rounded-2xl border border-primary-100 bg-primary-soft/40 p-4">
                <Label
                  htmlFor="monthlyPrice"
                  required
                  className="flex items-center gap-1.5"
                >
                  <Banknote className="size-4 text-primary-600" aria-hidden="true" />
                  מחיר חודשי לחבר (₪)
                </Label>
                <div className="relative">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 end-3.5 flex items-center text-base font-medium text-muted"
                  >
                    ₪
                  </span>
                  <Input
                    id="monthlyPrice"
                    name="monthlyPrice"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="1"
                    required
                    defaultValue={group.monthlyPrice}
                    className="pe-9 text-lg font-semibold tabular-nums"
                  />
                </div>
                <p className="text-xs text-muted">
                  כל חברה תחויב בסכום זה ב-1 לחודש. שקלים שלמים בלבד.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="location" required>
                  מיקום
                </Label>
                <Input
                  id="location"
                  name="location"
                  required
                  defaultValue={group.location}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="maxMembers" className="flex items-center gap-1.5">
                  <Users className="size-4 text-primary-600" aria-hidden="true" />
                  מקסימום משתתפים
                </Label>
                <Input
                  id="maxMembers"
                  name="maxMembers"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  dir="ltr"
                  defaultValue={group.maxMembers}
                  className="text-end tabular-nums"
                />
                <p className="text-xs text-muted">
                  ברירת מחדל: 6. אפשר לחרוג בעת הרישום.
                </p>
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
              <label className="flex items-center gap-2.5 rounded-xl border border-line bg-cream/50 px-3.5 py-3 text-sm text-ink">
                <input
                  type="checkbox"
                  name="active"
                  defaultChecked={group.active}
                  className="size-4 rounded border-line text-primary accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
                />
                קבוצה פעילה
              </label>
              <Button type="submit" className="w-full">
                שמירת שינויים
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Members */}
        <Card>
          <CardHeader variant="tint">
            <CardTitle className="flex items-center gap-2">
              <Users className="size-5 text-primary-600" aria-hidden="true" />
              חברוֹת
              <span
                className={`text-sm font-semibold tabular-nums ${
                  atCapacity ? 'text-accent-text' : 'text-muted'
                }`}
              >
                {activeMembers.length}/{group.maxMembers} רשומים
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {activeMembers.length === 0 ? (
              <EmptyState
                icon={Users}
                title="אין חברוֹת פעילות"
                description="הוסיפי תלמיד/ה לקבוצה מהרשימה למטה כדי להתחיל לחייב."
                className="py-10"
              />
            ) : (
              <ul className="space-y-2">
                {activeMembers.map((m) => (
                  <li
                    key={m.membershipId}
                    className="flex items-center justify-between gap-3 rounded-xl border border-line bg-cream/40 px-4 py-3 transition-colors duration-150 hover:bg-primary-50/60"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary-600"
                      >
                        {m.name.trim().charAt(0)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">
                          {m.name}
                        </p>
                        <p
                          className="flex items-center gap-1.5 truncate text-xs text-muted"
                          dir="ltr"
                        >
                          <span dir="ltr" className="tabular-nums">
                            {m.contactPhone}
                          </span>
                          {m.guardianPhone && (
                            <span
                              dir="rtl"
                              className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-1.5 py-0.5 text-[0.65rem] font-medium text-accent-text"
                            >
                              <ShieldCheck
                                className="size-3 shrink-0"
                                aria-hidden="true"
                              />
                              הורה{m.guardianName ? ` · ${m.guardianName}` : ''}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <form action={removeMemberAction}>
                      <input type="hidden" name="groupId" value={group.id} />
                      <input type="hidden" name="studentId" value={m.studentId} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="md"
                        aria-label={`הסרת ${m.name} מהקבוצה`}
                      >
                        <UserMinus className="size-4" aria-hidden="true" />
                        הסרה
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}

            <AddMembersSection
              groupId={group.id}
              activeCount={activeMembers.length}
              maxMembers={group.maxMembers}
              monthlyPriceLabel={formatShekels(group.monthlyPrice)}
              addableStudents={addableStudents.map((s) => ({
                id: s.id,
                name: s.name,
                phone: s.phone,
              }))}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
