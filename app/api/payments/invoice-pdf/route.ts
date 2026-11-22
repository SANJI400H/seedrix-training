import { NextResponse } from "next/server";
import { buildInvoicePdf } from "@/lib/invoice-pdf";
import { loadInvoiceDoc } from "@/lib/invoices/document";
import { buildClientInvoicePdf } from "@/lib/invoices/pdf";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const { data: invoice, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !invoice) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Staff-portal invoices (receipt / bill): client PDF with paid vs due, any status.
  // The id is a random UUID, so the link can't be guessed from the invoice number.
  if (invoice.kind) {
    const doc = await loadInvoiceDoc(supabase, id);
    if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const pdf = await buildClientInvoicePdf(doc);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${invoice.invoice_number}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  }
  if (invoice.status !== "paid") return NextResponse.json({ error: "not_found" }, { status: 404 });

  const pdf = await buildInvoicePdf(invoice);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.invoice_number}.pdf"`,
    },
  });
}
