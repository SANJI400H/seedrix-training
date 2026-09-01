"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("nav");
  const next = locale === "en" ? "ar" : "en";

  return (
    <button
      type="button"
      onClick={() => router.replace(pathname, { locale: next })}
      className="rounded-[8px] px-3 py-2 text-sm font-bold text-seedrix-white transition-colors hover:text-seedrix-mint"
      aria-label={t("switchLabel")}
    >
      {t("switchTo")}
    </button>
  );
}
