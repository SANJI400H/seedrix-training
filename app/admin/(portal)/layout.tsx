import Image from "next/image";
import Link from "next/link";
import { PortalNav, type NavItem } from "@/components/portal/nav";
import { isManager, requireStaff } from "@/lib/portal/auth";
import { signOut } from "../login/actions";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { me } = await requireStaff();
  const items: NavItem[] = [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/leads", label: "Leads" },
    { href: "/admin/students", label: "Students" },
    { href: "/admin/payments", label: "Payments in" },
    { href: "/admin/payouts", label: "Payouts" },
    ...(isManager(me.role) ? [{ href: "/admin/bank", label: "Bank" }] : []),
    { href: "/admin/reports", label: "Reports" },
    { href: "/admin/activity", label: "Activity log" },
    { href: "/admin/settings", label: "Settings" },
  ];
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-seedrix-darkest/10 bg-seedrix-white">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex items-center gap-3 py-3">
            <Link href="/admin" className="flex min-w-0 items-center gap-2">
              <Image src="/brand/seedrix_logo_black.png" alt="Seedrix" width={96} height={26} className="h-6 w-auto" />
              <span className="hidden text-xs font-bold uppercase tracking-wider text-seedrix-black/50 sm:inline">Staff</span>
            </Link>
            <div className="ms-auto flex items-center gap-3 text-sm">
              <Link href="/admin/account" className="max-w-[40vw] truncate text-seedrix-black/70 hover:text-seedrix-darkest">
                {me.staff.full_name}
                <span className="ms-1 text-xs text-seedrix-black/45">· {me.role}</span>
              </Link>
              <form action={signOut}>
                <button type="submit" className="text-sm font-bold text-seedrix-green hover:underline">
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
