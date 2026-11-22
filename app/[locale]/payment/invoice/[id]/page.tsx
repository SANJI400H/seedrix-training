import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { InvoicePay } from "@/components/payment/invoice-pay";
import { getSupabaseAdmin } from "@/lib/supabase";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return { title: t("invoiceTitle"), description: t("paymentDescription") };
}

export default async function InvoicePayPage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("paymentPage");
  const supabase = getSupabaseAdmin();
  if (!supabase) notFound();

  const { data: invoice } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!invoice) notFound();
  // staff-portal invoices (receipts / bills) show what was paid and what is due
  const portal = !!invoice.kind;
  const total = Number(invoice.total_aed);
  const paidAmount = portal ? Number(invoice.amount_paid ?? 0) : invoice.status === "paid" ? total : 0;
  const due = invoice.kind === "receipt" ? 0 : Math.max(0, Math.round((total - paidAmount) * 100) / 100);
  const status: string = invoice.status;
  const statusLabel =
    status === "paid" ? t("statusPaid") : status === "partial" ? t("statusPartial") : status === "cancelled" ? t("statusCancelled") : t("statusUnpaid");
  const studentName = portal && invoice.student_id
    ? ((await supabase.from("students").select("name").eq("id", invoice.student_id).maybeSingle()).data?.name as string | undefined)
    : undefined;

  return (
    <article className="mx-auto max-w-xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-bold text-seedrix-green">{t("payInvoice")}</h1>
      <p className="mt-4 rounded-[8px] bg-seedrix-mint/20 px-4 py-3 text-sm font-bold">
        {t("noCash")}
      </p>
      <p
        className={`mt-6 inline-block rounded-full px-3 py-1 text-sm font-bold ${
          status === "paid" ? "bg-seedrix-green/15 text-seedrix-dark-green" : status === "partial" ? "bg-amber-100 text-amber-800" : status === "cancelled" ? "bg-seedrix-black/10" : "bg-red-100 text-red-700"
        }`}
      >
        {t("invoiceStatus")}: {statusLabel}
      </p>
      <dl className="mt-6 space-y-3 text-sm">
        {studentName ? (
          <div>
            <dt className="font-bold text-seedrix-dark-green">{t("invoiceStudent")}</dt>
            <dd>{studentName}</dd>
          </div>
        ) : null}
        <div>
          <dt className="font-bold text-seedrix-dark-green">{t("invoiceNumber")}</dt>
          <dd>{invoice.invoice_number}</dd>
        </div>
        <div>
          <dt className="font-bold text-seedrix-dark-green">{t("invoiceService")}</dt>
          <dd>
            {invoice.service}
            {invoice.description ? ` — ${invoice.description}` : ""}
          </dd>
        </div>
        <div>
          <dt className="font-bold text-seedrix-dark-green">{t("invoiceAmount")}</dt>
          <dd>AED {total.toFixed(2)}</dd>
        </div>
        {portal ? (
          <>
            <div>
              <dt className="font-bold text-seedrix-dark-green">{t("amountPaid")}</dt>
              <dd>AED {paidAmount.toFixed(2)}</dd>
            </div>
            {invoice.kind === "bill" ? (
              <div>
                <dt className="font-bold text-seedrix-dark-green">{t("amountDue")}</dt>
                <dd className="font-bold">AED {due.toFixed(2)}</dd>
              </div>
            ) : null}
          </>
        ) : null}
        {invoice.recruit_name ? (
          <div>
            <dt className="font-bold text-seedrix-dark-green">
              {t("invoiceRecruit")}
            </dt>
            <dd>{invoice.recruit_name}</dd>
          </div>
        ) : null}
      </dl>
      {portal || status === "paid" ? (
        <a
          href={`/api/payments/invoice-pdf?id=${invoice.id}`}
          className="mt-8 inline-flex h-11 items-center rounded-[8px] border border-seedrix-green px-5 text-sm font-bold text-seedrix-green hover:bg-seedrix-green hover:text-seedrix-white"
        >
          {t("downloadPdf")}
        </a>
      ) : null}
      {status === "paid" ? (
        <p className="mt-6 font-bold text-seedrix-green">{t("alreadyPaid")}</p>
      ) : status === "cancelled" ? null : portal ? (
        // staff-portal invoices are settled by bank transfer and recorded in the ledger by staff
        <p className="mt-6 text-sm">{t("payBalanceBank")}</p>
      ) : (
        <InvoicePay invoiceId={invoice.id} locale={locale} />
      )}
    </article>
  );
}
