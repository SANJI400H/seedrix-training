import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return { title: t("pricingTitle"), description: t("pricingDescription") };
}

export default async function PricingPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("pricingPage");

  const rows = [
    { cat: t("languages"), vip: t("hourly"), online: t("hourly"), follow: "—" },
    { cat: t("school"), vip: t("hourly"), online: t("hourly"), follow: `${t("monthly")} / ${t("term")}` },
  ];

  return (
    <article className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-bold text-seedrix-green sm:text-4xl">
        {t("title")}
      </h1>
      <p className="mt-4 max-w-3xl leading-relaxed">{t("intro")}</p>

      <div className="mt-10 overflow-x-auto rounded-[12px] border border-seedrix-darkest/10">
        <table className="w-full min-w-[40rem] text-start text-sm">
          <thead className="bg-seedrix-dark-green text-seedrix-white">
            <tr>
              <th className="px-4 py-3 font-bold">{t("colCategory")}</th>
              <th className="px-4 py-3 font-bold">{t("colVip")}</th>
              <th className="px-4 py-3 font-bold">{t("colOnline")}</th>
              <th className="px-4 py-3 font-bold">{t("colFollow")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.cat} className="border-t border-seedrix-darkest/10">
                <td className="px-4 py-3 font-bold">{row.cat}</td>
                <td className="px-4 py-3">{row.vip}</td>
                <td className="px-4 py-3">{row.online}</td>
                <td className="px-4 py-3">{row.follow}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-8 rounded-[12px] border border-seedrix-green/25 bg-seedrix-mint/10 p-6">
        <h2 className="text-lg font-bold text-seedrix-dark-green">
          {t("customTitle")}
        </h2>
        <p className="mt-2 leading-relaxed">{t("customBody")}</p>
      </div>

      <p className="mt-6 text-sm text-seedrix-black/70">{t("vatNote")}</p>

      <section className="mt-12">
        <h2 className="text-xl font-bold text-seedrix-green">
          {t("methodsTitle")}
        </h2>
        <ul className="mt-4 flex flex-wrap gap-2">
          {[t("card"), t("bank"), t("tabby"), t("tamara"), t("payFull")].map(
            (method) => (
              <li
                key={method}
                className="rounded-[8px] border border-seedrix-darkest/15 px-3 py-2 text-sm font-bold"
              >
                {method}
              </li>
            ),
          )}
        </ul>
        <p className="mt-4 font-bold text-seedrix-darkest">{t("noCash")}</p>
      </section>
    </article>
  );
}
