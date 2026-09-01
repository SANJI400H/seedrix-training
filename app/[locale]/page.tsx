import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Faq } from "@/components/marketing/faq";
import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { PricingSnapshot } from "@/components/marketing/pricing-snapshot";
import { ServiceCards } from "@/components/marketing/service-cards";
import { Testimonials } from "@/components/marketing/testimonials";
import { WhoWeAre } from "@/components/marketing/who-we-are";
import { WhySeedrix } from "@/components/marketing/why-seedrix";
import { InquiryForm } from "@/components/forms/inquiry-form";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return { title: t("homeTitle"), description: t("homeDescription") };
}

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <Hero />
      <WhoWeAre />
      <ServiceCards locale={locale} />
      <HowItWorks />
      <PricingSnapshot />
      <WhySeedrix />
      <Testimonials />
      <InquiryForm />
      <Faq />
    </>
  );
}
