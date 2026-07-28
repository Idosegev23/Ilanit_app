import type { CSSProperties } from 'react';
import Link from 'next/link';
import {
  Users,
  MapPin,
  Plus,
  UsersRound,
  Banknote,
  Layers,
  ArrowLeft,
  Wallet,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { listGroups } from '@/lib/groups';
import { formatShekels } from '@/lib/utils';
import { createGroupAction } from '@/app/groups/actions';
import { WeeklySlotsField } from '@/app/groups/WeeklySlotsField';

// Groups overview: list of learning groups + a form to create a new one.
export const dynamic = 'force-dynamic';

export default async function GroupsPage() {
  const groups = await listGroups(true);

  const activeGroups = groups.filter((g) => g.active);
  const totalMembers = groups.reduce((sum, g) => sum + g.memberCount, 0);
  // Projected monthly recurring revenue: active members × their group price.
  const projectedMonthly = activeGroups.reduce(
    (sum, g) => sum + g.memberCount * g.monthlyPrice,
    0,
  );

  return (
    <div className="space-y-8">
      <PageHeader
        className="rise"
        eyebrow="חיוב חודשי"
        title="קבוצות למידה"
        subtitle="ניהול קבוצות, חברוֹת והחיוב החודשי החוזר — במקום אחד."
        actions={
          <Link href="#new-group">
            <Button size="lg">
              <Plus className="size-4" aria-hidden="true" />
              קבוצה חדשה
            </Button>
          </Link>
        }
      />

      {/* Overview hero — aggregate KPIs so the page never opens on a void. */}
      {groups.length > 0 && (
        <div className="stagger grid grid-cols-2 gap-4 lg:grid-cols-3">
          <StatCard
            label="קבוצות פעילות"
            value={activeGroups.length}
            hint={
              groups.length > activeGroups.length
                ? `${groups.length - activeGroups.length} לא פעילות`
                : 'כל הקבוצות פעילות'
            }
            icon={Layers}
            tone="primary"
          />
          <StatCard
            label="חברוֹת רשומות"
            value={totalMembers}
            hint="סך החברוֹת הפעילות בכל הקבוצות"
            icon={Users}
            tone="accent"
          />
          <StatCard
            label="הכנסה חודשית צפויה"
            value={formatShekels(projectedMonthly)}
            hint="חברוֹת פעילות × מחיר הקבוצה"
            icon={Wallet}
            tone="success"
            className="col-span-2 lg:col-span-1"
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Group list */}
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-primary-700">
              <span
                aria-hidden="true"
                className="h-4 w-1 rounded-full bg-gradient-warm"
              />
              כל הקבוצות
              {groups.length > 0 && (
                <span className="tabular-nums text-muted">
                  ({groups.length})
                </span>
              )}
            </h2>
          </div>

          {groups.length === 0 ? (
            <EmptyState
              icon={UsersRound}
              title="עדיין אין קבוצות"
              description="צרי את הקבוצה הראשונה — תגדירי שם, מחיר חודשי לחבר ומיקום מפגשים."
              action={
                <Link href="#new-group">
                  <Button size="lg">
                    <Plus className="size-4" aria-hidden="true" />
                    צרי קבוצה ראשונה
                  </Button>
                </Link>
              }
            />
          ) : (
            <ul className="stagger grid gap-4 sm:grid-cols-2">
              {groups.map((g, i) => (
                <li key={g.id} style={{ '--i': i } as CSSProperties}>
                  <Link
                    href={`/groups/${g.id}`}
                    className="group block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
                  >
                    <Card
                      className={`relative h-full overflow-hidden transition-[box-shadow,transform] duration-200 ease-out group-hover:-translate-y-1 group-hover:shadow-pop motion-reduce:transform-none motion-reduce:transition-none ${
                        g.active ? '' : 'opacity-80'
                      }`}
                    >
                      {/* Blush rail at the inline-start edge + a soft corner wash
                         so each card carries a little of the aurora itself. */}
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-0 start-0 w-1.5 bg-gradient-warm"
                      />
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute -top-16 end-[-3rem] size-40 rounded-full bg-primary-100/60 blur-3xl transition-opacity duration-300 group-hover:opacity-80"
                      />
                      <CardContent className="relative z-10 flex h-full flex-col gap-4 p-5 ps-6">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-3">
                            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary-700 shadow-soft ring-1 ring-inset ring-white/70">
                              <UsersRound className="size-6" aria-hidden="true" />
                            </span>
                            <div className="min-w-0">
                              <h3 className="truncate text-lg font-bold tracking-tight text-ink">
                                {g.name}
                              </h3>
                              {g.location && (
                                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
                                  <MapPin
                                    className="size-3.5 shrink-0"
                                    aria-hidden="true"
                                  />
                                  <span className="truncate">{g.location}</span>
                                </p>
                              )}
                            </div>
                          </div>
                          {!g.active && <Badge tone="muted">לא פעילה</Badge>}
                        </div>

                        <div className="mt-auto grid grid-cols-2 gap-3 border-t border-line pt-4">
                          <div>
                            <p className="text-xs font-medium text-muted">רשומים</p>
                            <p
                              className={`mt-1 flex items-center gap-1.5 text-lg font-bold ${
                                g.memberCount >= g.maxMembers
                                  ? 'text-accent-text'
                                  : 'text-ink'
                              }`}
                            >
                              <Users
                                className="size-4 shrink-0 text-primary-700"
                                aria-hidden="true"
                              />
                              <span className="tabular-nums">
                                {g.memberCount}/{g.maxMembers}
                              </span>
                              {g.memberCount >= g.maxMembers && (
                                <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[0.65rem] font-bold text-accent-text">
                                  מלא
                                </span>
                              )}
                            </p>
                          </div>
                          <div className="text-end">
                            <p className="text-xs font-medium text-muted">מחיר לחבר / חודש</p>
                            <p className="mt-1 text-lg font-extrabold tracking-tight tabular-nums text-primary-700">
                              {formatShekels(g.monthlyPrice)}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Create group */}
        <aside id="new-group" className="scroll-mt-24">
          <Card className="overflow-hidden lg:sticky lg:top-24">
            {/* Blush header band. v4 drops the v3 darkening scrim entirely: the
               band carries INK text on the pink→peach gradient (6.2:1 on the
               pink stop, 9.7:1 on the peach one), so no rescue layer is needed
               and the warm hues stay pure. White here would be ~2:1. */}
            <div className="relative overflow-hidden bg-gradient-cta px-6 py-5 text-ink">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -top-12 end-[-2rem] size-36 rounded-full bg-white/40 blur-2xl"
              />
              <div className="relative z-10 flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-white/60 shadow-soft ring-1 ring-inset ring-white/80">
                  <Plus className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-lg font-extrabold leading-tight tracking-tight">
                    קבוצה חדשה
                  </h2>
                  <p className="text-sm font-medium text-ink">
                    הגדירי קבוצה, חיוב חודשי ומפגש שבועי קבוע
                  </p>
                </div>
              </div>
            </div>

            <CardContent className="p-5 pt-6 sm:p-6">
              <form action={createGroupAction} className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="name" required>
                    שם הקבוצה
                  </Label>
                  <Input
                    id="name"
                    name="name"
                    required
                    placeholder="למשל: מתמטיקה כיתה ח׳"
                  />
                </div>

                {/* Prominent pricing field — money per member, integer shekels. */}
                <div className="space-y-2 rounded-2xl border border-primary-200 bg-gradient-tint p-4 shadow-soft">
                  <Label
                    htmlFor="monthlyPrice"
                    required
                    className="flex items-center gap-1.5"
                  >
                    <Banknote
                      className="size-4 text-primary-700"
                      aria-hidden="true"
                    />
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
                      placeholder="300"
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
                    placeholder="כתובת המפגשים"
                  />
                </div>

                {/* Capacity cap — how many members the group can hold. */}
                <div className="space-y-1.5">
                  <Label htmlFor="maxMembers" className="flex items-center gap-1.5">
                    <Users className="size-4 text-primary-700" aria-hidden="true" />
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
                    defaultValue={6}
                    className="text-end tabular-nums"
                  />
                  <p className="text-xs text-muted">
                    כמה רשומים מותר בקבוצה. ברירת מחדל: 6. אפשר לחרוג בהמשך.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="description">תיאור (אופציונלי)</Label>
                  <Textarea
                    id="description"
                    name="description"
                    rows={3}
                    placeholder="פרטים נוספים"
                  />
                </div>

                {/* Optional weekly recurring sessions — a group can meet on
                   SEVERAL weekday+time slots. Each filled row becomes its own
                   weekly group series (not gated by open-weeks). */}
                <WeeklySlotsField />

                {/* Highest-emphasis action on the page → the ink variant: a
                   solid #2e2f34 fill with white text (13.4:1). Reserving ink
                   for the single commit keeps the pink an accent rather than
                   noise repeated on every control. */}
                <Button type="submit" variant="ink" size="lg" className="w-full">
                  <Plus className="size-4" aria-hidden="true" />
                  צרי קבוצה
                  <ArrowLeft className="size-4" aria-hidden="true" />
                </Button>
              </form>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
