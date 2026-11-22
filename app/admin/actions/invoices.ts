"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { loadInvoiceDoc, publicInvoiceUrl } from "@/lib/invoices/document";
import { buildClientInvoicePdf } from "@/lib/invoices/pdf";
import { emailInvoice, whatsappInvoiceUrl } from "@/lib/invoices/send";
import type { ActionState } from "@/lib/portal/action-state";
import { requireStaff } from "@/lib/portal/auth";
import { dbError } from "@/lib/portal/forms";

/** Email the PDF to the client (Resend). Each attempt is logged in invoice_sends (audited). */
export async function emailInvoiceAction(invoiceId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireStaff();
  const to = z.string().trim().email("Enter the client's email").safeParse(fd.get("to"));
  if (!to.success) return { error: to.error.issues[0]?.message };
  const doc = await loadInvoiceDoc(supabase, invoiceId);
  if (!doc) return { error: "Invoice not found" };
  const pdf = await buildClientInvoicePdf(doc);
  const res = await emailInvoice(doc, to.data, pdf, publicInvoiceUrl(invoiceId));
  const { error } = await supabase
    .from("invoice_sends")
    .insert({ invoice_id: invoiceId, channel: "email", recipient: to.data, ok: res.ok, error: res.error ?? null });
  if (error) return dbError(error);
  revalidatePath(`/admin/invoices/${invoiceId}`);
  return res.ok ? { ok: true, message: `Emailed to ${to.data}.` } : { error: `Not sent: ${res.error}` };
}

/** Log the WhatsApp share, then open wa.me with the invoice link. */
export async function whatsappInvoiceAction(invoiceId: string, fd: FormData) {
  const { supabase } = await requireStaff();
  const phone = String(fd.get("phone") ?? "").trim();
  const doc = await loadInvoiceDoc(supabase, invoiceId);
  if (!doc) redirect(`/admin/invoices/${invoiceId}?error=notfound`);
  const url = whatsappInvoiceUrl(phone, doc, publicInvoiceUrl(invoiceId));
  if (!url) redirect(`/admin/invoices/${invoiceId}?error=phone`);
  await supabase.from("invoice_sends").insert({ invoice_id: invoiceId, channel: "whatsapp", recipient: phone, ok: true });
  redirect(url);
}

export async function logLinkCopied(invoiceId: string) {
  const { supabase } = await requireStaff();
  await supabase.from("invoice_sends").insert({ invoice_id: invoiceId, channel: "link", ok: true });
  revalidatePath(`/admin/invoices/${invoiceId}`);
}

export async function cancelBill(invoiceId: string): Promise<ActionState> {
  const { supabase } = await requireStaff();
  const { error } = await supabase.rpc("cancel_bill_invoice", { p_invoice: invoiceId });
  if (error) return dbError(error);
  revalidatePath(`/admin/invoices/${invoiceId}`);
  return { ok: true, message: "Invoice cancelled." };
}
