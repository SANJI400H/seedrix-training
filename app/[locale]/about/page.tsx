import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return { title: t("aboutTitle"), description: t("aboutDescription") };
}

export default async function AboutPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("aboutPage");

  return (
    <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-bold text-seedrix-green sm:text-4xl">
        {t("title")}
      </h1>
      <section className="mt-10">
        <h2 className="text-xl font-bold text-seedrix-dark-green">
          {t("missionTitle")}
        </h2>
        <p className="mt-3 leading-relaxed">{t("mission")}</p>
      </section>
      <section className="mt-8">
        <h2 className="text-xl font-bold text-seedrix-dark-green">
          {t("backgroundTitle")}
        </h2>
        <p className="mt-3 leading-relaxed">{t("background")}</p>
      </section>
      <section className="mt-8">
        <h2 className="text-xl font-bold text-seedrix-dark-green">
          {t("vettingTitle")}
        </h2>
        <p className="mt-3 leading-relaxed">{t("vetting")}</p>
      </section>
    </article>
  );
}
