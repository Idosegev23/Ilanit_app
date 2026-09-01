"use client";

import * as React from "react";
import {
  CircleDollarSign,
  CalendarDays,
  Wallet,
  AlertTriangle,
  RotateCcw,
  Search,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { StatusPill, type StatusKind } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableNumCell,
} from "@/components/ui/table";
import {
  StudentPicker,
  type PickableStudent,
} from "@/components/ui/student-picker";
import { runReportAction } from "./actions";
import type { ReportFilters, ReportResult } from "@/lib/reports/query";
import type { AnswerKey, Preset } from "@/lib/reports/presets";

interface ReportsViewProps {
  students: PickableStudent[];
  groups: Array<{ id: string; name: string }>;
  presets: Preset[];
  initialPresetId: string;
  initialResult: ReportResult;
}

const LESSON_STATUS_LABELS: Record<string, string> = {
  all: "כל השיעורים",
  completed: "בוצעו",
  confirmed: "מאושרים",
  pending: "ממתינים",
  cancelled: "בוטלו",
  rejected: "נדחו",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  all: "כל מצבי התשלום",
  due: "פתוח לתשלום",
  paid: "שולם",
  waived: "פטור",
  unbilled: "לא חויב כלל",
};

const TYPE_LABELS: Record<string, string> = {
  all: "פרטני וקבוצתי",
  individual: "פרטני",
  group_session: "קבוצתי",
};

const METHOD_LABELS: Record<string, string> = {
  bit: "ביט",
  cash: "מזומן",
  transfer: "העברה",
  other: "אחר",
};

function shekels(n: number): string {
  return `${n.toLocaleString("he-IL")} ₪`;
}

function formatWhen(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/*
  The report screen.

  Presets set the filters instead of hiding them, so the answer to "who owes me
  money" is always one visible filter change away from "who owed me money in
  July" — and Ilanit can see WHY a number is what it is, because the rows behind
  it are listed underneath.
*/
export function ReportsView({
  students,
  groups,
  presets,
  initialPresetId,
  initialResult,
}: ReportsViewProps) {
  const initialFilters = React.useMemo(
    () => presets.find((p) => p.id === initialPresetId)?.filters ?? {},
    [presets, initialPresetId],
  );

  const [filters, setFilters] = React.useState<ReportFilters>(initialFilters);
  const [activePreset, setActivePreset] = React.useState<string | null>(
    initialPresetId,
  );
  const [result, setResult] = React.useState<ReportResult>(initialResult);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  /*
    Every run is stamped, and only the newest stamp may write to the screen.
    Filters change faster than a query returns, so without this a slow earlier
    request can land last and show an answer to a question already replaced.
  */
  const runId = React.useRef(0);
  const firstRender = React.useRef(true);

  React.useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return; // the server already rendered this exact result
    }
    const id = ++runId.current;
    setPending(true);
    setError(null);
    runReportAction(filters)
      .then((res) => {
        if (id !== runId.current) return;
        if (res.ok) setResult(res.result);
        else setError(res.error);
      })
      .catch((e: unknown) => {
        if (id !== runId.current) return;
        setError(e instanceof Error ? e.message : "שגיאה בהרצת הדוח");
      })
      .finally(() => {
        if (id === runId.current) setPending(false);
      });
  }, [filters]);

  function patch(next: Partial<ReportFilters>) {
    setActivePreset(null); // the answer is no longer the preset's answer
    setFilters((f) => ({ ...f, ...next }));
  }

  function applyPreset(preset: Preset) {
    setActivePreset(preset.id);
    setFilters(preset.filters);
  }

  const answerKey: AnswerKey | null = activePreset
    ? (presets.find((p) => p.id === activePreset)?.answer ?? null)
    : null;

  const { totals, groupBilling } = result;

  const stats: Array<{
    key: AnswerKey;
    label: string;
    value: string;
    hint?: string;
    icon: typeof Wallet;
    tone: "primary" | "success" | "warning" | "danger";
  }> = [
    {
      key: "lessons",
      label: "שיעורים",
      value: totals.lessons.toLocaleString("he-IL"),
      hint: `${totals.billed} חויבו · ${totals.unbilled} ללא חיוב`,
      icon: CalendarDays,
      tone: "primary",
    },
    {
      key: "paid",
      label: "שולם",
      value: shekels(totals.paid),
      hint: "שיעורים פרטניים",
      icon: Wallet,
      tone: "success",
    },
    {
      key: "due",
      label: "פתוח לתשלום",
      value: shekels(totals.due),
      hint: "שיעורים פרטניים",
      icon: CircleDollarSign,
      tone: "warning",
    },
    {
      key: "unbilled",
      label: "שיעורים ללא חיוב",
      value: totals.unbilled.toLocaleString("he-IL"),
      hint: "לא נוצרה עבורם דרישת תשלום",
      icon: AlertTriangle,
      tone: "danger",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="תובנות"
        title="שאלות ודוחות"
        subtitle="שאלה אחת בלחיצה, או סינון חופשי — והשורות שמאחורי כל מספר. טווח התאריכים מתייחס למועד השיעור."
      />

      {/* Quick questions */}
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="שאלות מהירות"
      >
        {presets.map((p) => {
          const on = activePreset === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p)}
              aria-pressed={on}
              className={[
                "rounded-full border px-4 py-2 text-sm font-semibold transition",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2",
                on
                  ? "border-transparent bg-primary-soft text-ink shadow-soft"
                  : "border-line bg-white/70 text-ink hover:bg-primary-soft/60",
              ].join(" ")}
            >
              {p.question}
            </button>
          );
        })}
      </div>

      {/* Answer strip — the preset's own number is lifted out of the row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <StatCard
            key={s.key}
            label={s.label}
            value={s.value}
            hint={s.hint}
            icon={s.icon}
            tone={s.tone}
            className={
              answerKey === s.key
                ? "ring-2 ring-primary-600 ring-offset-2 ring-offset-canvas"
                : ""
            }
          />
        ))}
      </div>

      {/* Group billing lives on its own line: it is monthly and per student,
          with no lesson behind it, so it must not be added into the tiles. */}
      {groupBilling.applies &&
        (groupBilling.paid > 0 || groupBilling.due > 0) && (
          <Card>
            <CardBody className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div>
                <p className="text-sm font-semibold text-ink">גבייה קבוצתית</p>
                <p className="text-xs text-muted">
                  חיוב חודשי לכל חבר/ת קבוצה — לא תלוי בשיעור בודד
                </p>
              </div>
              <div className="flex gap-6">
                <p className="text-sm">
                  <span className="text-muted">שולם </span>
                  <span className="font-bold tabular-nums">
                    {shekels(groupBilling.paid)}
                  </span>
                </p>
                <p className="text-sm">
                  <span className="text-muted">פתוח </span>
                  <span className="font-bold tabular-nums">
                    {shekels(groupBilling.due)}
                  </span>
                </p>
              </div>
            </CardBody>
          </Card>
        )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>סינון</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <StudentPicker
              id="report-student"
              label="תלמיד/ה (הכול כברירת מחדל)"
              students={students}
              value={filters.studentId ?? null}
              onChange={(studentId) => patch({ studentId })}
            />

            <div className="space-y-4">
              <div>
                <Label htmlFor="report-group">קבוצה</Label>
                <Select
                  id="report-group"
                  value={filters.groupId ?? ""}
                  onChange={(e) => patch({ groupId: e.target.value || null })}
                >
                  <option value="">כל הקבוצות</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="report-from">מתאריך</Label>
                  <Input
                    id="report-from"
                    type="date"
                    value={filters.from ?? ""}
                    onChange={(e) => patch({ from: e.target.value || null })}
                  />
                </div>
                <div>
                  <Label htmlFor="report-to">עד תאריך</Label>
                  <Input
                    id="report-to"
                    type="date"
                    value={filters.to ?? ""}
                    onChange={(e) => patch({ to: e.target.value || null })}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="report-lesson-status">מצב השיעור</Label>
              <Select
                id="report-lesson-status"
                value={filters.lessonStatus ?? "all"}
                onChange={(e) =>
                  patch({
                    lessonStatus: e.target
                      .value as ReportFilters["lessonStatus"],
                  })
                }
              >
                {Object.entries(LESSON_STATUS_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="report-payment-status">מצב התשלום</Label>
              <Select
                id="report-payment-status"
                value={filters.paymentStatus ?? "all"}
                onChange={(e) =>
                  patch({
                    paymentStatus: e.target
                      .value as ReportFilters["paymentStatus"],
                  })
                }
              >
                {Object.entries(PAYMENT_STATUS_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="report-type">סוג</Label>
              <Select
                id="report-type"
                value={filters.type ?? "all"}
                onChange={(e) =>
                  patch({ type: e.target.value as ReportFilters["type"] })
                }
              >
                {Object.entries(TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted" aria-live="polite">
              {pending
                ? "מחשב…"
                : `${result.rows.length.toLocaleString("he-IL")} שורות`}
            </p>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setActivePreset(null);
                setFilters({});
              }}
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              ניקוי הסינון
            </Button>
          </div>

          {error && (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          )}
        </CardBody>
      </Card>

      {/* Per-student rollup — the answer to "who owes me money" */}
      {result.byStudent.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>לפי תלמיד/ה</CardTitle>
          </CardHeader>
          <CardBody className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>תלמיד/ה</TableHead>
                  <TableHead>שיעורים</TableHead>
                  <TableHead>שולם</TableHead>
                  <TableHead>פתוח</TableHead>
                  <TableHead>ללא חיוב</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.byStudent.map((s) => (
                  <TableRow key={s.studentId}>
                    <TableCell>
                      <a
                        className="font-medium underline decoration-primary-600 underline-offset-4"
                        href={`/students/${s.studentId}`}
                      >
                        {s.name}
                      </a>
                    </TableCell>
                    <TableNumCell>{s.lessons}</TableNumCell>
                    <TableNumCell>
                      {s.paid ? shekels(s.paid) : "—"}
                    </TableNumCell>
                    <TableNumCell>{s.due ? shekels(s.due) : "—"}</TableNumCell>
                    <TableNumCell>{s.unbilled || "—"}</TableNumCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardBody>
        </Card>
      )}

      {/* The rows behind the numbers */}
      <Card>
        <CardHeader>
          <CardTitle>השיעורים</CardTitle>
        </CardHeader>
        <CardBody className="overflow-x-auto p-0">
          {result.rows.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Search}
                title="אין תוצאות"
                description="אף שיעור לא תואם לסינון הזה. נסי לרווח את טווח התאריכים או לאפס את הסינון."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>מתי</TableHead>
                  <TableHead>תלמיד/ה</TableHead>
                  <TableHead>קבוצה</TableHead>
                  <TableHead>שיעור</TableHead>
                  <TableHead>תשלום</TableHead>
                  <TableHead>סכום</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((r) => (
                  <TableRow key={r.lessonId}>
                    <TableCell className="whitespace-nowrap">
                      {formatWhen(r.startsAt)}
                    </TableCell>
                    <TableCell>
                      {r.studentId ? (
                        <a
                          className="underline decoration-primary-600 underline-offset-4"
                          href={`/students/${r.studentId}`}
                        >
                          {r.studentName ?? "—"}
                        </a>
                      ) : (
                        (r.studentName ?? "—")
                      )}
                    </TableCell>
                    <TableCell>{r.groupName ?? "—"}</TableCell>
                    <TableCell>
                      <StatusPill status={r.lessonStatus as StatusKind} />
                    </TableCell>
                    <TableCell>
                      {r.paymentStatus ? (
                        <span className="flex flex-wrap items-center gap-1.5">
                          <StatusPill status={r.paymentStatus} />
                          {r.method && (
                            <span className="text-xs text-muted">
                              {METHOD_LABELS[r.method] ?? r.method}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-danger">
                          לא חויב
                        </span>
                      )}
                    </TableCell>
                    <TableNumCell>
                      {r.amount == null ? "—" : shekels(r.amount)}
                    </TableNumCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
