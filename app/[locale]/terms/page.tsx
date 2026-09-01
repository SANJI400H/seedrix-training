import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return { title: t("termsTitle"), description: t("termsDescription") };
}

export default async function TermsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("termsPage");
  const clauses = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;

  return (
    <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-bold text-seedrix-green sm:text-4xl">
        {t("title")}
      </h1>
      <p className="mt-4 leading-relaxed">{t("intro")}</p>
      <ol className="mt-10 space-y-8">
        {clauses.map((n) => (
          <li key={n}>
            <h2 className="text-lg font-bold text-seedrix-dark-green">
              {t(`c${n}Title`)}
            </h2>
            <p className="mt-2 leading-relaxed">{t(`c${n}`)}</p>
          </li>
        ))}
      </ol>
    </article>
  );
}
