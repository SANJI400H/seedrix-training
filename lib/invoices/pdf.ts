import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { fmtDate } from "@/lib/ledger/dates";
import { STATUS_LABEL } from "@/lib/ledger/invoice";
import { aed } from "@/lib/ledger/money";
import { METHOD_LABEL, type PaymentMethod } from "@/lib/portal/types";
import type { InvoiceDoc } from "./document";

const darkest = rgb(0.02, 0.145, 0.031);
const green = rgb(0.059, 0.58, 0.267);
const mint = rgb(0.27, 0.85, 0.639);
const grey = rgb(0.4, 0.43, 0.42);
const line = rgb(0.85, 0.87, 0.86);
const red = rgb(0.75, 0.1, 0.1);
const amber = rgb(0.75, 0.45, 0);

// Standard PDF fonts only cover Latin; other scripts are replaced so the PDF never fails.
const safe = (s: string | null | undefined) =>
  (s ?? "")
    .replace(/\s+/g, " ")
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[^\u0020-\u007e\u00a0-\u00ff]/g, "?")
    .trim();

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = safe(text).split(" ");
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > width && cur) {
      out.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out.length ? out : [""];
}

/** Client-facing tax-invoice style PDF with the payment clearly shown. */
export async function buildClientInvoicePdf(d: InvoiceDoc): Promise<Buffer> {
  const { invoice: inv, settings: cfg, student, client, progress, vat, course } = d;
  const doc = await PDFDocument.create();
  doc.setTitle(`Invoice ${inv.invoice_number}`);
  doc.setAuthor(cfg.company_name);
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const L = 40;
  const R = 555;
  const text = (p: PDFPage, s: string, x: number, y: number, size = 10, f: PDFFont = font, color = darkest) =>
    p.drawText(safe(s), { x, y, size, font: f, color });
  const right = (s: string, x: number, y: number, size = 10, f: PDFFont = font, color = darkest) =>
    page.drawText(safe(s), { x: x - f.widthOfTextAtSize(safe(s), size), y, size, font: f, color });

  const status = inv.status === "issued" && progress.paid > 0 ? "partial" : inv.status;
  // the date the money arrived (a calendar date, never shifted by time zones)
  const lastPaidOn = d.payments.filter((p) => !p.void).map((p) => p.paid_on).sort().at(-1) ?? null;
  const isTax = vat.rate > 0 && !!cfg.trn;

  // header band
  page.drawRectangle({ x: 0, y: 772, width: 595, height: 70, color: darkest });
  text(page, cfg.trade_name || "Seedrix Learning", L, 808, 18, bold, rgb(1, 1, 1));
  text(page, `${cfg.company_name}`, L, 790, 10, font, mint);
  right(isTax ? "TAX INVOICE" : "INVOICE", R, 808, 16, bold, rgb(1, 1, 1));
  right(inv.invoice_number, R, 790, 11, font, mint);

  // status stamp
  const stamp = (STATUS_LABEL[status] ?? status).toUpperCase();
  const stampColor = status === "paid" ? green : status === "partial" ? amber : status === "cancelled" ? grey : red;
  const sw = bold.widthOfTextAtSize(stamp, 16) + 20;
  page.drawRectangle({ x: R - sw, y: 728, width: sw, height: 28, borderColor: stampColor, borderWidth: 2, color: rgb(1, 1, 1) });
  page.drawText(stamp, { x: R - sw + 10, y: 736, size: 16, font: bold, color: stampColor });

  // company block
  let y = 745;
  const company = [
    `${cfg.company_name}${cfg.trade_name ? ` trading as ${cfg.trade_name}` : ""}`,
    cfg.address,
    cfg.license_no ? `Licence No. ${cfg.license_no}` : "",
    cfg.trn ? `TRN ${cfg.trn}` : "",
    [cfg.company_phone, cfg.company_email].filter(Boolean).join(" · "),
  ].filter(Boolean);
  for (const c of company) {
    for (const ln of wrap(c, font, 9, 300)) {
      text(page, ln, L, y, 9, font, grey);
      y -= 12;
    }
  }

  // meta
  let my = 712;
  const meta: Array<[string, string]> = [
    ["Invoice no.", inv.invoice_number],
    ["Issue date", fmtDate(inv.created_at.slice(0, 10))],
    ...(inv.due_date && status !== "paid" ? ([["Due date", fmtDate(inv.due_date)]] as Array<[string, string]>) : []),
    ...(status === "paid" && lastPaidOn ? ([["Paid on", fmtDate(lastPaidOn)]] as Array<[string, string]>) : []),
  ];
  for (const [k, v] of meta) {
    right(k, 470, my, 9, font, grey);
    right(v, R, my, 9, bold);
    my -= 13;
  }

  // bill to / student
  y = Math.min(y, my) - 14;
  page.drawLine({ start: { x: L, y: y + 6 }, end: { x: R, y: y + 6 }, thickness: 1, color: line });
  y -= 10;
  text(page, "BILL TO", L, y, 8, bold, grey);
  text(page, "STUDENT", 310, y, 8, bold, grey);
  y -= 14;
  const billTo = [inv.client_name, client?.phone ?? (inv.client_mobile !== "-" ? inv.client_mobile : ""), client?.email ?? inv.client_email ?? "", [client?.area, client?.emirate].filter(Boolean).join(", ")].filter(Boolean) as string[];
  const studentLines = [student?.name ?? "", [student?.grade, student?.school].filter(Boolean).join(" · "), student?.course ?? inv.service].filter(Boolean) as string[];
  let by = y;
  billTo.forEach((s, i) => {
    text(page, s, L, by, i ? 9 : 11, i ? font : bold);
    by -= 13;
  });
  let sy = y;
  studentLines.forEach((s, i) => {
    for (const ln of wrap(s, i ? font : bold, i ? 9 : 11, 245)) {
      text(page, ln, 310, sy, i ? 9 : 11, i ? font : bold);
      sy -= 13;
    }
  });
  y = Math.min(by, sy) - 12;

  // line items
  page.drawRectangle({ x: L, y: y - 4, width: R - L, height: 20, color: rgb(0.94, 0.96, 0.95) });
  text(page, "Description", L + 8, y + 2, 9, bold);
  right("Amount (AED)", R - 8, y + 2, 9, bold);
  y -= 22;
  const desc = [inv.service, inv.description].filter(Boolean).join(" — ") || "Tuition";
  for (const ln of wrap(desc, font, 10, 380)) {
    text(page, ln, L + 8, y, 10);
    y -= 13;
  }
  right(aed(vat.rate > 0 ? vat.net : vat.total), R - 8, y + 13, 10);
  y -= 6;
  page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 1, color: line });
  y -= 16;

  const totals: Array<[string, string, boolean?]> = [];
  if (vat.rate > 0) {
    totals.push(["Subtotal (excl. VAT)", aed(vat.net)]);
    totals.push([`VAT ${vat.rate}%`, aed(vat.vat)]);
  }
  totals.push(["Invoice total", `AED ${aed(vat.total)}`, true]);
  totals.push(["Amount paid", `AED ${aed(progress.paid)}`]);
  totals.push([inv.kind === "receipt" ? "Balance on this invoice" : "Balance due", `AED ${aed(inv.kind === "receipt" ? 0 : progress.due)}`, true]);
  for (const [k, v, b] of totals) {
    right(k, 440, y, 10, b ? bold : font, b ? darkest : grey);
    right(v, R - 8, y, 10, b ? bold : font);
    y -= 15;
  }
  if (d.amended) {
    text(page, `Note: the payment was later corrected to AED ${aed(progress.paid)}.`, L, y, 9, font, red);
    y -= 14;
  }

  // payments received
  y -= 8;
  text(page, "PAYMENT RECEIVED", L, y, 8, bold, grey);
  y -= 14;
  const live = d.payments.filter((p) => !p.void);
  if (live.length) {
    for (const p of live) {
      const m = METHOD_LABEL[p.method as PaymentMethod] ?? p.method;
      text(page, `${fmtDate(p.paid_on)} · ${m}${p.bank_ref ? ` · ref ${p.bank_ref}` : ""}${p.payer_name ? ` · from ${p.payer_name}` : ""}`, L, y, 9);
      right(`AED ${aed(p.amount)}`, R - 8, y, 9, bold);
      y -= 13;
    }
  } else {
    text(page, "No payment received yet.", L, y, 9, font, grey);
    y -= 13;
  }

  // course position
  if (course && course.agreedFee > 0) {
    y -= 10;
    text(page, "COURSE ACCOUNT", L, y, 8, bold, grey);
    y -= 14;
    for (const [k, v] of [
      ["Agreed course fee", course.agreedFee],
      ["Total paid to date", course.paidToDate],
      ["Balance remaining on the course", course.balance],
    ] as Array<[string, number]>) {
      text(page, k, L, y, 9);
      right(`AED ${aed(v)}`, R - 8, y, 9, k.startsWith("Balance") ? bold : font);
      y -= 13;
    }
  }

  // how to pay
  if ((inv.kind !== "receipt" && progress.due > 0) || (course && course.balance > 0)) {
    y -= 10;
    page.drawRectangle({ x: L, y: y - 40, width: R - L, height: 52, color: rgb(0.94, 0.98, 0.96) });
    text(page, "How to pay the balance", L + 10, y - 2, 9, bold);
    text(page, `Bank transfer to ${cfg.company_name}${cfg.bank_name ? ` · ${cfg.bank_name}` : ""}`, L + 10, y - 16, 9);
    text(page, cfg.iban ? `IBAN ${cfg.iban} · please quote ${inv.invoice_number}` : `Please quote ${inv.invoice_number} with your payment.`, L + 10, y - 29, 9);
    y -= 56;
  }

  // footer
  const foot = [
    isTax ? "This is a tax invoice." : "Seedrix is not VAT registered; no VAT has been charged.",
    cfg.invoice_footer,
    "Thank you for learning with Seedrix.",
  ].filter(Boolean);
  let fy = 60;
  for (const f of foot) {
    for (const ln of wrap(f, font, 8, R - L)) {
      text(page, ln, L, fy, 8, font, grey);
      fy -= 11;
    }
  }
  page.drawRectangle({ x: L, y: 72, width: 120, height: 3, color: green });

  return Buffer.from(await doc.save());
}
