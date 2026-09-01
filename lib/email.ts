import "server-only";
import { Resend } from "resend";
import { site } from "./site";
import { composeMobile, type InquiryInput } from "./validation";

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

function fromAddress() {
  return process.env.RESEND_FROM ?? `Seedrix Training <${site.email}>`;
}

export async function notifyInquiry(input: InquiryInput) {
  const resend = getResend();
  const mobile = composeMobile(input.countryCode, input.nationalNumber);
  const team = process.env.SEEDRIX_TEAM_EMAIL ?? site.email;
  const isAr = input.locale === "ar";

  const clientSubject = isAr
    ? "استلمنا طلبك — سيتواصل معك أحد مستشاري سيدركس خلال 10 دقائق"
    : "We have your request — a Seedrix consultant will contact you within 10 minutes";

  const clientBody = isAr
    ? `<p>مرحباً ${escapeHtml(input.fullName)}،</p>
       <p><strong>سيتواصل معك أحد مستشاري سيدركس خلال 10 دقائق.</strong></p>
       <p>إذا كنت تفضّل واتساب الآن: <a href="https://wa.me/${site.whatsapp}">واتساب</a></p>`
    : `<p>Hello ${escapeHtml(input.fullName)},</p>
       <p><strong>A Seedrix consultant will contact you within 10 minutes.</strong></p>
       <p>Prefer WhatsApp now? <a href="https://wa.me/${site.whatsapp}">Message us</a></p>`;

  const teamHtml = `
    <h2>New Seedrix inquiry</h2>
    <ul>
      <li>Name: ${escapeHtml(input.fullName)}</li>
      <li>Mobile: ${escapeHtml(mobile)}</li>
      <li>Email: ${escapeHtml(input.email)}</li>
      <li>Service: ${escapeHtml(input.service)}</li>
      <li>Emirate: ${escapeHtml(input.emirate)}</li>
      <li>Delivery: ${escapeHtml(input.deliveryMode)}</li>
      <li>Locale: ${escapeHtml(input.locale)}</li>
    </ul>
  `;

  if (!resend) {
    console.info("[email:dev] inquiry", { mobile, email: input.email, locale: input.locale });
    return;
  }

  await Promise.all([
    resend.emails.send({
      from: fromAddress(),
      to: team,
      subject: `New inquiry — ${input.fullName} (${input.service})`,
      html: teamHtml,
    }),
    resend.emails.send({
      from: fromAddress(),
      to: input.email,
      subject: clientSubject,
      html: wrapEmail(clientBody, isAr),
    }),
  ]);
}

export async function sendPaymentConfirmation(opts: {
  to: string;
  locale: "en" | "ar";
  invoiceNumber: string;
  totalAed: string;
  pdf?: Buffer;
}) {
  const resend = getResend();
  const isAr = opts.locale === "ar";
  const subject = isAr
    ? `فاتورة سيدركس ${opts.invoiceNumber} — تم استلام الدفع`
    : `Seedrix invoice ${opts.invoiceNumber} — payment received`;
  const body = isAr
    ? `<p>تم استلام دفعك. رقم الفاتورة <strong>${escapeHtml(opts.invoiceNumber)}</strong>. المبلغ ${escapeHtml(opts.totalAed)} درهم.</p>`
    : `<p>Your payment was received. Invoice <strong>${escapeHtml(opts.invoiceNumber)}</strong>. Amount AED ${escapeHtml(opts.totalAed)}.</p>`;

  if (!resend) {
    console.info("[email:dev] payment", opts.invoiceNumber);
    return;
  }

  await resend.emails.send({
    from: fromAddress(),
    to: opts.to,
    subject,
    html: wrapEmail(body, isAr),
    attachments: opts.pdf
      ? [{ filename: `${opts.invoiceNumber}.pdf`, content: opts.pdf }]
      : undefined,
  });
}

export async function notifyRecruitPaid(opts: {
  recruitEmail?: string | null;
  invoiceNumber: string;
  clientName: string;
}) {
  const resend = getResend();
  const team = opts.recruitEmail || process.env.SEEDRIX_TEAM_EMAIL || site.email;
  if (!resend) return;
  await resend.emails.send({
    from: fromAddress(),
    to: team,
    subject: `Invoice ${opts.invoiceNumber} paid — ${opts.clientName}`,
    html: `<p>Invoice ${escapeHtml(opts.invoiceNumber)} for ${escapeHtml(opts.clientName)} is marked paid.</p>`,
  });
}

function wrapEmail(inner: string, rtl: boolean) {
  return `<div style="font-family:sans-serif;line-height:1.6;color:#000;${rtl ? "direction:rtl;text-align:right;" : ""}">${inner}</div>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
