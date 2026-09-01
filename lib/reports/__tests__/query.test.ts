import { describe, it, expect, vi, beforeEach } from "vitest";

/*
  What these tests defend: the numbers on /reports are the ones Ilanit will
  quote to a parent, so a quiet arithmetic slip here is worse than a crash.

  Three failure modes get explicit coverage because each one is invisible on
  screen — the page still renders a confident, wrong number:
    · an unbilled lesson counted as a ₪0 settled one,
    · a `to` bound that drops its own day (so "August" loses the 31st),
    · group income missing from "how much came in".
*/

const state = vi.hoisted(() => ({
  lessonRows: [] as any[],
  billingRows: [] as any[],
  bounds: [] as Array<{ op: string; col: unknown; v: unknown }>,
}));

vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => a,
  asc: () => ({}),
  desc: () => ({}),
  eq: () => ({}),
  gte: (col: unknown, v: unknown) => {
    state.bounds.push({ op: "gte", col, v });
    return {};
  },
  lt: (col: unknown, v: unknown) => {
    state.bounds.push({ op: "lt", col, v });
    return {};
  },
}));

vi.mock("@/db/schema", () => ({
  lessons: { __t: "lessons", startsAt: { __c: "lessons.startsAt" } },
  students: { __t: "students" },
  groups: { __t: "groups" },
  payments: { __t: "payments" },
  groupBilling: { __t: "groupBilling", month: { __c: "groupBilling.month" } },
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: (table: { __t?: string }) => {
        const rows =
          table?.__t === "groupBilling" ? state.billingRows : state.lessonRows;
        // Awaitable at every step: the two queries end on different calls.
        const chain: any = {
          leftJoin: () => chain,
          where: () => chain,
          orderBy: () => chain,
          then: (res: (v: unknown) => unknown) =>
            Promise.resolve(rows).then(res),
        };
        return chain;
      },
    }),
  },
}));

import { runReport } from "@/lib/reports/query";

function lesson(over: Partial<Record<string, unknown>> = {}) {
  return {
    lessonId: `l-${Math.random().toString(36).slice(2, 8)}`,
    startsAt: new Date("2026-08-10T09:00:00Z"),
    endsAt: new Date("2026-08-10T10:00:00Z"),
    type: "individual",
    lessonStatus: "completed",
    studentId: "stu-1",
    studentName: "אימרי",
    bookedByName: null,
    groupName: null,
    paymentStatus: null,
    amount: null,
    paidAt: null,
    method: null,
    ...over,
  };
}

beforeEach(() => {
  state.lessonRows = [];
  state.billingRows = [];
  state.bounds = [];
});

describe("payment status filtering", () => {
  it('treats "unbilled" as the ABSENCE of a payment row', async () => {
    state.lessonRows = [
      lesson({ paymentStatus: "paid", amount: 140 }),
      lesson({ paymentStatus: null, amount: null }),
    ];

    const res = await runReport({ paymentStatus: "unbilled" });

    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].paymentStatus).toBeNull();
  });

  it("never counts an unbilled lesson as ₪0 already paid", async () => {
    state.lessonRows = [
      lesson({ paymentStatus: null }),
      lesson({ paymentStatus: null }),
    ];

    const res = await runReport({});

    expect(res.totals.unbilled).toBe(2);
    expect(res.totals.billed).toBe(0);
    expect(res.totals.paid).toBe(0);
  });

  it("splits money across paid / due / waived", async () => {
    state.lessonRows = [
      lesson({ paymentStatus: "paid", amount: 140 }),
      lesson({ paymentStatus: "paid", amount: 120 }),
      lesson({ paymentStatus: "due", amount: 140 }),
      lesson({ paymentStatus: "waived", amount: 0 }),
    ];

    const { totals } = await runReport({});

    expect(totals.paid).toBe(260);
    expect(totals.due).toBe(140);
    expect(totals.billed).toBe(4);
    expect(totals.unbilled).toBe(0);
  });
});

describe("date bounds", () => {
  it("includes the whole of the `to` day, not up to its midnight", async () => {
    await runReport({ from: "2026-08-01", to: "2026-08-31" });

    const upper = state.bounds.find(
      (b) => b.op === "lt" && (b.col as any).__c === "lessons.startsAt",
    );
    // A lesson at 20:00 on the 31st must still be inside the window.
    const lastLesson = new Date("2026-08-31T17:00:00Z");
    expect((upper!.v as Date).getTime()).toBeGreaterThan(lastLesson.getTime());
  });

  it("opens the window at the start of the `from` day", async () => {
    await runReport({ from: "2026-08-01" });

    const lower = state.bounds.find((b) => b.op === "gte");
    // 00:00 in Jerusalem on 1 Aug is 21:00 UTC on 31 Jul (IDT, +3).
    expect((lower!.v as Date).toISOString()).toBe("2026-07-31T21:00:00.000Z");
  });
});

describe("group billing", () => {
  it("adds group income, which no lesson row can carry", async () => {
    // Group sessions bill monthly per student via groupBilling, so a report
    // that only sums `payments` reports a smaller month than actually happened.
    state.lessonRows = [lesson({ paymentStatus: "paid", amount: 140 })];
    state.billingRows = [
      { status: "paid", amount: 300 },
      { status: "due", amount: 300 },
    ];

    const { totals, groupBilling } = await runReport({
      from: "2026-08-01",
      to: "2026-08-31",
    });

    // Reported alongside the lesson totals, never folded into them.
    expect(totals.paid).toBe(140);
    expect(groupBilling.applies).toBe(true);
    expect(groupBilling.paid).toBe(300);
    expect(groupBilling.due).toBe(300);
  });

  it("is not reported at all when the filters are lesson-shaped", async () => {
    // "What was cancelled in August" must not answer with a group charge that
    // has no cancellation behind it.
    state.lessonRows = [];
    state.billingRows = [{ status: "due", amount: 300 }];

    const { groupBilling } = await runReport({ lessonStatus: "cancelled" });

    expect(groupBilling.applies).toBe(false);
    expect(groupBilling.due).toBe(0);
  });

  it("is left out for an individual-only report", async () => {
    state.billingRows = [{ status: "paid", amount: 300 }];

    const { groupBilling } = await runReport({ type: "individual" });

    expect(groupBilling.applies).toBe(false);
    expect(groupBilling.paid).toBe(0);
  });
});

describe("per-student rollup", () => {
  it("groups by student and keeps unbilled as a COUNT, not an amount", async () => {
    state.lessonRows = [
      lesson({
        studentId: "a",
        studentName: "אימרי",
        paymentStatus: "paid",
        amount: 140,
      }),
      lesson({
        studentId: "a",
        studentName: "אימרי",
        paymentStatus: "due",
        amount: 140,
      }),
      lesson({ studentId: "a", studentName: "אימרי", paymentStatus: null }),
      lesson({
        studentId: "b",
        studentName: "רוני",
        paymentStatus: "paid",
        amount: 120,
      }),
    ];

    const { byStudent } = await runReport({});

    const imri = byStudent.find((s) => s.studentId === "a")!;
    expect(imri.lessons).toBe(3);
    expect(imri.paid).toBe(140);
    expect(imri.due).toBe(140);
    expect(imri.unbilled).toBe(1);
    // Ordered by activity, so the busiest student reads first.
    expect(byStudent[0].studentId).toBe("a");
  });

  it("falls back to the name the parent booked under when no student is linked", async () => {
    state.lessonRows = [
      lesson({ studentId: null, studentName: null, bookedByName: "הורה חדש" }),
    ];

    const { rows, byStudent } = await runReport({});

    expect(rows[0].studentName).toBe("הורה חדש");
    // No student id means no rollup line — nothing to attribute it to.
    expect(byStudent).toHaveLength(0);
  });
});
