import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SectionHeading } from "./section-heading";

export async function PricingSnapshot() {
  const t = await getTranslations("pricingSnapshot");
  const cards = [
    { title: t("vipTitle"), rate: t("vipRate") },
    { title: t("onlineTitle"), rate: t("onlineRate") },
    { title: t("followTitle"), rate: t("followRate") },
  ];

  return (
    <section className="bg-seedrix-darkest/[0.025] py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading title={t("title")} />
        <ul className="mt-12 grid gap-5 md:grid-cols-3">
          {cards.map((card) => (
            <li
              key={card.title}
              className="flex flex-col overflow-hidden rounded-[12px] bg-seedrix-white shadow-[0_10px_30px_rgba(5,37,8,0.05)] ring-1 ring-seedrix-darkest/10 transition-transform duration-300 hover:-translate-y-1"
            >
              <div className="bg-seedrix-dark-green px-5 py-4">
                <h3 className="font-bold text-seedrix-white">{card.title}</h3>
              </div>
              <div className="flex flex-1 flex-col p-6">
                <p className="text-2xl font-bold text-seedrix-darkest">
                  {card.rate}
                </p>
                <Link
                  href="/pricing"
                  className="mt-5 text-sm font-bold text-seedrix-green hover:text-seedrix-dark-green"
                >
                  {t("seeFull")}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
