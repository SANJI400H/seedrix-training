import { getTranslations } from "next-intl/server";
import { CalendarClock, FileCheck2, ShieldCheck, Wallet } from "lucide-react";
import { SectionHeading } from "./section-heading";

export async function WhySeedrix() {
  const t = await getTranslations("why");
  const items = [
    { icon: ShieldCheck, title: t("vettedTitle"), body: t("vettedBody") },
    { icon: CalendarClock, title: t("flexTitle"), body: t("flexBody") },
    { icon: FileCheck2, title: t("priceTitle"), body: t("priceBody") },
    { icon: Wallet, title: t("payTitle"), body: t("payBody") },
  ];

  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
      <SectionHeading title={t("title")} />
      <ul className="mt-12 grid gap-6 sm:grid-cols-2">
        {items.map((item) => (
          <li
            key={item.title}
            className="flex gap-5 rounded-[12px] border border-seedrix-darkest/10 p-6"
          >
            <div className="flex size-12 shrink-0 items-center justify-center rounded-[8px] bg-seedrix-mint/20">
              <item.icon className="size-6 text-seedrix-green" aria-hidden />
            </div>
            <div>
              <h3 className="text-lg font-bold text-seedrix-darkest">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-seedrix-black/75">
                {item.body}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
