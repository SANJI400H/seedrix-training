import { fromCents, toCents } from "./money";

export type Split = {
  amount: number;
  teacherShare: number;
  salesPct: number;
  commission: number;
  academy: number;
};

export class SplitError extends Error {}

/**
 * Split one client payment.
 *   commission = round((amount − teacher_share) × sales_pct / 100, 2)
 *   academy    = amount − teacher_share − commission
 * Mirrors public.client_payment_split() in 002_staff_portal.sql.
 */
export function computeSplit(
  amount: number,
  teacherShare: number,
  salesPct: number,
): Split {
  const a = toCents(amount);
  const t = toCents(teacherShare);
  if (a <= 0) throw new SplitError("Amount must be more than zero");
  if (t < 0) throw new SplitError("Teacher share cannot be negative");
  if (t > a) throw new SplitError("Teacher share cannot be more than the payment");
  if (!(salesPct >= 0 && salesPct <= 100)) {
    throw new SplitError("Sales % must be between 0 and 100");
  }
  const rest = a - t;
  // rest is an integer number of cents; round half up like numeric round()
  const commission = Math.round((rest * salesPct) / 100 + 1e-9);
  const academy = rest - commission;
  return {
    amount: fromCents(a),
    teacherShare: fromCents(t),
    salesPct,
    commission: fromCents(commission),
    academy: fromCents(academy),
  };
}

/** Same as computeSplit but never throws (for live previews). */
export function previewSplit(
  amount: number,
  teacherShare: number,
  salesPct: number,
): (Split & { error: null }) | { error: string } {
  try {
    return { ...computeSplit(amount, teacherShare, salesPct), error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Invalid split" };
  }
}
