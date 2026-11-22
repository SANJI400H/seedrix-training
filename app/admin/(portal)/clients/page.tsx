import Link from "next/link";
import { ContactLinks } from "@/components/portal/bits";
import { Empty, Money, PageHeader, Pill, Table, Td, Th, inputCls, linkBtnOutline, linkBtnPrimary } from "@/components/portal/ui";
import { paidByStudent } from "@/lib/ledger/balances";
import { isManager, requireStaff } from "@/lib/portal/auth";
import { loadClients, loadPayments, loadStaff, loadStudents } from "@/lib/portal/data";
import { SOURCE_LABEL, type LeadSource } from "@/lib/portal/types";
import { cn } from "@/lib/utils";

export const metadata = { title: "Clients" };
export const dynamic = "force-dynamic";

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string; owes?: string }> }) {
  const { supabase, me } = await requireStaff();
  const manager = isManager(me.role);
  const sp = await searchParams;
  const [clients, students, payments, staff] = await Promise.all([loadClients(supabase), loadStudents(supabase), loadPayments(supabase), loadStaff(supabase)]);
  const repName = new Map(staff.map((s) => [s.id, s.full_name]));
  const q = (sp.q ?? "").toLowerCase();
  const rows = clients
    .map((c) => {
      const kids = students.filter((s) => s.client_id === c.id && s.status !== "archived");
      const fee = kids.reduce((a, s) => a + s.agreed_fee, 0);
      const paid = kids.reduce((a, s) => a + paidByStudent(s.id, payments), 0);
      return { c, kids, fee, paid, balance: Math.round((fee - paid) * 100) / 100 };
    })
    .filter(
      (r) =>
        (!q || [r.c.name, r.c.phone, r.c.email, r.c.area, ...r.kids.map((k) => k.name)].join(" ").toLowerCase().includes(q)) &&
        (!sp.owes || r.balance > 0),
    );

  return (
    <>
      <PageHeader title={manager ? "Clients" : "My clients"} sub="Families / payers. One client can have several children.">
        <Link href="/admin/clients/new" className={linkBtnPrimary}>
          Add client
        </Link>
      </PageHeader>
      <form className="flex flex-wrap gap-2" method="get">
        <input name="q" defaultValue={sp.q} placeholder="Search parent, child, phone, area" className={cn(inputCls, "flex-[2_1_220px]")} />
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" name="owes" value="1" defaultChecked={!!sp.owes} className="h-4 w-4" /> Still owes
        </label>
        <button className={linkBtnOutline} type="submit">
          Filter
        </button>
      </form>
      <Table>
        <thead>
          <tr>
            <Th>Client</Th>
            <Th>Children</Th>
            <Th>Area</Th>
            {manager ? <Th>Rep</Th> : null}
            <Th num>Fees</Th>
            <Th num>Paid</Th>
            <Th>Balance</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map(({ c, kids, fee, paid, balance }) => (
              <tr key={c.id}>
                <Td>
                  <Link href={`/admin/clients/${c.id}`} className="font-bold hover:underline">
                    {c.name}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-seedrix-black/55">
                    {c.source ? <span>{SOURCE_LABEL[c.source as LeadSource] ?? c.source}</span> : null}
                    <ContactLinks phone={c.whatsapp ?? c.phone} />
                  </div>
                </Td>
                <Td>{kids.map((k) => k.name).join(", ") || "—"}</Td>
                <Td>{[c.area, c.emirate].filter(Boolean).join(", ") || "—"}</Td>
                {manager ? <Td>{c.rep_id ? repName.get(c.rep_id) : "—"}</Td> : null}
                <Td num>
                  <Money value={fee} />
                </Td>
                <Td num>
                  <Money value={paid} />
                </Td>
                <Td>{balance > 0 ? <Pill tone="warn">Owes {balance.toFixed(2)}</Pill> : balance < 0 ? <Pill tone="bad">Over {(-balance).toFixed(2)}</Pill> : <Pill tone="good">Settled</Pill>}</Td>
              </tr>
            ))
          ) : (
            <tr>
              <Td colSpan={7}>
                <Empty title="No clients">Clients are created when you convert a lead to a student.</Empty>
              </Td>
            </tr>
          )}
        </tbody>
      </Table>
    </>
  );
}
