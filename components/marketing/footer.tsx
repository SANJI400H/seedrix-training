import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { site, whatsappUrl } from "@/lib/site";
import { Logo } from "./logo";

export async function Footer() {
  const t = await getTranslations("footer");
  const tn = await getTranslations("nav");

  const links = [
    { href: "/services" as const, label: tn("services") },
    { href: "/pricing" as const, label: tn("pricing") },
    { href: "/about" as const, label: tn("about") },
    { href: "/contact" as const, label: tn("contact") },
    { href: "/register" as const, label: t("register") },
    { href: "/payment" as const, label: t("payment") },
  ];

  return (
    <footer className="bg-seedrix-darkest text-seedrix-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Logo variant="white" />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-seedrix-white/80">
            {t("tagline")}
          </p>
        </div>
        <div>
          <h2 className="text-sm font-bold text-seedrix-mint">{t("quickLinks")}</h2>
          <ul className="mt-4 space-y-2">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-sm text-seedrix-white/85 hover:text-seedrix-mint"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-bold text-seedrix-mint">{t("contact")}</h2>
          <ul className="mt-4 space-y-2 text-sm">
            <li>
              <a
                href={`tel:${site.phoneTel}`}
                className="hover:text-seedrix-mint"
              >
                {t("phone")}: {site.phoneDisplay}
              </a>
            </li>
            <li>
              <a
                href={whatsappUrl()}
                className="hover:text-seedrix-mint"
                target="_blank"
                rel="noreferrer"
              >
                {t("whatsapp")}
              </a>
            </li>
            <li>
              <a
                href={`mailto:${site.email}`}
                className="hover:text-seedrix-mint"
              >
                {site.email}
              </a>
            </li>
            <li className="pt-2">
              <Link href="/terms" className="hover:text-seedrix-mint">
                {t("terms")}
              </Link>
              <span className="mx-2 text-seedrix-white/40">·</span>
              <Link href="/privacy" className="hover:text-seedrix-mint">
                {t("privacy")}
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-bold text-seedrix-mint">
            {t("otherBusinesses")}
          </h2>
          <ul className="mt-4 space-y-2">
            <li>
              <a
                href="https://seedrix.co"
                className="text-sm text-seedrix-white/85 hover:text-seedrix-mint"
                target="_blank"
                rel="noreferrer"
              >
                {t("seedrixCo")}
              </a>
            </li>
          </ul>
        </div>
      </div>
      <p className="mx-auto max-w-6xl px-4 pb-4 text-[10px] leading-none text-seedrix-white/15 sm:px-6">
        {t("license")}
      </p>
    </footer>
  );
}
