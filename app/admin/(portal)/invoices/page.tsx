import Link from "next/link";
import { InvoiceStatusPill } from "@/components/portal/bits";
import { Empty, Money, PageHeader, Table, Td, Th, inputCls, linkBtnOutline } from "@/components/portal/ui";
import { fmtDate } from "@/lib/ledger/dates";
import { requireStaff } from "@/lib/portal/auth";
import { byId, loadInvoices, loadStudents } from "@/lib/portal/data";
import { cn } from "@/lib/utils";

export const metadata = { title: "Invoices" };
export const dynamic = "force-dynamic";

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const { supabase } = await requireStaff();
  const sp = await searchParams;
  const [invoices, students] = await Promise.all([loadInvoices(supabase), loadStudents(supabase)]);
  const st = byId(students);
  const q = (sp.q ?? "").toLowerCase();
  // portal invoices only (website self-serve invoices have no kind)
  const rows = invoices.filter(
    (i) =>
      i.kind &&
      (!sp.status || (sp.status === "open" ? i.status === "issued" || i.status === "partial" : i.status === sp.status)) &&
      (!q || [i.invoice_number, i.client_name, i.student_id ? st.get(i.student_id)?.name : ""].join(" ").toLowerCase().includes(q)),
  );
  const due = rows.filter((i) => i.kind === "bill" && (i.status === "issued" || i.status === "partial")).reduce((a, i) => a + i.total_aed - i.amount_paid, 0);

  return (
    <>
      <PageHeader title="Invoices" sub={`${rows.length} shown · AED ${due.toFixed(2)} still due on open invoices. Every payment gets a receipt automatically; issue an invoice for a balance from the student page.`} />
      <form className="flex flex-wrap gap-2" method="get">
        <input name="q" defaultValue={sp.q} placeholder="Search number, client, student" className={cn(inputCls, "flex-[2_1_200px]")} />
        <select name="status" defaultValue={sp.status ?? ""} className={cn(inputCls, "flex-[1_1_140px]")}>
          <option value="">Any status</option>
          <option value="open">Unpaid or partly paid</option>
          <option value="paid">Paid</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button className={linkBtnOutline} type="submit">
          Filter
        </button>
      </form>
      <Table>
        <thead>
          <tr>
            <Th>Number</Th>
            <Th>Date</Th>
            <Th>Client / student</Th>
            <Th>Type</Th>
            <Th num>Total</Th>
            <Th num>Paid</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((i) => (
              <tr key={i.id}>
                <Td>
                  <Link href={`/admin/invoices/${i.id}`} className="font-mono text-xs font-bold hover:underline">
                    {i.invoice_number}
                  </Link>
                </Td>
                <Td className="whitespace-nowrap">{fmtDate(i.created_at.slice(0, 10))}</Td>
                <Td>
                  {i.client_name}
                  {i.student_id ? <div className="text-xs text-seedrix-black/55">{st.get(i.student_id)?.name}</div> : null}
                </Td>
                <Td>{i.kind === "bill" ? "Invoice" : "Receipt"}</Td>
                <Td num>
                  <Money value={i.total_aed} />
                </Td>
                <Td num>
                  <Money value={i.amount_paid} />
                </Td>
                <Td>
                  <InvoiceStatusPill status={i.status} />
                </Td>
              </tr>
            ))
          ) : (
            <tr>
              <Td colSpan={7}>
                <Empty title="No invoices">Record a payment or issue an invoice from a student page.</Empty>
              </Td>
            </tr>
          )}
        </tbody>
      </Table>
    </>
  );
}
