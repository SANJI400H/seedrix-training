import { redirect } from "next/navigation";
import { Kpi, Money, PageHeader, SectionTitle, Table, Td, Th, inputCls, linkBtnOutline } from "@/components/portal/ui";
import { sum } from "@/lib/ledger/money";
import { isManager, requireStaff } from "@/lib/portal/auth";
import { loadLeads, loadLedger } from "@/lib/portal/data";
import { SOURCE_LABEL } from "@/lib/leads/source";
import { attributionReport, monthlyReport } from "@/lib/portal/reports";
import { cn } from "@/lib/utils";

export const metadata = { title: "My performance" };
export const dynamic = "force-dynamic";

/** Sales: their own numbers only (RLS limits every query to their leads / students / payments). */
export default async function PerformancePage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { supabase, me } = await requireStaff();
  if (isManager(me.role)) redirect("/admin/reports");
  const sp = await searchParams;
  const range = { from: sp.from || undefined, to: sp.to || undefined };
  const inRange = (d: string) => (!range.from || d >= range.from) && (!range.to || d <= range.to);
  const [ledger, leads] = await Promise.all([loadLedger(supabase), loadLeads(supabase)]);
  const myLeads = leads.filter((l) => inRange((l.received_at ?? l.created_at).slice(0, 10)));
  const trials = myLeads.filter((l) => ["trial_booked", "trial_done", "enrolled"].includes(l.stage)).length;
  const enrolled = myLeads.filter((l) => l.stage === "enrolled").length;
  const pays = ledger.payments.filter((p) => !p.void && inRange(p.paid_on));
  const revenue = sum(pays.map((p) => p.amount));
  const commission = sum(pays.filter((p) => p.rep_id === me.staff.id).map((p) => p.commission));
  const paid = sum(ledger.payouts.filter((o) => !o.void && o.type === "commission" && o.staff_id === me.staff.id && inRange(o.paid_on)).map((o) => o.amount));
  const sources = attributionReport(ledger, leads, range, "source");
  const months = monthlyReport(ledger, range);

  return (
    <>
      <PageHeader title="My performance" sub="Your leads, conversions, revenue from your students and your commission." />
      <form className="flex flex-wrap items-end gap-2" method="get">
        <label className="flex flex-col text-xs font-bold">
          From
          <input type="date" name="from" defaultValue={sp.from} className={cn(inputCls, "w-44")} />
        </label>
        <label className="flex flex-col text-xs font-bold">
          To
          <input type="date" name="to" defaultValue={sp.to} className={cn(inputCls, "w-44")} />
        </label>
        <button type="submit" className={linkBtnOutline}>
          Apply
        </button>
      </form>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <div className="rounded-[12px] border border-seedrix-darkest/10 bg-seedrix-white p-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-seedrix-black/55">Leads · trials · enrolled</div>
          <div className="mt-1 font-mono text-lg font-bold md:text-xl">
            {myLeads.length} · {trials} · {enrolled}
          </div>
          <div className="mt-0.5 text-xs text-seedrix-black/55">
            Conversion {myLeads.length ? Math.round((enrolled / myLeads.length) * 100) : 0}%
          </div>
        </div>
        <Kpi label="Revenue from your students" value={revenue} note={`${pays.length} payment(s)`} />
        <Kpi label="Commission earned" value={commission} />
        <Kpi label="Commission paid to you" value={paid} />
        <Kpi hero label="Commission still owed" value={Math.round((commission - paid) * 100) / 100} />
      </div>
      <section className="flex flex-col gap-2">
        <SectionTitle>Your leads by source</SectionTitle>
        <Table>
          <thead>
            <tr>
              <Th>Source</Th>
              <Th num>Leads</Th>
              <Th num>Trials</Th>
              <Th num>Enrolled</Th>
              <Th num>Revenue</Th>
            </tr>
          </thead>
          <tbody>
            {sources.map((r) => (
              <tr key={r.key}>
                <Td className="font-bold">{SOURCE_LABEL[r.key as keyof typeof SOURCE_LABEL] ?? r.key}</Td>
                <Td num>{r.leads}</Td>
                <Td num>{r.trials}</Td>
                <Td num>{r.enrolments}</Td>
                <Td num>
                  <Money value={r.revenue} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>
      <section className="flex flex-col gap-2">
        <SectionTitle>By month</SectionTitle>
        <Table>
          <thead>
            <tr>
              <Th>Month</Th>
              <Th num>Payments</Th>
              <Th num>Revenue</Th>
              <Th num>Commission</Th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month}>
                <Td className="font-bold">{m.month}</Td>
                <Td num>{m.payments}</Td>
                <Td num>
                  <Money value={m.moneyIn} />
                </Td>
                <Td num>
                  <Money value={m.commission} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>
    </>
  );
}
