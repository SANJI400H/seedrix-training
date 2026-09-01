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

const green = rgb(0.059, 0.58, 0.267);
const darkest = rgb(0.02, 0.145, 0.031);

export async function buildInvoicePdf(invoice: InvoiceRecord) {
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

  const lines = [
    `Invoice: ${invoice.invoice_number}`,
    `Date: ${invoice.created_at.slice(0, 10)}`,
    `Client: ${invoice.client_name}`,
    `Mobile: ${invoice.client_mobile}`,
    invoice.client_email ? `Email: ${invoice.client_email}` : null,
    invoice.recruit_name ? `Recruit: ${invoice.recruit_name}` : null,
    `Service: ${invoice.service}`,
    invoice.description ? `Details: ${invoice.description}` : null,
    `Subtotal (AED): ${Number(invoice.amount_aed).toFixed(2)}`,
    `VAT 5% (AED): ${Number(invoice.vat_aed).toFixed(2)}`,
    `Total (AED): ${Number(invoice.total_aed).toFixed(2)}`,
    `Status: ${invoice.status}${invoice.paid_at ? ` · paid ${invoice.paid_at.slice(0, 10)}` : ""}`,
    "Seedrix LLC — License No. 2648158.01, Shams Free Zone, Sharjah, UAE",
    "Seedrix does not accept cash. Payment matched to this invoice.",
  ].filter(Boolean) as string[];

  let y = 740;
  for (const line of lines) {
    const safe = line.replace(/[^\u0000-\u007f]/g, " ");
    page.drawText(safe, { x: 40, y, size: 11, font, color: darkest });
    y -= 22;
  }

  page.drawRectangle({ x: 40, y: y - 4, width: 120, height: 4, color: green });

  return Buffer.from(await doc.save());
}
