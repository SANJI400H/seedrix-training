import { NextResponse } from "next/server";
import { z } from "zod";
import { getPaymentGateway } from "@/lib/payments/provider";
import { getSupabaseAdmin } from "@/lib/supabase";

const schema = z.object({
  invoiceId: z.string().uuid(),
  method: z.enum(["card", "tabby", "tamara"]),
  locale: z.enum(["en", "ar"]),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const { data: invoice, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", parsed.data.invoiceId)
    .single();

  if (error || !invoice) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (invoice.status === "paid") {
    return NextResponse.json({ error: "already_paid" }, { status: 409 });
  }

  const origin = new URL(request.url).origin;
  const successUrl = `${origin}/${parsed.data.locale}/payment?paid=1&invoice=${invoice.id}`;
  const gateway = getPaymentGateway();
  const session = await gateway.createCheckout({
    amountAed: Number(invoice.total_aed),
    invoiceNumber: invoice.invoice_number,
    invoiceId: invoice.id,
    method: parsed.data.method,
    customerEmail: invoice.client_email ?? "payments@seedrixtraining.com",
    customerName: invoice.client_name,
    successUrl,
    cancelUrl: `${origin}/${parsed.data.locale}/payment/invoice/${invoice.id}`,
  });

  await supabase.from("payments").insert({
    invoice_id: invoice.id,
    provider: process.env.PAYMENT_PROVIDER ?? "mock",
    provider_ref: session.providerRef,
    method: parsed.data.method,
    amount_aed: invoice.total_aed,
    status: "pending",
  });

  return NextResponse.json({ redirectUrl: session.redirectUrl });
}
