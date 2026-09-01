import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { InquiryForm } from "@/components/forms/inquiry-form";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import {
  CREDENTIAL_VERIFIED_SLUGS,
  FORM_SERVICE_BY_SLUG,
  SERVICE_SLUGS,
  type ServiceSlug,
} from "@/lib/services";

type Props = { params: Promise<{ locale: string; slug: string }> };

export function generateStaticParams() {
  return SERVICE_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!SERVICE_SLUGS.includes(slug as ServiceSlug)) return {};
  const t = await getTranslations({ locale, namespace: "serviceDetail" });
  return {
    title: `${t(`${slug}.title`)} — Seedrix Training`,
    description: t(`${slug}.covers`),
  };
}

export default async function ServiceDetailPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  if (!SERVICE_SLUGS.includes(slug as ServiceSlug)) notFound();

  const t = await getTranslations("serviceDetail");
  const service = slug as ServiceSlug;
  const formService = FORM_SERVICE_BY_SLUG[service];
  const showCredentialNote = CREDENTIAL_VERIFIED_SLUGS.includes(service);

  return (
    <>
      <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <h1 className="text-3xl font-bold text-seedrix-green sm:text-4xl">
          {t(`${service}.title`)}
        </h1>
        <section className="mt-10">
          <h2 className="text-xl font-bold text-seedrix-dark-green">
            {t("covers")}
          </h2>
          <p className="mt-3 leading-relaxed">{t(`${service}.covers`)}</p>
        </section>
        <section className="mt-8">
          <h2 className="text-xl font-bold text-seedrix-dark-green">
            {t("who")}
          </h2>
          <p className="mt-3 leading-relaxed">{t(`${service}.who`)}</p>
        </section>
        <section className="mt-8">
          <h2 className="text-xl font-bold text-seedrix-dark-green">
            {t("delivery")}
          </h2>
          <p className="mt-3 leading-relaxed">{t("deliveryBody")}</p>
        </section>
        {showCredentialNote ? (
          <p className="mt-8 rounded-[12px] border border-seedrix-green/30 bg-seedrix-mint/15 p-4 text-sm font-bold leading-relaxed text-seedrix-darkest">
            {t("credentialNote")}
          </p>
        ) : null}
        <Button asChild size="lg" className="mt-10">
          <Link href="/register">{t("registerCta")}</Link>
        </Button>
      </article>
      <InquiryForm defaultService={formService} />
    </>
  );
}
