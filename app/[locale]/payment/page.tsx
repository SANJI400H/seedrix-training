import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PaymentPanel } from "@/components/payment/payment-panel";
import { packagePriceAed } from "@/lib/packages";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return { title: t("paymentTitle"), description: t("paymentDescription") };
}

export default async function PaymentPage({
  params,
  searchParams,
}: Props & { searchParams: Promise<{ paid?: string; invoice?: string }> }) {
  const { locale } = await params;
  const query = await searchParams;
  setRequestLocale(locale);
  return (
    <PaymentPanel
      locale={locale}
      price10={packagePriceAed("online-10")}
      price20={packagePriceAed("online-20")}
      paidInvoiceId={query.paid === "1" ? query.invoice : undefined}
    />
  );
}
