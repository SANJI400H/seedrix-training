import { getTranslations } from "next-intl/server";
import { BadgeCheck, Globe, Home } from "lucide-react";
import { SectionHeading } from "./section-heading";

export async function WhoWeAre() {
  const t = await getTranslations("who");

  const badges = [
    { icon: Globe, text: t("badgeEmirates") },
    { icon: Home, text: t("badgeDelivery") },
    { icon: BadgeCheck, text: t("badgePayment") },
  ];

  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
      <SectionHeading title={t("title")} />
      <p className="mt-6 max-w-3xl text-lg leading-relaxed text-seedrix-black/85">
        {t("body")}
      </p>
      <ul className="mt-10 grid gap-4 sm:grid-cols-3">
        {badges.map((badge) => (
          <li
            key={badge.text}
            className="flex items-start gap-3 rounded-[12px] border border-seedrix-darkest/10 bg-seedrix-white p-5 shadow-[0_10px_30px_rgba(5,37,8,0.04)]"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-[8px] bg-seedrix-mint/20">
              <badge.icon className="size-5 text-seedrix-green" aria-hidden />
            </span>
            <span className="pt-1.5 text-sm font-bold leading-snug text-seedrix-darkest">
              {badge.text}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
