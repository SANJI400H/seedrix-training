import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { InquiryForm } from "@/components/forms/inquiry-form";
import { HowItWorks } from "@/components/marketing/how-it-works";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return { title: t("registerTitle"), description: t("registerDescription") };
}

export default async function RegisterPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <div className="bg-seedrix-white py-6">
        <HowItWorks />
      </div>
      <InquiryForm />
    </>
  );
}
