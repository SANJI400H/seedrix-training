import "server-only";
import { fmtDate } from "@/lib/ledger/dates";
import { aed } from "@/lib/ledger/money";
import type { PaymentOption } from "@/components/portal/payout-form";
import type { Ledger } from "./data";

/** Client payments as options for the payout form (newest first, non-void). */
export function paymentOptions(ledger: Ledger, includeId?: string | null): PaymentOption[] {
  const students = new Map(ledger.students.map((s) => [s.id, s]));
  return ledger.payments
    .filter((p) => !p.void || p.id === includeId)
    .sort((a, b) => b.paid_on.localeCompare(a.paid_on))
    .map((p) => {
      const s = students.get(p.student_id);
      return {
        id: p.id,
        student_id: p.student_id,
        paid_on: p.paid_on,
        amount: p.amount,
        teacher_share: p.teacher_share,
        commission: p.commission,
        academy: p.academy,
        method: p.method,
        void: p.void,
        teacher_id: s?.teacher_id ?? null,
        rep_id: p.rep_id,
        label: `${fmtDate(p.paid_on)} · ${s?.name ?? p.payer_name ?? "Client"} · AED ${aed(p.amount)} (teacher ${aed(p.teacher_share)}, comm. ${aed(p.commission)})`,
      };
    });
}

export function payoutLikes(ledger: Ledger) {
  return ledger.payouts.map((o) => ({
    id: o.id,
    paid_on: o.paid_on,
    type: o.type,
    amount: o.amount,
    client_payment_id: o.client_payment_id,
    void: o.void,
  }));
}
