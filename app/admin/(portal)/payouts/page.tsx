import Link from "next/link";
import { BankPill } from "@/components/portal/bits";
import { Empty, Money, PageHeader, Pill, Table, Td, Th, inputCls, linkBtnOutline, linkBtnPrimary } from "@/components/portal/ui";
import { bankState, payoutsOverDue } from "@/lib/ledger/balances";
import { fmtDate } from "@/lib/ledger/dates";
import { aed, sum } from "@/lib/ledger/money";
import { requireStaff } from "@/lib/portal/auth";
import { byId, loadLedger } from "@/lib/portal/data";
import { PAYOUT_LABEL, PAYOUT_TYPES } from "@/lib/portal/types";
import { cn } from "@/lib/utils";

export const metadata = { title: "Payouts" };
export const dynamic = "force-dynamic";

type SP = { q?: string; type?: string; bank?: string; linked?: string; over?: string; void?: string };

export default async function PayoutsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { supabase } = await requireStaff();
  const sp = await searchParams;
  const ledger = await loadLedger(supabase);
  const { payouts, payments, students, matches } = ledger;
  const paymentById = byId(payments);
  const studentById = byId(students);
  const overKeys = new Set(payoutsOverDue(payments, payouts).map((o) => `${o.paymentId}:${o.type}`));
  const q = (sp.q ?? "").toLowerCase();

  const rows = payouts.filter(
    (o) =>
      (sp.void === "1" || !o.void || !!q) &&
      (!q || [o.payee, o.note].join(" ").toLowerCase().includes(q)) &&
      (!sp.type || o.type === sp.type) &&
      (!sp.bank || (!o.void && bankState(o, "payout", matches) === sp.bank)) &&
      (!sp.linked || (sp.linked === "no" ? !o.client_payment_id && (o.type === "teacher" || o.type === "commission") : !!o.client_payment_id)) &&
      (!sp.over || (!o.void && overKeys.has(`${o.client_payment_id}:${o.type}`))),
  );

  return (
    <>
      <PageHeader title="Payouts" sub={`${rows.length} shown · AED ${aed(sum(rows.filter((o) => !o.void).map((o) => o.amount)))}`}>
        <Link href="/admin/payouts/new" className={linkBtnPrimary}>
          Record payout
        </Link>
      </PageHeader>
      <form className="flex flex-wrap gap-2" method="get">
        <input name="q" defaultValue={sp.q} placeholder="Search payee or note" className={cn(inputCls, "flex-[2_1_200px]")} />
        <select name="type" defaultValue={sp.type ?? ""} className={cn(inputCls, "flex-[1_1_130px]")}>
          <option value="">All types</option>
          {PAYOUT_TYPES.map((t) => (
            <option key={t} value={t}>
              {PAYOUT_LABEL[t]}
            </option>
          ))}
        </select>
        <select name="bank" defaultValue={sp.bank ?? ""} className={cn(inputCls, "flex-[1_1_130px]")}>
          <option value="">Any bank status</option>
          <option value="none">Not matched</option>
          <option value="ok">Bank ✓</option>
          <option value="changed">Changed after confirm</option>
        </select>
        <select name="linked" defaultValue={sp.linked ?? ""} className={cn(inputCls, "flex-[1_1_130px]")}>
          <option value="">Linked or not</option>
          <option value="no">Not linked (teacher/commission)</option>
          <option value="yes">Linked</option>
        </select>
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" name="over" value="1" defaultChecked={!!sp.over} className="h-4 w-4" /> Over due
        </label>
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
            <Th>Type</Th>
            <Th>Paid to</Th>
            <Th>For client payment</Th>
            <Th num>Amount</Th>
            <Th>Bank</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((o) => {
              const p = o.client_payment_id ? paymentById.get(o.client_payment_id) : undefined;
              const over = !o.void && overKeys.has(`${o.client_payment_id}:${o.type}`);
              return (
                <tr key={o.id} className={cn(o.void && "text-seedrix-black/40 [&_td]:line-through")}>
                  <Td className="whitespace-nowrap">
                    <Link href={`/admin/payouts/${o.id}`} className="font-bold hover:underline">
                      {fmtDate(o.paid_on)}
                    </Link>
                  </Td>
                  <Td>{PAYOUT_LABEL[o.type]}</Td>
                  <Td>
                    {o.payee}
                    {o.note ? <div className="text-xs text-seedrix-black/55">{o.note}</div> : null}
                  </Td>
                  <Td>
                    {p ? (
                      <Link href={`/admin/payments/${p.id}`} className="hover:underline">
                        {fmtDate(p.paid_on)} · {studentById.get(p.student_id)?.name}
                      </Link>
                    ) : o.type === "teacher" || o.type === "commission" ? (
                      <Pill tone="warn">Not linked</Pill>
                    ) : (
                      "—"
                    )}
                    {over ? <Pill tone="bad" className="ms-1">Over due</Pill> : null}
                  </Td>
                  <Td num>
                    <Money value={o.amount} />
                  </Td>
                  <Td>
                    <BankPill state={bankState(o, "payout", matches)} isVoid={o.void} />
                  </Td>
                </tr>
              );
            })
          ) : (
            <tr>
              <Td colSpan={6}>
                <Empty title={payouts.length ? "No payouts match" : "No payouts recorded yet"}>
                  When you pay a teacher, send commission or refund a parent, record it here and link it to the client payment.
                </Empty>
              </Td>
            </tr>
          )}
        </tbody>
      </Table>
    </>
  );
}
