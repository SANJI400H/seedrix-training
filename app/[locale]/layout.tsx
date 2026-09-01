import type { Metadata } from "next";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Analytics } from "@vercel/analytics/react";
import { routing } from "@/i18n/routing";
import { notoSansArabic, sansation } from "@/lib/fonts";
import { Header } from "@/components/marketing/header";
import { Footer } from "@/components/marketing/footer";
import { WhatsAppFloat } from "@/components/marketing/whatsapp-float";
import { site } from "@/lib/site";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    title: t("homeTitle"),
    description: t("homeDescription"),
    openGraph: {
      title: t("homeTitle"),
      description: t("homeDescription"),
      locale: locale === "ar" ? "ar_AE" : "en_AE",
      type: "website",
      siteName: site.name,
    },
    alternates: {
      languages: {
        en: "/en",
        ar: "/ar",
      },
    },
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();
  const dir = locale === "ar" ? "rtl" : "ltr";

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${sansation.variable} ${notoSansArabic.variable}`}
    >
      <body className="min-h-screen bg-seedrix-white text-seedrix-black antialiased">
        <NextIntlClientProvider messages={messages}>
          <Header />
          <main id="content">{children}</main>
          <Footer />
          <WhatsAppFloat />
        </NextIntlClientProvider>
        <Analytics />
      </body>
    </html>
  );
}
