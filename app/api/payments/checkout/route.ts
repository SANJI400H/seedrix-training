import { NextResponse } from "next/server";
import { checkoutSchema } from "@/lib/validation";
import { PACKAGES, packagePriceAed, splitVat } from "@/lib/packages";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getPaymentGateway } from "@/lib/payments/provider";

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = checkoutSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const price = packagePriceAed(parsed.data.packageCode);
  if (price == null) {
    return NextResponse.json(
      { error: "rates_pending" },
      { status: 409 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const pkg = PACKAGES[parsed.data.packageCode];
  const money = splitVat(price, false);
  const description =
    parsed.data.locale === "ar" ? pkg.descriptionAr : pkg.descriptionEn;

  const { data: numberRow, error: numErr } = await supabase.rpc(
    "next_invoice_number",
  );
  if (numErr || !numberRow) {
    console.error(numErr);
    return NextResponse.json({ error: "invoice_number" }, { status: 500 });
  }

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .insert({
      invoice_number: numberRow as string,
      locale: parsed.data.locale,
      path: "self_serve",
      status: "issued",
      service: pkg.service,
      description,
      amount_aed: money.amountAed,
      vat_aed: money.vatAed,
      total_aed: money.totalAed,
      client_name: parsed.data.fullName,
      client_mobile: parsed.data.mobile,
      client_email: parsed.data.email,
      package_code: parsed.data.packageCode,
      hours: pkg.hours,
    })
    .select("*")
    .single();

  if (invErr || !invoice) {
    console.error(invErr);
    return NextResponse.json({ error: "invoice_create" }, { status: 500 });
  }

  const origin = new URL(request.url).origin;
  const successUrl = `${origin}/${parsed.data.locale}/payment?paid=1&invoice=${invoice.id}`;
  const cancelUrl = `${origin}/${parsed.data.locale}/payment`;

  const gateway = getPaymentGateway();
  const session = await gateway.createCheckout({
    amountAed: money.totalAed,
    invoiceNumber: invoice.invoice_number,
    invoiceId: invoice.id,
    method: parsed.data.method,
    customerEmail: parsed.data.email,
    customerName: parsed.data.fullName,
    successUrl,
    cancelUrl,
  });

  await supabase.from("payments").insert({
    invoice_id: invoice.id,
    provider: process.env.PAYMENT_PROVIDER ?? "mock",
    provider_ref: session.providerRef,
    method: parsed.data.method,
    amount_aed: money.totalAed,
    status: "pending",
  });

  return NextResponse.json({ redirectUrl: session.redirectUrl, invoiceId: invoice.id });
}
