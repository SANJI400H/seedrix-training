import { Money, PageHeader, SectionTitle, Table, Td, Th, inputCls, linkBtnOutline } from "@/components/portal/ui";
import { requireManager } from "@/lib/portal/auth";
import { SOURCE_LABEL } from "@/lib/leads/source";
import { loadLeads, loadLedger } from "@/lib/portal/data";
import { attributionReport, monthlyReport, repReport, teacherReport, type SourceRow } from "@/lib/portal/reports";
import { cn } from "@/lib/utils";

export const metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { supabase } = await requireManager();
  const sp = await searchParams;
  const range = { from: sp.from || undefined, to: sp.to || undefined };
  const [ledger, leads] = await Promise.all([loadLedger(supabase), loadLeads(supabase)]);
  const reps = repReport(ledger, leads, range);
  const teachers = teacherReport(ledger, range);
  const months = monthlyReport(ledger, range);
  const bySource = attributionReport(ledger, leads, range, "source");
  const byCampaign = attributionReport(ledger, leads, range, "campaign");
  const q = new URLSearchParams(Object.entries(range).filter(([, v]) => v) as [string, string][]).toString();
  const exportLink = (type: string) => `/admin/reports/export?type=${type}${q ? `&${q}` : ""}`;

  return (
    <>
      <PageHeader title="Reports" sub="Void entries are left out. Dates use the payment / payout date.">
        <a className={linkBtnOutline} href={exportLink("payments")}>
          Payments CSV
        </a>
        <a className={linkBtnOutline} href={exportLink("payouts")}>
          Payouts CSV
        </a>
      </PageHeader>
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

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <SectionTitle>Per sales rep</SectionTitle>
          <a className="text-sm font-bold text-seedrix-green" href={exportLink("reps")}>
            CSV
          </a>
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Rep</Th>
              <Th num>Leads</Th>
              <Th num>Trials</Th>
              <Th num>Enrolments</Th>
              <Th num>Revenue</Th>
              <Th num>Commission due</Th>
              <Th num>Paid</Th>
              <Th num>Still owed</Th>
            </tr>
          </thead>
          <tbody>
            {reps.map((r) => (
              <tr key={r.id}>
                <Td className="font-bold">{r.name}</Td>
                <Td num>{r.leads}</Td>
                <Td num>{r.trials}</Td>
                <Td num>{r.enrolments}</Td>
                <Td num>
                  <Money value={r.revenue} />
                </Td>
                <Td num>
                  <Money value={r.commissionDue} />
                </Td>
                <Td num>
                  <Money value={r.commissionPaid} />
                </Td>
                <Td num className={r.commissionOwed < 0 ? "font-bold text-red-700" : ""}>
                  <Money value={r.commissionOwed} />
                </Td>
              </tr>
            ))}
            {!reps.length ? (
              <tr>
                <Td colSpan={8} className="text-center text-seedrix-black/55">
                  Nothing in this period.
                </Td>
              </tr>
            ) : null}
          </tbody>
        </Table>
      </section>

      <AttributionTable title="By lead source" rows={bySource} label={(k) => SOURCE_LABEL[k as keyof typeof SOURCE_LABEL] ?? k} csv={exportLink("sources")} />
      <AttributionTable title="By campaign" rows={byCampaign} label={(k) => k} csv={exportLink("campaigns")} />

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <SectionTitle>Per teacher</SectionTitle>
          <a className="text-sm font-bold text-seedrix-green" href={exportLink("teachers")}>
            CSV
          </a>
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Teacher</Th>
              <Th num>Students</Th>
              <Th num>Due (teacher share)</Th>
              <Th num>Paid</Th>
              <Th num>Still owed</Th>
            </tr>
          </thead>
          <tbody>
            {teachers.map((r) => (
              <tr key={r.id}>
                <Td className="font-bold">{r.name}</Td>
                <Td num>{r.students}</Td>
                <Td num>
                  <Money value={r.due} />
                </Td>
                <Td num>
                  <Money value={r.paid} />
                </Td>
                <Td num className={r.owed < 0 ? "font-bold text-red-700" : ""}>
                  <Money value={r.owed} />
                </Td>
              </tr>
            ))}
            {!teachers.length ? (
              <tr>
                <Td colSpan={5} className="text-center text-seedrix-black/55">
                  Nothing in this period.
                </Td>
              </tr>
            ) : null}
          </tbody>
        </Table>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <SectionTitle>Monthly summary</SectionTitle>
          <a className="text-sm font-bold text-seedrix-green" href={exportLink("monthly")}>
            CSV
          </a>
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Month</Th>
              <Th num>Money in</Th>
              <Th num>Teacher share</Th>
              <Th num>Commission</Th>
              <Th num>Academy</Th>
              <Th num>Teachers paid</Th>
              <Th num>Commission paid</Th>
              <Th num>Refunds</Th>
              <Th num>Other out</Th>
              <Th num>Net</Th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month}>
                <Td className="font-bold">{m.month}</Td>
                <Td num>
                  <Money value={m.moneyIn} />
                </Td>
                <Td num>
                  <Money value={m.teacherShare} />
                </Td>
                <Td num>
                  <Money value={m.commission} />
                </Td>
                <Td num>
                  <Money value={m.academy} />
                </Td>
                <Td num>
                  <Money value={m.teacherPaid} />
                </Td>
                <Td num>
                  <Money value={m.commissionPaid} />
                </Td>
                <Td num>
                  <Money value={m.refunds} />
                </Td>
                <Td num>
                  <Money value={m.other} />
                </Td>
                <Td num className="font-bold">
                  <Money value={m.net} />
                </Td>
              </tr>
            ))}
            {!months.length ? (
              <tr>
                <Td colSpan={10} className="text-center text-seedrix-black/55">
                  Nothing in this period.
                </Td>
              </tr>
            ) : null}
          </tbody>
        </Table>
      </section>
    </>
  );
}

function AttributionTable({ title, rows, label, csv }: { title: string; rows: SourceRow[]; label: (k: string) => string; csv: string }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <SectionTitle>{title}</SectionTitle>
        <a className="text-sm font-bold text-seedrix-green" href={csv}>
          CSV
        </a>
      </div>
      <Table>
        <thead>
          <tr>
            <Th>{title.replace("By ", "")}</Th>
            <Th num>Leads</Th>
            <Th num>Trials</Th>
            <Th num>Enrolled</Th>
            <Th num>Conversion</Th>
            <Th num>Revenue</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <Td className="font-bold">{label(r.key)}</Td>
              <Td num>{r.leads}</Td>
              <Td num>{r.trials}</Td>
              <Td num>{r.enrolments}</Td>
              <Td num>{r.leads ? `${Math.round((r.enrolments / r.leads) * 100)}%` : "—"}</Td>
              <Td num>
                <Money value={r.revenue} />
              </Td>
            </tr>
          ))}
          {!rows.length ? (
            <tr>
              <Td colSpan={6} className="text-center text-seedrix-black/55">
                Nothing in this period.
              </Td>
            </tr>
          ) : null}
        </tbody>
      </Table>
    </section>
  );
}
