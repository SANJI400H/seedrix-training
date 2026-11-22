import { fromCents, toCents } from "./money";
import type {
  MatchLike,
  PaymentLike,
  PayoutLike,
  PayoutType,
  StudentLike,
} from "./types";

export function live<T extends { void: boolean }>(rows: T[]): T[] {
  return rows.filter((r) => !r.void);
}

/** Sum of non-void payments for one student. */
export function paidByStudent(studentId: string, payments: PaymentLike[]): number {
  return fromCents(
    live(payments)
      .filter((p) => p.student_id === studentId)
      .reduce((a, p) => a + toCents(p.amount), 0),
  );
}

/** Agreed fee − sum of non-void payments. Negative = client overpaid. */
export function studentBalance(student: StudentLike, payments: PaymentLike[]): number {
  return fromCents(toCents(student.agreed_fee) - toCents(paidByStudent(student.id, payments)));
}

export type BalanceStatus = "paid" | "owes" | "over" | "no_fee";

export function balanceStatus(student: StudentLike, payments: PaymentLike[]): BalanceStatus {
  if (toCents(student.agreed_fee) === 0) {
    return toCents(paidByStudent(student.id, payments)) > 0 ? "no_fee" : "paid";
  }
  const b = toCents(studentBalance(student, payments));
  if (b > 0) return "owes";
  if (b < 0) return "over";
  return "paid";
}

/** What a payment owes out for a given payout type. */
export function dueFor(payment: PaymentLike, type: PayoutType): number | null {
  if (type === "teacher") return Number(payment.teacher_share);
  if (type === "commission") return Number(payment.commission);
  if (type === "refund") return Number(payment.amount);
  return null; // "other" has no due amount
}

/** Already paid out against a payment for a type (non-void), optionally ignoring one payout (when editing). */
export function paidOutFor(
  paymentId: string,
  type: PayoutType,
  payouts: PayoutLike[],
  excludePayoutId?: string | null,
): number {
  return fromCents(
    live(payouts)
      .filter(
        (o) =>
          o.client_payment_id === paymentId &&
          o.type === type &&
          o.id !== excludePayoutId,
      )
      .reduce((a, o) => a + toCents(o.amount), 0),
  );
}

export type PayoutCheck = {
  due: number | null;
  alreadyPaid: number;
  remainingBefore: number | null;
  remainingAfter: number | null;
  overBy: number; // > 0 when the payout would exceed what is due
  overpay: boolean;
};

/** Due vs already paid for a payment, and whether a new/edited payout would overpay it. */
export function checkPayout(
  payment: PaymentLike | null | undefined,
  type: PayoutType,
  amount: number,
  payouts: PayoutLike[],
  excludePayoutId?: string | null,
): PayoutCheck {
  if (!payment) {
    return {
      due: null,
      alreadyPaid: 0,
      remainingBefore: null,
      remainingAfter: null,
      overBy: 0,
      overpay: false,
    };
  }
  const due = dueFor(payment, type);
  const alreadyPaid = paidOutFor(payment.id, type, payouts, excludePayoutId);
  if (due === null) {
    return { due, alreadyPaid, remainingBefore: null, remainingAfter: null, overBy: 0, overpay: false };
  }
  const before = toCents(due) - toCents(alreadyPaid);
  const after = before - toCents(amount);
  return {
    due,
    alreadyPaid,
    remainingBefore: fromCents(before),
    remainingAfter: fromCents(after),
    overBy: after < 0 ? fromCents(-after) : 0,
    overpay: after < 0,
  };
}

/** A payout already over what's due on its payment (after all payouts of that type). */
export function payoutsOverDue(payments: PaymentLike[], payouts: PayoutLike[]) {
  const out: Array<{ paymentId: string; type: PayoutType; due: number; paid: number; overBy: number }> = [];
  const byId = new Map(payments.map((p) => [p.id, p]));
  const seen = new Set<string>();
  for (const o of live(payouts)) {
    if (!o.client_payment_id || o.type === "other") continue;
    const key = `${o.client_payment_id}:${o.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const p = byId.get(o.client_payment_id);
    if (!p) continue;
    const due = dueFor(p, o.type) ?? 0;
    const paid = paidOutFor(p.id, o.type, payouts);
    if (toCents(paid) > toCents(due)) {
      out.push({ paymentId: p.id, type: o.type, due, paid, overBy: fromCents(toCents(paid) - toCents(due)) });
    }
  }
  return out;
}

export type DuplicateHit = { id: string; paid_on: string; amount: number };

/**
 * Possible double entry: same student, same amount, within `days` days.
 * Used to warn (and require a confirm) before saving e.g. a renewal twice.
 */
export function findPossibleDuplicates(
  candidate: { id?: string | null; student_id: string; amount: number; paid_on: string },
  payments: PaymentLike[],
  days = 7,
): DuplicateHit[] {
  const t = Date.parse(candidate.paid_on + "T00:00:00Z");
  return live(payments)
    .filter(
      (p) =>
        p.id !== candidate.id &&
        p.student_id === candidate.student_id &&
        toCents(p.amount) === toCents(candidate.amount) &&
        Math.abs(Date.parse(p.paid_on + "T00:00:00Z") - t) <= days * 86400000,
    )
    .map((p) => ({ id: p.id, paid_on: p.paid_on, amount: Number(p.amount) }));
}

/** Would this payment take the student over the agreed fee? Returns the excess (0 if fine). */
export function overpaymentBy(
  student: StudentLike,
  payments: PaymentLike[],
  amount: number,
  excludePaymentId?: string | null,
): number {
  if (toCents(student.agreed_fee) === 0) return 0;
  const others = payments.filter((p) => p.id !== excludePaymentId);
  const after = toCents(paidByStudent(student.id, others)) + toCents(amount);
  const over = after - toCents(student.agreed_fee);
  return over > 0 ? fromCents(over) : 0;
}

export type BankState = "none" | "ok" | "changed";

export function activeMatchFor(
  entry: { id: string },
  kind: "payment" | "payout",
  matches: MatchLike[],
): MatchLike | undefined {
  return matches.find(
    (m) =>
      m.unmatched_at === null &&
      (kind === "payment" ? m.client_payment_id === entry.id : m.payout_id === entry.id),
  );
}

/** "ok" when matched and the recorded amount still equals the amount confirmed against the bank. */
export function bankState(
  entry: { id: string; amount: number },
  kind: "payment" | "payout",
  matches: MatchLike[],
): BankState {
  const m = activeMatchFor(entry, kind, matches);
  if (!m) return "none";
  return toCents(m.matched_amount) === toCents(entry.amount) ? "ok" : "changed";
}

export type Totals = {
  moneyIn: number;
  moneyOut: number;
  shouldBeInAccount: number;
  teacherDue: number;
  teacherPaid: number;
  teacherOwed: number;
  commissionDue: number;
  commissionPaid: number;
  commissionOwed: number;
  academy: number;
  refunds: number;
  other: number;
  clientsOwe: number;
};

export function totals(
  payments: PaymentLike[],
  payouts: PayoutLike[],
  students: StudentLike[],
): Totals {
  const P = live(payments);
  const O = live(payouts);
  const c = (rows: Array<{ amount: number }>) => rows.reduce((a, r) => a + toCents(r.amount), 0);
  const moneyIn = c(P);
  const moneyOut = c(O);
  const teacherDue = P.reduce((a, p) => a + toCents(p.teacher_share), 0);
  const commissionDue = P.reduce((a, p) => a + toCents(p.commission), 0);
  const academy = P.reduce((a, p) => a + toCents(p.academy), 0);
  const teacherPaid = c(O.filter((o) => o.type === "teacher"));
  const commissionPaid = c(O.filter((o) => o.type === "commission"));
  const refunds = c(O.filter((o) => o.type === "refund"));
  const other = c(O.filter((o) => o.type === "other"));
  let clientsOwe = 0;
  for (const s of students) {
    if (s.status === "archived" || s.status === "cancelled") continue;
    const b = toCents(studentBalance(s, payments));
    if (b > 0) clientsOwe += b;
  }
  return {
    moneyIn: fromCents(moneyIn),
    moneyOut: fromCents(moneyOut),
    shouldBeInAccount: fromCents(moneyIn - moneyOut),
    teacherDue: fromCents(teacherDue),
    teacherPaid: fromCents(teacherPaid),
    teacherOwed: fromCents(teacherDue - teacherPaid),
    commissionDue: fromCents(commissionDue),
    commissionPaid: fromCents(commissionPaid),
    commissionOwed: fromCents(commissionDue - commissionPaid),
    academy: fromCents(academy),
    refunds: fromCents(refunds),
    other: fromCents(other),
    clientsOwe: fromCents(clientsOwe),
  };
}

/** Students with money owed whose next payment date has passed. */
export function overdueBalances(
  students: StudentLike[],
  payments: PaymentLike[],
  today: string,
) {
  return students
    .filter((s) => s.status !== "archived" && s.status !== "cancelled")
    .map((s) => ({ student: s, balance: studentBalance(s, payments) }))
    .filter(
      (x) =>
        toCents(x.balance) > 0 &&
        !!x.student.next_payment_date &&
        x.student.next_payment_date < today,
    );
}
