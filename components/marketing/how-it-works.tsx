import { getTranslations } from "next-intl/server";
import { SectionHeading } from "./section-heading";

export async function HowItWorks() {
  const t = await getTranslations("how");
  const steps = [
    { title: t("step1Title"), body: t("step1Body") },
    { title: t("step2Title"), body: t("step2Body") },
    { title: t("step3Title"), body: t("step3Body") },
    { title: t("step4Title"), body: t("step4Body") },
  ];

  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
      <SectionHeading title={t("title")} />
      <ol className="mt-12 flex flex-col gap-5 md:flex-row md:gap-5">
        {steps.map((step, index) => (
          <li
            key={step.title}
            className="relative flex flex-1 gap-4 rounded-[12px] border border-seedrix-darkest/10 bg-seedrix-white p-6 shadow-[0_10px_30px_rgba(5,37,8,0.04)] md:flex-col"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-[8px] bg-seedrix-green text-sm font-bold text-seedrix-white">
              {index + 1}
            </span>
            <div>
              <h3 className="font-bold text-seedrix-darkest">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-seedrix-black/75">
                {step.body}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
