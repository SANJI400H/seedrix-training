import { describe, expect, it } from "vitest";
import { computeSplit, previewSplit } from "./split";
import {
  balanceStatus,
  bankState,
  checkPayout,
  findPossibleDuplicates,
  overdueBalances,
  overpaymentBy,
  paidByStudent,
  payoutsOverDue,
  studentBalance,
  totals,
} from "./balances";
import {
  dedupeByRef,
  nameSimilarity,
  parseWioCsv,
  suggestMatches,
  unmatchedBankLines,
  unmatchedEntries,
  type LedgerEntry,
} from "./bank";
import { round2, sum } from "./money";
import type { MatchLike, PaymentLike, PayoutLike, StudentLike } from "./types";

// --- fixtures (fictional people, not real client data) ----------------------
function pay(id: string, student_id: string, amount: number, teacher: number, paid_on = "2026-09-01", extra: Partial<PaymentLike> = {}): PaymentLike {
  const s = computeSplit(amount, teacher, 80);
  return {
    id,
    student_id,
    paid_on,
    amount,
    teacher_share: teacher,
    commission: s.commission,
    academy: s.academy,
    method: "bank_transfer",
    void: false,
    ...extra,
  };
}
function out(id: string, type: PayoutLike["type"], amount: number, client_payment_id: string | null, extra: Partial<PayoutLike> = {}): PayoutLike {
  return { id, type, amount, client_payment_id, paid_on: "2026-09-03", void: false, ...extra };
}
const student = (id: string, fee: number, extra: Partial<StudentLike> = {}): StudentLike => ({
  id,
  name: id,
  agreed_fee: fee,
  status: "active",
  ...extra,
});

describe("split", () => {
  it("splits 80/20 after the teacher share", () => {
    expect(computeSplit(850, 350, 80)).toEqual({
      amount: 850,
      teacherShare: 350,
      salesPct: 80,
      commission: 400,
      academy: 100,
    });
  });

  it("rounds commission to 2 decimals and gives the academy the remainder", () => {
    const s = computeSplit(100.01, 0, 80);
    expect(s.commission).toBe(80.01); // 80.008 -> 80.01
    expect(s.academy).toBe(20);
    expect(round2(s.commission + s.academy + s.teacherShare)).toBe(100.01);
  });

  it("amount always equals teacher + commission + academy", () => {
    for (const [a, t, p] of [
      [1700, 780, 80],
      [333.33, 111.11, 75],
      [1125, 900, 80],
      [99.99, 0.01, 33.33],
    ] as const) {
      const s = computeSplit(a, t, p);
      expect(sum([s.teacherShare, s.commission, s.academy])).toBe(a);
    }
  });

  it("rejects a teacher share above the amount", () => {
    expect(() => computeSplit(500, 600, 80)).toThrow(/Teacher share/);
    expect(previewSplit(500, 600, 80).error).toMatch(/Teacher share/);
  });

  it("handles 0% and 100% sales", () => {
    expect(computeSplit(1000, 200, 0)).toMatchObject({ commission: 0, academy: 800 });
    expect(computeSplit(1000, 200, 100)).toMatchObject({ commission: 800, academy: 0 });
  });
});

describe("balances", () => {
  const s = student("s1", 1700);
  const payments = [pay("p1", "s1", 850, 350), pay("p2", "s1", 500, 200), pay("p3", "s1", 300, 0, "2026-09-02", { void: true })];

  it("ignores void payments", () => {
    expect(paidByStudent("s1", payments)).toBe(1350);
    expect(studentBalance(s, payments)).toBe(350);
    expect(balanceStatus(s, payments)).toBe("owes");
  });

  it("flags overpayment by the client", () => {
    expect(overpaymentBy(s, payments, 400)).toBe(50);
    expect(overpaymentBy(s, payments, 350)).toBe(0);
    // editing p2 from 500 to 850 -> 1700 exactly
    expect(overpaymentBy(s, payments, 850, "p2")).toBe(0);
  });

  it("lists overdue balances", () => {
    const st = [student("s1", 1700, { next_payment_date: "2026-09-15" }), student("s2", 500, { next_payment_date: "2026-12-01" })];
    const od = overdueBalances(st, payments, "2026-10-01");
    expect(od.map((x) => x.student.id)).toEqual(["s1"]);
  });
});

describe("payouts: due vs paid", () => {
  const p = pay("p1", "s1", 850, 350); // teacher 350, commission 400, academy 100

  it("shows due and already paid", () => {
    const payouts = [out("o1", "teacher", 200, "p1")];
    const c = checkPayout(p, "teacher", 150, payouts);
    expect(c).toMatchObject({ due: 350, alreadyPaid: 200, remainingBefore: 150, remainingAfter: 0, overpay: false });
  });

  it("warns when a payout would exceed what is due", () => {
    const payouts = [out("o1", "commission", 400, "p1")];
    const c = checkPayout(p, "commission", 50, payouts);
    expect(c.overpay).toBe(true);
    expect(c.overBy).toBe(50);
  });

  it("excludes the payout being edited", () => {
    const payouts = [out("o1", "teacher", 350, "p1")];
    expect(checkPayout(p, "teacher", 350, payouts, "o1").overpay).toBe(false);
  });

  it("finds payouts already over due on the dashboard", () => {
    const payouts = [out("o1", "teacher", 300, "p1"), out("o2", "teacher", 100, "p1"), out("o3", "commission", 400, "p1")];
    const over = payoutsOverDue([p], payouts);
    expect(over).toEqual([{ paymentId: "p1", type: "teacher", due: 350, paid: 400, overBy: 50 }]);
  });
});

describe("reconciliation scenarios", () => {
  it("double entry: a renewal entered twice is caught before saving", () => {
    const existing = [pay("p1", "s1", 1500, 1200, "2026-10-05")];
    const hits = findPossibleDuplicates({ student_id: "s1", amount: 1500, paid_on: "2026-10-07" }, existing);
    expect(hits.map((h) => h.id)).toEqual(["p1"]);
    // a different amount or a different student is not a duplicate
    expect(findPossibleDuplicates({ student_id: "s1", amount: 1400, paid_on: "2026-10-07" }, existing)).toEqual([]);
    expect(findPossibleDuplicates({ student_id: "s2", amount: 1500, paid_on: "2026-10-07" }, existing)).toEqual([]);
    // a voided duplicate no longer counts
    expect(findPossibleDuplicates({ student_id: "s1", amount: 1500, paid_on: "2026-10-07" }, [{ ...existing[0], void: true }])).toEqual([]);
  });

  it("overpay: payouts to staff/teachers above what the payments justify are visible", () => {
    const payments = [pay("p1", "s1", 1125, 900), pay("p2", "s2", 1700, 780)];
    // p1: teacher 900, commission 180, academy 45; p2: teacher 780, commission 736, academy 184
    const payouts = [
      out("o1", "teacher", 900, "p1"),
      out("o2", "commission", 180, "p1"),
      out("o3", "teacher", 1682, "p2"), // 902 more than the 780 due
    ];
    const over = payoutsOverDue(payments, payouts);
    expect(over).toHaveLength(1);
    expect(over[0]).toMatchObject({ paymentId: "p2", type: "teacher", overBy: 902 });
    const t = totals(payments, payouts, [student("s1", 1125), student("s2", 1700)]);
    expect(t.teacherOwed).toBe(-902);
  });

  it("unrecorded receipt: a bank credit with no ledger entry stays unmatched", () => {
    const lines = [
      { id: "b1", booked_on: "2026-09-01", ref: "100", description: "From Jane Example", amount: 850 },
      { id: "b2", booked_on: "2026-09-04", ref: "101", description: "From John Sample", amount: 500 },
    ];
    const payments = [pay("p1", "s1", 850, 350, "2026-09-02")];
    const entries: LedgerEntry[] = [{ kind: "payment", entry: payments[0], name: "Jane Example" }];
    const sugg = suggestMatches(lines, entries, []);
    expect(sugg).toHaveLength(1);
    expect(sugg[0]).toMatchObject({ bankLineId: "b1", entryId: "p1", days: 1 });
    const matches: MatchLike[] = [
      { id: "m1", bank_line_id: "b1", client_payment_id: "p1", payout_id: null, matched_amount: 850, unmatched_at: null },
    ];
    expect(unmatchedBankLines(lines, matches).map((l) => l.ref)).toEqual(["101"]);
  });

  it("marked paid but never reached the bank: entries without a match are listed", () => {
    const payments = [pay("p1", "s1", 600, 0), pay("p2", "s2", 700, 0)];
    const entries: LedgerEntry[] = payments.map((p) => ({ kind: "payment" as const, entry: p, name: p.id }));
    const matches: MatchLike[] = [
      { id: "m1", bank_line_id: "b1", client_payment_id: "p1", payout_id: null, matched_amount: 600, unmatched_at: null },
    ];
    expect(unmatchedEntries(entries, matches).map((e) => e.entry.id)).toEqual(["p2"]);
  });

  it("changed after confirm: editing a matched amount is flagged", () => {
    const m: MatchLike[] = [
      { id: "m1", bank_line_id: "b1", client_payment_id: "p1", payout_id: null, matched_amount: 600, unmatched_at: null },
    ];
    expect(bankState({ id: "p1", amount: 600 }, "payment", m)).toBe("ok");
    expect(bankState({ id: "p1", amount: 650 }, "payment", m)).toBe("changed");
    expect(bankState({ id: "p2", amount: 650 }, "payment", m)).toBe("none");
    expect(bankState({ id: "p1", amount: 650 }, "payment", [{ ...m[0], unmatched_at: "2026-10-01" }])).toBe("none");
  });

  it("dates a week off are not auto-suggested (outside ±3 days)", () => {
    const lines = [{ id: "b1", booked_on: "2026-09-10", ref: "1", description: "From A", amount: 300 }];
    const entries: LedgerEntry[] = [{ kind: "payment", entry: pay("p1", "s1", 300, 0, "2026-09-03"), name: "A" }];
    expect(suggestMatches(lines, entries, [])).toEqual([]);
  });
});

describe("totals", () => {
  it("computes should-be-in-account and what is still owed", () => {
    const payments = [pay("p1", "s1", 850, 350), pay("p2", "s2", 600, 200)];
    const payouts = [out("o1", "teacher", 350, "p1"), out("o2", "commission", 100, "p1"), out("o3", "refund", 50, "p2"), out("o4", "other", 10, null, { void: true })];
    const t = totals(payments, payouts, [student("s1", 1700), student("s2", 600)]);
    expect(t.moneyIn).toBe(1450);
    expect(t.moneyOut).toBe(500);
    expect(t.shouldBeInAccount).toBe(950);
    expect(t.teacherOwed).toBe(200);
    expect(t.commissionDue).toBe(400 + 320);
    expect(t.commissionOwed).toBe(620);
    expect(t.academy).toBe(100 + 80);
    expect(t.clientsOwe).toBe(850);
  });
});

describe("bank CSV", () => {
  const csv = [
    "Account name,Account type,Account IBAN,Account number,Card number,Account currency,Transaction type,Date,Ref. number,Description,Amount,Balance,Original ref. number,Notes",
    "Test Co,Current,AE000000000000000000000,0000000000,N/A,AED,Transfers,2026-08-27,111,From Jane Example,100.00,100.00,N/A,",
    'Test Co,Current,AE000000000000000000000,0000000000,N/A,AED,Transfers,2026-09-01,112,"To John, Sample",-550.00,"-450.00",N/A,"note, with comma"',
    "Test Co,Current,AE000000000000000000000,0000000000,409887******0000,AED,Card,2026-09-15,113,Cars Taxi,-27.00,-477.00,N/A,",
    "Test Co,Current,AE000000000000000000000,0000000000,N/A,AED,Fees,2026-09-15,114,Local Transfer Fee,-1.05,-478.05,112,LocalOutward FOR 112",
    "Test Co,Current,AE000000000000000000000,0000000000,N/A,AED,Fees,2026-09-15,114,Local Transfer Fee,-1.05,-478.05,112,dup",
  ].join("\r\n");

  it("parses Wio columns, types and quoted fields", () => {
    const r = parseWioCsv("﻿" + csv);
    expect(r.lines).toHaveLength(4);
    expect(r.errors).toHaveLength(1); // duplicate ref inside the file
    expect(r.lines.map((l) => l.kind)).toEqual(["transfer", "transfer", "card", "fee"]);
    expect(r.lines[1]).toMatchObject({ description: "To John, Sample", amount: -550, balance: -450, notes: "note, with comma", original_ref: null });
    expect(r.lines[3].original_ref).toBe("112");
    expect(r.account?.currency).toBe("AED");
  });

  it("rejects files without the expected columns", () => {
    expect(parseWioCsv("a,b\n1,2").errors[0]).toMatch(/Missing columns/);
  });

  it("skips refs already imported", () => {
    const r = parseWioCsv(csv);
    const d = dedupeByRef(r.lines, ["111", "113"]);
    expect(d.fresh.map((l) => l.ref)).toEqual(["112", "114"]);
    expect(d.duplicates).toHaveLength(2);
  });

  it("matches payout names against the description", () => {
    expect(nameSimilarity("To JOHN EXAMPLE SAMPLE", "John Sample")).toBe(1);
    expect(nameSimilarity("From Jane Example", "Mohammed")).toBe(0);
  });

  it("prefers the name match when two entries have the same amount", () => {
    const lines = [{ id: "b1", booked_on: "2026-09-01", ref: "1", description: "From Jane Example", amount: 500 }];
    const entries: LedgerEntry[] = [
      { kind: "payment", entry: pay("p1", "s1", 500, 0, "2026-09-01"), name: "Someone Else" },
      { kind: "payment", entry: pay("p2", "s2", 500, 0, "2026-09-02"), name: "Jane" },
    ];
    expect(suggestMatches(lines, entries, [])[0].entryId).toBe("p2");
  });

  it("matches payouts against negative bank lines only", () => {
    const lines = [{ id: "b1", booked_on: "2026-09-01", ref: "1", description: "To Teacher One", amount: -350 }];
    const entries: LedgerEntry[] = [
      { kind: "payment", entry: pay("p1", "s1", 350, 0, "2026-09-01"), name: "Teacher One" },
      { kind: "payout", entry: out("o1", "teacher", 350, "p1", { paid_on: "2026-09-02" }), name: "Teacher One" },
    ];
    const s = suggestMatches(lines, entries, []);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ kind: "payout", entryId: "o1" });
  });
});
