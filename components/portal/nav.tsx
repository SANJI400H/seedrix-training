"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string };

export function PortalNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Sections" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
      {items.map((it) => {
        const active = it.href === "/admin" ? pathname === "/admin" : pathname.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-[6px] px-3 py-2 text-sm font-bold",
              active ? "bg-seedrix-green/10 text-seedrix-dark-green" : "text-seedrix-black/60 hover:text-seedrix-darkest",
            )}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
