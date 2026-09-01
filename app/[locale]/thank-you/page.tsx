import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { whatsappUrl } from "@/lib/site";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return { title: t("thankYouTitle"), description: t("thankYouDescription") };
}

export default async function ThankYouPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("thankYou");
  const message =
    locale === "ar"
      ? "مرحباً، أرسلت استفساراً عبر موقع سيدركس وأرغب في المتابعة."
      : "Hello, I just submitted an inquiry on the Seedrix site and would like to follow up.";

  return (
    <article className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24">
      <h1 className="text-3xl font-bold text-seedrix-green sm:text-4xl">
        {t("title")}
      </h1>
      <p className="mt-4 text-lg font-bold text-seedrix-darkest">
        {t("promise")}
      </p>
      <Button asChild size="lg" className="mt-8">
        <a href={whatsappUrl(message)} target="_blank" rel="noreferrer">
          {t("whatsappCta")}
        </a>
      </Button>
      <section className="mt-12">
        <h2 className="text-xl font-bold text-seedrix-dark-green">
          {t("nextTitle")}
        </h2>
        <ol className="mt-6 space-y-4">
          {[t("next1"), t("next2"), t("next3")].map((step, i) => (
            <li key={step} className="flex gap-4">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-seedrix-green text-sm font-bold text-seedrix-white">
                {i + 1}
              </span>
              <p className="leading-relaxed">{step}</p>
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}
