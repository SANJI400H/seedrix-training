import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { site } from "@/lib/site";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return { title: t("privacyTitle"), description: t("privacyDescription") };
}

export default async function PrivacyPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("privacyPage");

  const sections = [
    "who",
    "what",
    "why",
    "how",
    "share",
    "rights",
    "minors",
    "cookies",
  ] as const;

  return (
    <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-bold text-seedrix-green sm:text-4xl">
        {t("title")}
      </h1>
      <p className="mt-2 text-sm text-seedrix-black/60">{t("updated")}</p>
      <p className="mt-4 leading-relaxed">{t("intro")}</p>
      {sections.map((key) => (
        <section key={key} className="mt-8">
          <h2 className="text-lg font-bold text-seedrix-dark-green">
            {t(`${key}Title`)}
          </h2>
          <p className="mt-2 leading-relaxed">
            {t(`${key}`, { email: site.email, phone: site.phoneDisplay })}
          </p>
        </section>
      ))}
    </article>
  );
}
