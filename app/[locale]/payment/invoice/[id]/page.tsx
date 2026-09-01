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
    .select(
      "id, invoice_number, service, description, total_aed, status, recruit_name, client_name",
    )
    .eq("id", id)
    .maybeSingle();

  if (!invoice) notFound();

  return (
    <article className="mx-auto max-w-xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-bold text-seedrix-green">{t("payInvoice")}</h1>
      <p className="mt-4 rounded-[8px] bg-seedrix-mint/20 px-4 py-3 text-sm font-bold">
        {t("noCash")}
      </p>
      <dl className="mt-8 space-y-3 text-sm">
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
          <dd>AED {Number(invoice.total_aed).toFixed(2)}</dd>
        </div>
        {invoice.recruit_name ? (
          <div>
            <dt className="font-bold text-seedrix-dark-green">
              {t("invoiceRecruit")}
            </dt>
            <dd>{invoice.recruit_name}</dd>
          </div>
        ) : null}
      </dl>
      {invoice.status === "paid" ? (
        <p className="mt-8 font-bold text-seedrix-green">{t("alreadyPaid")}</p>
      ) : (
        <InvoicePay invoiceId={invoice.id} locale={locale} />
      )}
    </article>
  );
}
