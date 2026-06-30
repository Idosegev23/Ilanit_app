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
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
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
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              כל הקבוצות
              {groups.length > 0 && (
                <span className="ms-2 tabular-nums text-muted/70">
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
            <ul className="grid gap-4 sm:grid-cols-2">
              {groups.map((g) => (
                <li key={g.id}>
                  <Link
                    href={`/groups/${g.id}`}
                    className="group block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
                  >
                    <Card
                      className={`relative h-full overflow-hidden transition-[box-shadow,transform] duration-200 ease-out group-hover:-translate-y-0.5 group-hover:shadow-pop motion-reduce:transform-none motion-reduce:transition-none ${
                        g.active ? '' : 'opacity-80'
                      }`}
                    >
                      {/* warm accent rail at the inline-start edge */}
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-0 start-0 w-1 bg-gradient-warm"
                      />
                      <CardContent className="flex h-full flex-col gap-4 p-5 ps-6">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-3">
                            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary-600 shadow-soft">
                              <UsersRound className="size-6" aria-hidden="true" />
                            </span>
                            <div className="min-w-0">
                              <h3 className="truncate text-base font-semibold text-ink">
                                {g.name}
                              </h3>
                              {g.location && (
                                <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
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
                            <p className="text-xs text-muted">רשומים</p>
                            <p
                              className={`mt-0.5 flex items-center gap-1.5 text-lg font-semibold ${
                                g.memberCount >= g.maxMembers
                                  ? 'text-accent-text'
                                  : 'text-ink'
                              }`}
                            >
                              <Users
                                className="size-4 shrink-0 text-primary-600"
                                aria-hidden="true"
                              />
                              <span className="tabular-nums">
                                {g.memberCount}/{g.maxMembers}
                              </span>
                              {g.memberCount >= g.maxMembers && (
                                <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[0.65rem] font-medium text-accent-text">
                                  מלא
                                </span>
                              )}
                            </p>
                          </div>
                          <div className="text-end">
                            <p className="text-xs text-muted">מחיר לחבר / חודש</p>
                            <p className="mt-0.5 text-lg font-bold tabular-nums text-primary-600">
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
            {/* Gradient header band so the form never reads as a bare void.
               The warm gradient runs honey→peach where white text would drop
               below AA, so a darkening scrim (deep terracotta→transparent,
               anchored to the text's inline-start) sits over the gradient and
               under the content — keeping white text ≥4.5:1 across the band. */}
            <div className="relative isolate overflow-hidden bg-gradient-warm px-6 py-5 text-primary-fg">
              <span
                aria-hidden="true"
                className="absolute inset-0 -z-10 bg-[linear-gradient(to_left,rgba(35,16,6,0.34)_0%,rgba(35,16,6,0.46)_45%,rgba(35,16,6,0.52)_100%)]"
              />
              <span
                aria-hidden="true"
                className="texture-dots absolute inset-0 -z-10 opacity-60"
              />
              <div className="relative flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-white/30 backdrop-blur-sm">
                  <Plus className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-lg font-semibold leading-tight">קבוצה חדשה</h2>
                  <p className="text-sm text-white/90">
                    הגדירי קבוצה, חיוב חודשי ומפגש שבועי קבוע
                  </p>
                </div>
              </div>
            </div>

            <CardContent className="p-6">
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
                <div className="space-y-1.5 rounded-2xl border border-primary-100 bg-primary-soft/40 p-4">
                  <Label
                    htmlFor="monthlyPrice"
                    required
                    className="flex items-center gap-1.5"
                  >
                    <Banknote
                      className="size-4 text-primary-600"
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

                {/* Solid sage-teal (white-on-#2f7a6e = 5.08:1, AA). The default
                   primary variant is always solid, so contrast holds at any
                   button width. */}
                <Button type="submit" size="lg" className="w-full">
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
