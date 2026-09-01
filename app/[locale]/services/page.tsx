import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ServiceCards } from "@/components/marketing/service-cards";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return { title: t("servicesTitle"), description: t("servicesDescription") };
}

export default async function ServicesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("servicesPage");

  return (
    <div className="pb-8 pt-12">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h1 className="text-3xl font-bold text-seedrix-green sm:text-4xl">
          {t("title")}
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed">{t("intro")}</p>
      </div>
      <ServiceCards locale={locale} />
    </div>
  );
}
