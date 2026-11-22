import { NextResponse } from "next/server";
import { loadInvoiceDoc } from "@/lib/invoices/document";
import { buildClientInvoicePdf } from "@/lib/invoices/pdf";
import { getMe } from "@/lib/portal/auth";

/** Client invoice PDF (portal). RLS decides whether this user may see it. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, me } = await getMe();
  if (!supabase || !me?.staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const doc = await loadInvoiceDoc(supabase, id);
  if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const pdf = await buildClientInvoicePdf(doc);
  const inline = new URL(request.url).searchParams.get("inline") === "1";
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${doc.invoice.invoice_number}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
