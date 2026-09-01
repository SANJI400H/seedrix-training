import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { invoiceLookupSchema } from "@/lib/validation";

function normalizeMobile(value: string) {
  return value.replace(/[^\d+]/g, "");
}

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = invoiceLookupSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const { data: invoice, error } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, service, description, total_aed, status, recruit_name, client_name, client_mobile",
    )
    .eq("invoice_number", parsed.data.invoiceNumber.trim().toUpperCase())
    .maybeSingle();

  if (error || !invoice) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const onFile = normalizeMobile(invoice.client_mobile);
  const provided = normalizeMobile(parsed.data.mobile);
  if (!onFile.endsWith(provided.replace("+", "").slice(-9))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    id: invoice.id,
    invoiceNumber: invoice.invoice_number,
    service: invoice.service,
    description: invoice.description,
    totalAed: invoice.total_aed,
    status: invoice.status,
    recruitName: invoice.recruit_name,
    clientName: invoice.client_name,
  });
}
