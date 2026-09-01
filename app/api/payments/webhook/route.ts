import { NextResponse } from "next/server";
import { notifyRecruitPaid, sendPaymentConfirmation } from "@/lib/email";
import { buildInvoicePdf } from "@/lib/invoice-pdf";
import { getPaymentGateway } from "@/lib/payments/provider";
import { getSupabaseAdmin } from "@/lib/supabase";

async function markPaid(opts: {
  invoiceId: string;
  providerRef: string;
  method: string;
}) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase not configured");

  const { data: invoice, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", opts.invoiceId)
    .single();
  if (error || !invoice) throw new Error("Invoice not found");

  if (invoice.status !== "paid") {
    await supabase
      .from("invoices")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        payment_method: opts.method,
      })
      .eq("id", invoice.id);

    await supabase.from("payments").insert({
      invoice_id: invoice.id,
      provider: process.env.PAYMENT_PROVIDER ?? "mock",
      provider_ref: opts.providerRef,
      method: opts.method,
      amount_aed: invoice.total_aed,
      status: "paid",
    });
  }

  const pdf = await buildInvoicePdf({ ...invoice, status: "paid" });
  if (invoice.client_email) {
    await sendPaymentConfirmation({
      to: invoice.client_email,
      locale: invoice.locale === "ar" ? "ar" : "en",
      invoiceNumber: invoice.invoice_number,
      totalAed: String(invoice.total_aed),
      pdf,
    });
  }
  await notifyRecruitPaid({
    recruitEmail: invoice.recruit_email,
    invoiceNumber: invoice.invoice_number,
    clientName: invoice.client_name,
  });

  return invoice;
}

export async function POST(request: Request) {
  const raw = await request.text();
  const gateway = getPaymentGateway();
  const event = await gateway.parseWebhook(raw, request.headers);
  if (event.status !== "paid" || !event.invoiceId) {
    return NextResponse.json({ ok: true, ignored: true });
  }
  await markPaid({
    invoiceId: event.invoiceId,
    providerRef: event.providerRef,
    method: event.method,
  });
  return NextResponse.json({ ok: true });
}

/** Mock / hosted-page return: finalize only when PAYMENT_PROVIDER=mock */
export async function GET(request: Request) {
  if ((process.env.PAYMENT_PROVIDER ?? "mock") !== "mock") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const url = new URL(request.url);
  const invoiceId = url.searchParams.get("invoice");
  const ref = url.searchParams.get("ref") ?? "mock";
  const method = url.searchParams.get("method") ?? "card";
  if (!invoiceId) {
    return NextResponse.json({ error: "missing" }, { status: 400 });
  }
  const invoice = await markPaid({
    invoiceId,
    providerRef: ref,
    method,
  });
  const locale = invoice.locale === "ar" ? "ar" : "en";
  return NextResponse.redirect(
    new URL(`/${locale}/payment?paid=1&invoice=${invoice.id}`, url.origin),
  );
}
