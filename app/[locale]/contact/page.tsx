import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { InquiryForm } from "@/components/forms/inquiry-form";
import { site, whatsappUrl } from "@/lib/site";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return { title: t("contactTitle"), description: t("contactDescription") };
}

export default async function ContactPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("contactPage");

  const channels = [
    { href: `tel:${site.phoneTel}`, label: t("call"), value: site.phoneDisplay },
    { href: whatsappUrl(), label: t("whatsapp"), value: site.phoneDisplay, external: true },
    { href: `mailto:${site.email}`, label: t("email"), value: site.email },
  ];

  return (
    <>
      <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <h1 className="text-3xl font-bold text-seedrix-green sm:text-4xl">
          {t("title")}
        </h1>
        <p className="mt-4 leading-relaxed">{t("intro")}</p>
        <ul className="mt-8 grid gap-4 sm:grid-cols-3">
          {channels.map((ch) => (
            <li key={ch.label}>
              <a
                href={ch.href}
                className="block rounded-[12px] border border-seedrix-darkest/10 p-4 hover:border-seedrix-green"
                target={ch.external ? "_blank" : undefined}
                rel={ch.external ? "noreferrer" : undefined}
              >
                <p className="text-sm font-bold text-seedrix-green">{ch.label}</p>
                <p className="mt-2 text-sm">{ch.value}</p>
              </a>
            </li>
          ))}
        </ul>
      </article>
      <InquiryForm condensed />
    </>
  );
}
