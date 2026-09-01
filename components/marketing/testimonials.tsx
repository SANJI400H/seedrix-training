import { getTranslations } from "next-intl/server";
import { SectionHeading } from "./section-heading";

export async function Testimonials() {
  const t = await getTranslations("testimonials");
  const items = [
    { name: t("oneName"), service: t("oneService"), quote: t("oneQuote") },
    { name: t("twoName"), service: t("twoService"), quote: t("twoQuote") },
    { name: t("threeName"), service: t("threeService"), quote: t("threeQuote") },
  ];

  return (
    <section className="bg-seedrix-darkest/[0.025] py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading title={t("title")} />
        <p className="mt-4 inline-block rounded-full bg-seedrix-mint/20 px-3 py-1 text-xs font-bold text-seedrix-dark-green">
          {t("placeholderNote")}
        </p>
        <ul className="mt-10 grid gap-5 md:grid-cols-3">
          {items.map((item) => (
            <li
              key={item.name}
              className="rounded-[12px] border border-seedrix-darkest/10 bg-seedrix-white p-7 shadow-[0_10px_30px_rgba(5,37,8,0.04)]"
            >
              <p className="text-base leading-relaxed text-seedrix-black/85">
                “{item.quote}”
              </p>
              <p className="mt-6 font-bold text-seedrix-darkest">{item.name}</p>
              <p className="mt-1 text-sm text-seedrix-green">{item.service}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
