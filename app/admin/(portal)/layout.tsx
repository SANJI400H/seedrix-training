import Link from "next/link";
import { Logo } from "@/components/marketing/logo";
import { PortalNav, type NavItem } from "@/components/portal/nav";
import { isManager, requireStaff } from "@/lib/portal/auth";
import { signOut } from "../login/actions";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { me } = await requireStaff();
  const manager = isManager(me.role);
  const items: NavItem[] = manager
    ? [
        { href: "/admin", label: "Dashboard" },
        { href: "/admin/leads", label: "Leads" },
        { href: "/admin/clients", label: "Clients" },
        { href: "/admin/students", label: "Students" },
        { href: "/admin/payments", label: "Payments in" },
        { href: "/admin/invoices", label: "Invoices" },
        { href: "/admin/payouts", label: "Payouts" },
        { href: "/admin/bank", label: "Bank" },
        { href: "/admin/teachers", label: "Teachers" },
        { href: "/admin/reports", label: "Reports" },
        { href: "/admin/activity", label: "Activity log" },
        { href: "/admin/settings", label: "Settings" },
      ]
    : [
        { href: "/admin", label: "Dashboard" },
        { href: "/admin/leads", label: "My leads" },
        { href: "/admin/clients", label: "My clients" },
        { href: "/admin/students", label: "Students" },
        { href: "/admin/payments", label: "Payments in" },
        { href: "/admin/invoices", label: "Invoices" },
        { href: "/admin/payouts", label: "My commission" },
        { href: "/admin/teachers", label: "Teachers" },
        { href: "/admin/performance", label: "My performance" },
        { href: "/admin/activity", label: "My activity" },
        { href: "/admin/account", label: "Account" },
      ];
  return (
    <>
      <header className="sticky top-0 z-20 bg-seedrix-darkest text-seedrix-white">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex items-center gap-3 py-3">
            <Link href="/admin" className="flex min-w-0 items-center gap-2">
              <Logo variant="white" className="h-6 sm:h-7" />
              <span className="hidden text-xs font-bold uppercase tracking-wider text-seedrix-mint sm:inline">Staff</span>
            </Link>
            <div className="ms-auto flex items-center gap-3 text-sm">
              <Link href="/admin/account" className="max-w-[40vw] truncate text-seedrix-white/80 hover:text-seedrix-white">
                {me.staff.full_name}
                <span className="ms-1 text-xs text-seedrix-white/50">· {me.role}</span>
              </Link>
              <form action={signOut}>
                <button type="submit" className="text-sm font-bold text-seedrix-mint hover:underline">
                  Sign out
                </button>
              </form>
            </div>
          </div>
          <PortalNav items={items} />
        </div>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-5 px-4 pb-16 pt-5">{children}</main>
    </>
  );
}
