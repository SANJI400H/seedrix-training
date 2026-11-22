import { fromCents, toCents } from "./money";

/**
 * Invoice money. Ledger amounts are what the client pays (gross). When VAT is
 * on (company has a TRN and VAT enabled) the gross is split into net + VAT,
 * VAT-inclusive. Mirrors public.vat_parts() in 003.
 */
export function vatParts(gross: number, vatEnabled: boolean, ratePct: number) {
  const g = toCents(gross);
  if (!vatEnabled || !ratePct) return { net: fromCents(g), vat: 0, total: fromCents(g), rate: 0 };
  const net = Math.round(g / (1 + ratePct / 100));
  return { net: fromCents(net), vat: fromCents(g - net), total: fromCents(g), rate: ratePct };
}

export type InvoiceStatus = "issued" | "partial" | "paid" | "cancelled";

/** Paid vs due for an invoice from the non-void payments recorded against it. */
export function invoiceProgress(total: number, payments: Array<{ amount: number; void?: boolean }>, kind: "receipt" | "bill" = "bill") {
  const paid = payments.filter((p) => !p.void).reduce((a, p) => a + toCents(p.amount), 0);
  const t = toCents(total);
  const due = Math.max(0, t - paid);
  let status: InvoiceStatus;
  if (kind === "receipt") status = paid > 0 ? "paid" : "cancelled";
  else status = paid >= t ? "paid" : paid > 0 ? "partial" : "issued";
  return { total: fromCents(t), paid: fromCents(paid), due: fromCents(due), status };
}

/** Course-level position shown on the invoice: agreed fee, paid to date, balance. */
export function courseBalance(agreedFee: number, payments: Array<{ amount: number; void?: boolean; paid_on: string }>, upTo?: string) {
  const paid = payments
    .filter((p) => !p.void && (!upTo || p.paid_on <= upTo))
    .reduce((a, p) => a + toCents(p.amount), 0);
  const fee = toCents(agreedFee);
  return { agreedFee: fromCents(fee), paidToDate: fromCents(paid), balance: fromCents(Math.max(0, fee - paid)) };
}

export const STATUS_LABEL: Record<string, string> = {
  issued: "Unpaid",
  partial: "Partly paid",
  paid: "Paid",
  cancelled: "Cancelled",
  draft: "Draft",
};
