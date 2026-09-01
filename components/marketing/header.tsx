"use client";

import { Menu, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "./language-switcher";
import { Logo } from "./logo";

const LINKS = [
  { href: "/services" as const, key: "services" },
  { href: "/pricing" as const, key: "pricing" },
  { href: "/about" as const, key: "about" },
  { href: "/contact" as const, key: "contact" },
];

export function Header() {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-seedrix-white/10 bg-seedrix-darkest/80 backdrop-blur-xl">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-3 focus:z-50 focus:rounded-[8px] focus:bg-seedrix-green focus:px-3 focus:py-2 focus:text-sm focus:font-bold focus:text-seedrix-white"
      >
        {t("skip")}
      </a>
      <div className="mx-auto flex h-[4.5rem] max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link
          href="/"
          className="shrink-0 p-1"
          aria-label="Seedrix Training"
          onClick={() => setOpen(false)}
        >
          <Logo variant="white" priority />
        </Link>

        <nav
          className="hidden flex-1 items-center justify-center gap-8 lg:flex"
          aria-label="Primary"
        >
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-bold text-seedrix-white/90 transition-colors hover:text-seedrix-mint"
            >
              {t(link.key)}
            </Link>
          ))}
        </nav>

        <div className="ms-auto flex items-center gap-2">
          <Button asChild size="sm" className="hidden min-w-[8.5rem] sm:inline-flex">
            <Link href="/register">{t("register")}</Link>
          </Button>
          <LanguageSwitcher />
          <button
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-[8px] text-seedrix-white lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-6" /> : <Menu className="size-6" />}
            <span className="sr-only">Menu</span>
          </button>
        </div>
      </div>

      {open ? (
        <div
          id="mobile-nav"
          className="border-t border-seedrix-white/10 bg-seedrix-darkest/95 px-4 py-4 backdrop-blur-xl lg:hidden"
        >
          <nav className="flex flex-col gap-1" aria-label="Mobile">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-[8px] px-3 py-3 text-base font-bold text-seedrix-white hover:bg-seedrix-white/5 hover:text-seedrix-mint"
              >
                {t(link.key)}
              </Link>
            ))}
            <Button asChild className="mt-2">
              <Link href="/register" onClick={() => setOpen(false)}>
                {t("register")}
              </Link>
            </Button>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
