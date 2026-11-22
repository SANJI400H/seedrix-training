import "server-only";
import { Resend } from "resend";
import { aed } from "@/lib/ledger/money";
import type { InvoiceDoc } from "./document";

/** Email the invoice PDF to the client via Resend. */
export async function emailInvoice(d: InvoiceDoc, to: string, pdf: Buffer, link: string): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "Email is not configured (RESEND_API_KEY missing)." };
  const resend = new Resend(key);
  const from = process.env.RESEND_FROM ?? "Seedrix Training <noreply@seedrixtraining.com>";
  const paid = d.progress.status === "paid";
  const subject = `${paid ? "Receipt" : "Invoice"} ${d.invoice.invoice_number} — ${d.settings.trade_name || "Seedrix Learning"}`;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const html = `<p>Hello ${esc(d.invoice.client_name)},</p>
<p>${paid ? "Thank you for your payment." : "Please find your invoice attached."}</p>
<ul>
<li>Invoice: <b>${esc(d.invoice.invoice_number)}</b></li>
${d.student ? `<li>Student: ${esc(d.student.name)}</li>` : ""}
<li>Total: AED ${aed(d.invoice.total_aed)} · paid AED ${aed(d.progress.paid)}${d.invoice.kind === "bill" ? ` · due AED ${aed(d.progress.due)}` : ""}</li>
${d.course && d.course.agreedFee > 0 ? `<li>Course balance remaining: AED ${aed(d.course.balance)}</li>` : ""}
</ul>
<p>View or download it any time: <a href="${link}">${link}</a></p>
<p>${esc(d.settings.company_name)}${d.settings.trade_name ? ` · ${esc(d.settings.trade_name)}` : ""}</p>`;
  try {
    const r = await resend.emails.send({
      from,
      to,
      subject,
      html,
      attachments: [{ filename: `${d.invoice.invoice_number}.pdf`, content: pdf }],
    });
    if (r.error) return { ok: false, error: r.error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Send failed" };
  }
}

/** wa.me link with a message that links to the public invoice page. */
export function whatsappInvoiceUrl(phone: string | null | undefined, d: InvoiceDoc, link: string): string | null {
  const digits = (phone ?? "").replace(/\D/g, "").replace(/^00/, "");
  if (!digits) return null;
  const intl = digits.startsWith("0") ? "971" + digits.slice(1) : digits.length === 9 ? "971" + digits : digits;
  const paid = d.progress.status === "paid";
  const msg = [
    `Hello ${d.invoice.client_name},`,
    paid
      ? `thank you for your payment of AED ${aed(d.progress.paid)}. Your receipt ${d.invoice.invoice_number}:`
      : `here is your invoice ${d.invoice.invoice_number} for AED ${aed(d.invoice.kind === "bill" ? d.progress.due : d.invoice.total_aed)}:`,
    link,
    `— ${d.settings.trade_name || "Seedrix Learning"}`,
  ].join("\n");
  return `https://wa.me/${intl}?text=${encodeURIComponent(msg)}`;
}
