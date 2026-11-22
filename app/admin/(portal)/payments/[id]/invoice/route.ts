import { NextResponse } from "next/server";
import { getMe } from "@/lib/portal/auth";

/** Opens the invoice for a payment, creating the receipt invoice on first use. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, me } = await getMe();
  if (!supabase || !me?.staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: pay } = await supabase.from("client_payments").select("invoice_id, void").eq("id", id).maybeSingle();
  if (!pay) return NextResponse.json({ error: "not_found" }, { status: 404 });
  let invoiceId = pay.invoice_id as string | null;
  if (!invoiceId) {
    if (pay.void) return NextResponse.json({ error: "void" }, { status: 409 });
    const { data, error } = await supabase.rpc("create_payment_invoice", { p_payment_id: id });
    if (error || !data) return NextResponse.json({ error: "invoice_failed" }, { status: 500 });
    invoiceId = data as string;
  }
  return NextResponse.redirect(new URL(`/admin/invoices/${invoiceId}`, request.url));
}
