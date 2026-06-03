import Link from 'next/link';
import { Users, MapPin, Plus, UsersRound } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { listGroups } from '@/lib/groups';
import { formatShekels } from '@/lib/utils';
import { createGroupAction } from '@/app/groups/actions';

// Groups overview: list of learning groups + a form to create a new one.
export const dynamic = 'force-dynamic';

export default async function GroupsPage() {
  const groups = await listGroups(true);

  return (
    <main className="mx-auto max-w-6xl p-6">
      <PageHeader
        title="קבוצות למידה"
        subtitle="ניהול קבוצות, חברוֹת והחיוב החודשי"
        className="mb-8"
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section>
          {groups.length === 0 ? (
            <EmptyState
              icon={UsersRound}
              title="עדיין אין קבוצות"
              description="צרי את הקבוצה הראשונה בטופס שבצד."
            />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {groups.map((g) => (
                <li key={g.id}>
                  <Link
                    href={`/groups/${g.id}`}
                    className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
                  >
                    <Card className="h-full transition-[box-shadow,transform] duration-200 ease-out group-hover:-translate-y-0.5 group-hover:shadow-pop motion-reduce:transform-none motion-reduce:transition-none">
                      <CardContent className="flex h-full flex-col gap-4 p-5">
                        <div className="flex items-start justify-between gap-3">
                          <h2 className="text-base font-semibold text-ink">{g.name}</h2>
                          {!g.active && (
                            <Badge tone="muted">לא פעילה</Badge>
                          )}
                        </div>

                        {g.location && (
                          <p className="flex items-center gap-1.5 text-sm text-muted">
                            <MapPin className="size-4 shrink-0" aria-hidden="true" />
                            <span>{g.location}</span>
                          </p>
                        )}

                        <div className="mt-auto flex items-end justify-between gap-3 border-t border-line pt-4">
                          <span className="inline-flex items-center gap-1.5 text-sm text-muted">
                            <Users className="size-4 shrink-0" aria-hidden="true" />
                            <span className="tabular-nums">{g.memberCount}</span> חברוֹת
                          </span>
                          <span className="text-end">
                            <span className="text-base font-semibold tabular-nums text-ink">
                              {formatShekels(g.monthlyPrice)}
                            </span>
                            <span className="text-xs text-muted"> / חודש</span>
                          </span>
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
          <Card className="lg:sticky lg:top-6">
            <CardContent className="p-6">
              <div className="mb-4 flex items-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-xl bg-primary-soft text-primary-600">
                  <Plus className="size-5" aria-hidden="true" />
                </span>
                <h2 className="text-lg font-semibold text-ink">קבוצה חדשה</h2>
              </div>

              <form action={createGroupAction} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name" required>
                    שם הקבוצה
                  </Label>
                  <Input id="name" name="name" required placeholder="למשל: מתמטיקה כיתה ח׳" />
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
                    placeholder="300"
                    className="tabular-nums"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="location" required>
                    מיקום
                  </Label>
                  <Input id="location" name="location" required placeholder="כתובת המפגשים" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="description">תיאור (אופציונלי)</Label>
                  <Textarea id="description" name="description" rows={3} placeholder="פרטים נוספים" />
                </div>
                <Button type="submit" className="w-full">
                  <Plus className="size-4" aria-hidden="true" />
                  צרי קבוצה
                </Button>
              </form>
            </CardContent>
          </Card>
        </aside>
      </div>
    </main>
  );
}
