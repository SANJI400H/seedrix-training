import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type InvoiceRecord = {
  invoice_number: string;
  locale: string;
  service: string;
  description: string | null;
  amount_aed: number;
  vat_aed: number;
  total_aed: number;
  client_name: string;
  client_mobile: string;
  client_email: string | null;
  recruit_name: string | null;
  status: string;
  paid_at: string | null;
  created_at: string;
};

/**
 * Optional extras used by the staff portal (client payment receipts).
 * The public site calls buildInvoicePdf(invoice) and is unaffected.
 */
export type InvoicePdfOptions = {
  /** Label for recruit_name (default "Recruit"). */
  recruitLabel?: string;
  /** Extra lines after the client block, e.g. student name. */
  extraLines?: string[];
  /** Summary rows shown under the totals, e.g. agreed fee / paid to date / balance. */
  summary?: Array<[string, string]>;
  /** Replaces the default legal footer lines. */
  footer?: string[];
  /** Red notice at the top (e.g. VOID or amended). */
  notice?: string;
};

const green = rgb(0.059, 0.58, 0.267);
const darkest = rgb(0.02, 0.145, 0.031);
const red = rgb(0.75, 0.1, 0.1);

const ascii = (s: string) => s.replace(/[^\u0000-\u007f]/g, " ");

export async function buildInvoicePdf(invoice: InvoiceRecord, opts: InvoicePdfOptions = {}) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ar = invoice.locale === "ar";

  page.drawRectangle({ x: 0, y: 780, width: 595, height: 62, color: darkest });
  page.drawText("SEEDRIX TRAINING", {
    x: 40,
    y: 804,
    size: 16,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawText(ar ? "Official Invoice" : "Official Invoice", {
    x: 40,
    y: 786,
    size: 10,
    font,
    color: rgb(0.27, 0.85, 0.639),
  });

  let y = 740;
  if (opts.notice) {
    page.drawText(ascii(opts.notice), { x: 40, y, size: 12, font: bold, color: red });
    y -= 24;
  }

  const lines = [
    `Invoice: ${invoice.invoice_number}`,
    `Date: ${invoice.created_at.slice(0, 10)}`,
    `Client: ${invoice.client_name}`,
    `Mobile: ${invoice.client_mobile}`,
    invoice.client_email ? `Email: ${invoice.client_email}` : null,
    ...(opts.extraLines ?? []),
    invoice.recruit_name ? `${opts.recruitLabel ?? "Recruit"}: ${invoice.recruit_name}` : null,
    `Service: ${invoice.service}`,
    invoice.description ? `Details: ${invoice.description}` : null,
    `Subtotal (AED): ${Number(invoice.amount_aed).toFixed(2)}`,
    `VAT 5% (AED): ${Number(invoice.vat_aed).toFixed(2)}`,
    `Total (AED): ${Number(invoice.total_aed).toFixed(2)}`,
    `Status: ${invoice.status}${invoice.paid_at ? ` · paid ${invoice.paid_at.slice(0, 10)}` : ""}`,
    // default legal footer (public site) — unchanged layout when no options are passed
    ...(opts.footer || opts.summary
      ? []
      : [
          "Seedrix LLC — License No. 2648158.01, Shams Free Zone, Sharjah, UAE",
          "Seedrix does not accept cash. Payment matched to this invoice.",
        ]),
  ].filter(Boolean) as string[];

  for (const line of lines) {
    page.drawText(ascii(line), { x: 40, y, size: 11, font, color: darkest });
    y -= 22;
  }

  if (opts.summary?.length) {
    y -= 6;
    page.drawRectangle({ x: 40, y: y + 14, width: 515, height: 1, color: rgb(0.85, 0.87, 0.86) });
    y -= 6;
    for (const [label, value] of opts.summary) {
      page.drawText(ascii(label), { x: 300, y, size: 11, font, color: darkest });
      const v = ascii(value);
      page.drawText(v, { x: 555 - bold.widthOfTextAtSize(v, 11), y, size: 11, font: bold, color: darkest });
      y -= 20;
    }
    y -= 8;
  }

  for (const line of opts.footer ?? []) {
    page.drawText(ascii(line), { x: 40, y, size: 10, font, color: darkest });
    y -= 18;
  }

  page.drawRectangle({ x: 40, y: y - 4, width: 120, height: 4, color: green });

  return Buffer.from(await doc.save());
}
