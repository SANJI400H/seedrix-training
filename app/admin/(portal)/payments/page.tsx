import Link from "next/link";
import { BankPill, MethodLabel } from "@/components/portal/bits";
import { Empty, Money, PageHeader, Table, Td, Th, inputCls, linkBtnOutline, linkBtnPrimary } from "@/components/portal/ui";
import { bankState } from "@/lib/ledger/balances";
import { fmtDate } from "@/lib/ledger/dates";
import { sum } from "@/lib/ledger/money";
import { requireStaff } from "@/lib/portal/auth";
import { byId, fetchAll, loadLedger } from "@/lib/portal/data";
import { OUTSIDE_ACCOUNT, PAYMENT_METHODS, METHOD_LABEL } from "@/lib/portal/types";
import { cn } from "@/lib/utils";

export const metadata = { title: "Payments in" };
export const dynamic = "force-dynamic";

type SP = { q?: string; rep?: string; bank?: string; method?: string; from?: string; to?: string; void?: string };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { supabase } = await requireStaff();
  const sp = await searchParams;
  const { payments, students, staff, matches } = await loadLedger(supabase);
  const studentById = byId(students);
  const repName = new Map(staff.map((s) => [s.id, s.full_name]));
  const invs = await fetchAll<{ id: string; invoice_number: string }>(supabase, "invoices", { select: "id, invoice_number" });
  const invNo = new Map(invs.map((i) => [i.id, i.invoice_number]));
  const q = (sp.q ?? "").toLowerCase();

  const rows = payments.filter((p) => {
    const st = bankState(p, "payment", matches);
    const hay = [studentById.get(p.student_id)?.name, p.payer_name, p.bank_ref, p.note, p.invoice_id ? invNo.get(p.invoice_id) : ""]
      .join(" ")
      .toLowerCase();
    return (
      (sp.void === "1" || !p.void || !!q) &&
      (!q || hay.includes(q)) &&
      (!sp.rep || p.rep_id === sp.rep) &&
      (!sp.bank || (!p.void && st === sp.bank)) &&
      (!sp.method || (sp.method === "outside" ? OUTSIDE_ACCOUNT.includes(p.method) : p.method === sp.method)) &&
      (!sp.from || p.paid_on >= sp.from) &&
      (!sp.to || p.paid_on <= sp.to)
    );
  });
  const total = sum(rows.filter((p) => !p.void).map((p) => p.amount));

  return (
    <>
      <PageHeader title="Payments in" sub={`${rows.length} shown · AED ${total.toFixed(2)} (void entries excluded from totals)`}>
        <Link href="/admin/payments/new" className={linkBtnPrimary}>
          Record payment
        </Link>
      </PageHeader>
      <form className="flex flex-wrap gap-2" method="get">
        <input name="q" defaultValue={sp.q} placeholder="Search student, payer, invoice, ref" className={cn(inputCls, "flex-[2_1_200px]")} />
        <select name="rep" defaultValue={sp.rep ?? ""} className={cn(inputCls, "flex-[1_1_130px]")}>
          <option value="">All reps</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name}
            </option>
          ))}
        </select>
        <select name="bank" defaultValue={sp.bank ?? ""} className={cn(inputCls, "flex-[1_1_130px]")}>
          <option value="">Any bank status</option>
          <option value="none">Not matched</option>
          <option value="ok">Bank ✓</option>
          <option value="changed">Changed after confirm</option>
        </select>
        <select name="method" defaultValue={sp.method ?? ""} className={cn(inputCls, "flex-[1_1_130px]")}>
          <option value="">Any method</option>
          <option value="outside">Cash / paid to staff</option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {METHOD_LABEL[m]}
            </option>
          ))}
        </select>
        <input type="date" name="from" defaultValue={sp.from} className={cn(inputCls, "flex-[1_1_130px]")} aria-label="From" />
        <input type="date" name="to" defaultValue={sp.to} className={cn(inputCls, "flex-[1_1_130px]")} aria-label="To" />
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" name="void" value="1" defaultChecked={sp.void === "1"} className="h-4 w-4" /> Show void
        </label>
        <button className={linkBtnOutline} type="submit">
          Filter
        </button>
      </form>
      <Table>
        <thead>
          <tr>
            <Th>Date</Th>
            <Th>Invoice</Th>
            <Th>Student / payer</Th>
            <Th>Rep</Th>
            <Th num>Amount</Th>
            <Th num>Teacher</Th>
            <Th num>Commission</Th>
            <Th num>Academy</Th>
            <Th>Bank</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((p) => (
              <tr key={p.id} className={cn(p.void && "text-seedrix-black/40 [&_td]:line-through")}>
                <Td className="whitespace-nowrap">
                  <Link href={`/admin/payments/${p.id}`} className="font-bold hover:underline">
                    {fmtDate(p.paid_on)}
                  </Link>
                </Td>
                <Td className="whitespace-nowrap font-mono text-xs">{p.invoice_id ? invNo.get(p.invoice_id) : "—"}</Td>
                <Td>
                  <Link href={`/admin/payments/${p.id}`} className="hover:underline">
                    {studentById.get(p.student_id)?.name ?? "—"}
                  </Link>
                  <div className="text-xs text-seedrix-black/55">
                    {p.payer_name ? `${p.payer_name} · ` : ""}
                    <MethodLabel method={p.method} />
                  </div>
                </Td>
                <Td>{p.rep_id ? repName.get(p.rep_id) : "—"}</Td>
                <Td num>
                  <Money value={p.amount} />
                </Td>
                <Td num>
                  <Money value={p.teacher_share} />
                </Td>
                <Td num>
                  <Money value={p.commission} />
                </Td>
                <Td num>
                  <Money value={p.academy} />
                </Td>
                <Td>
                  <BankPill state={bankState(p, "payment", matches)} isVoid={p.void} />
                </Td>
              </tr>
            ))
          ) : (
            <tr>
              <Td colSpan={9}>
                <Empty title={payments.length ? "No payments match" : "No payments recorded yet"}>
                  {payments.length ? "Try other filters." : "Use “Record payment” when a client pays. The invoice number and the split are filled in for you."}
                </Empty>
              </Td>
            </tr>
          )}
        </tbody>
      </Table>
    </>
  );
}
