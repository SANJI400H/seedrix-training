import { getTranslations } from "next-intl/server";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { OFFER_CARDS } from "@/lib/services";
import { SectionHeading } from "./section-heading";

export async function ServiceCards({ locale }: { locale: string }) {
  const t = await getTranslations("offer");
  const Arrow = locale === "ar" ? ArrowLeft : ArrowRight;

  return (
    <section className="bg-seedrix-darkest/[0.025] py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading title={t("title")} />
        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {OFFER_CARDS.map((card) => (
            <li key={card.slug}>
              <Link
                href={`/services/${card.slug}`}
                className="group flex h-full flex-col rounded-[12px] border border-seedrix-darkest/10 bg-seedrix-white p-7 shadow-[0_10px_30px_rgba(5,37,8,0.04)] transition-all duration-300 hover:-translate-y-1 hover:border-seedrix-green/40 hover:shadow-[0_18px_40px_rgba(5,37,8,0.08)]"
              >
                <h3 className="text-xl font-bold text-seedrix-dark-green">
                  {t(card.titleKey)}
                </h3>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-seedrix-black/75">
                  {t(card.bodyKey)}
                </p>
                <span className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-seedrix-green">
                  {t("learnMore")}
                  <Arrow className="size-4 transition-transform duration-300 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
