import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase";
import { splitVat } from "@/lib/packages";

const schema = z.object({
  locale: z.enum(["en", "ar"]).default("en"),
  service: z.string().min(2),
  description: z.string().optional(),
  amountAed: z.number().positive(),
  clientName: z.string().min(2),
  clientMobile: z.string().min(8),
  clientEmail: z.string().email().optional(),
  recruitName: z.string().optional(),
  recruitEmail: z.string().email().optional(),
  hours: z.number().int().positive().optional(),
});

export async function POST(request: Request) {
  const secret = process.env.INVOICE_ADMIN_SECRET;
  if (!secret || request.headers.get("x-admin-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const money = splitVat(parsed.data.amountAed, false);
  const { data: numberRow, error: numErr } = await supabase.rpc(
    "next_invoice_number",
  );
  if (numErr || !numberRow) {
    return NextResponse.json({ error: "invoice_number" }, { status: 500 });
  }

  const { data: invoice, error } = await supabase
    .from("invoices")
    .insert({
      invoice_number: numberRow as string,
      locale: parsed.data.locale,
      path: "quoted",
      status: "issued",
      service: parsed.data.service,
      description: parsed.data.description ?? null,
      amount_aed: money.amountAed,
      vat_aed: money.vatAed,
      total_aed: money.totalAed,
      client_name: parsed.data.clientName,
      client_mobile: parsed.data.clientMobile,
      client_email: parsed.data.clientEmail ?? null,
      recruit_name: parsed.data.recruitName ?? null,
      recruit_email: parsed.data.recruitEmail ?? null,
      hours: parsed.data.hours ?? null,
    })
    .select("id, invoice_number")
    .single();

  if (error || !invoice) {
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  const payUrl = `${origin}/${parsed.data.locale}/payment/invoice/${invoice.id}`;

  return NextResponse.json({
    id: invoice.id,
    invoiceNumber: invoice.invoice_number,
    payUrl,
  });
}
