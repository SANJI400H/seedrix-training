import { NextResponse } from "next/server";
import { buildInvoicePdf, type InvoiceRecord } from "@/lib/invoice-pdf";
import { paidByStudent } from "@/lib/ledger/balances";
import { aed, toCents } from "@/lib/ledger/money";
import { getMe } from "@/lib/portal/auth";
import { loadSettings } from "@/lib/portal/data";
import { METHOD_LABEL, type ClientPayment, type Invoice, type Student } from "@/lib/portal/types";

/** Invoice / receipt PDF for one client payment. Creates the invoice row on first download. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, me } = await getMe();
  if (!supabase || !me?.staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: pay } = await supabase.from("client_payments").select("*").eq("id", id).maybeSingle();
  if (!pay) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const p = pay as ClientPayment;

  let invoiceId = p.invoice_id;
  if (!invoiceId) {
    if (p.void) return NextResponse.json({ error: "void" }, { status: 409 });
    const { data, error } = await supabase.rpc("create_payment_invoice", { p_payment_id: id });
    if (error || !data) return NextResponse.json({ error: "invoice_failed" }, { status: 500 });
    invoiceId = data as string;
  }

  const [{ data: inv }, { data: st }, { data: studentPays }, settings] = await Promise.all([
    supabase.from("invoices").select("*").eq("id", invoiceId).maybeSingle(),
    supabase.from("students").select("*").eq("id", p.student_id).maybeSingle(),
    supabase.from("client_payments").select("id, student_id, amount, void, paid_on, teacher_share, commission, academy, method").eq("student_id", p.student_id),
    loadSettings(supabase),
  ]);
  if (!inv) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const invoice = inv as Invoice;
  const student = st as Student | null;
  const amount = Number(p.amount);

  // Paid to date counts payments up to and including this one (by date), so older receipts stay meaningful.
  const upTo = ((studentPays ?? []) as ClientPayment[])
    .map((x) => ({ ...x, amount: Number(x.amount) }))
    .filter((x) => x.paid_on <= p.paid_on);
  const fee = Number(student?.agreed_fee ?? 0);
  const paidToDate = paidByStudent(p.student_id, upTo);
  const amended = toCents(invoice.total_aed) !== toCents(amount);

  const record: InvoiceRecord = {
    ...invoice,
    amount_aed: amount,
    vat_aed: 0,
    total_aed: amount,
    status: p.void ? "void" : "paid",
    paid_at: p.paid_on,
  };
  const summary: Array<[string, string]> = [
    ["Paid on this invoice (AED)", aed(amount)],
    ["Payment method", METHOD_LABEL[p.method]],
  ];
  if (fee > 0) {
    summary.push(["Agreed course fee (AED)", aed(fee)]);
    summary.push(["Total paid to date (AED)", aed(paidToDate)]);
    summary.push(["Balance remaining (AED)", aed(Math.max(0, fee - paidToDate))]);
  }
  const footer = [
    `${settings.company_name}${settings.trade_name ? ` (${settings.trade_name})` : ""}${settings.license_no ? ` — License No. ${settings.license_no}` : ""}`,
    settings.address,
    settings.trn ? `TRN ${settings.trn}` : "Not VAT registered — no VAT charged.",
    settings.iban ? `Payments to ${settings.company_name} · ${settings.bank_name} · IBAN ${settings.iban}` : "",
    settings.invoice_footer,
  ].filter(Boolean);

  const pdf = await buildInvoicePdf(record, {
    recruitLabel: "Sales rep",
    extraLines: student && student.name !== invoice.client_name ? [`Student: ${student.name}`] : [],
    summary,
    footer,
    notice: p.void
      ? `VOID — ${p.void_reason ?? ""}`
      : amended
        ? `Amended: originally issued for AED ${aed(invoice.total_aed)}`
        : undefined,
  });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.invoice_number}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
