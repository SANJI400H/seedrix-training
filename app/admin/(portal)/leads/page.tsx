import Link from "next/link";
import { moveLeadStage } from "@/app/admin/actions/leads";
import { ContactLinks, StagePill } from "@/components/portal/bits";
import { Card, Empty, PageHeader, Pill, Table, Td, Th, inputCls, linkBtnOutline, linkBtnPrimary } from "@/components/portal/ui";
import { fmtDate, todayDubai } from "@/lib/ledger/dates";
import { requireStaff } from "@/lib/portal/auth";
import { loadLeads, loadStaff } from "@/lib/portal/data";
import { LEAD_SOURCES, LEAD_STAGES, SOURCE_LABEL, STAGE_LABEL, type Lead } from "@/lib/portal/types";
import { cn } from "@/lib/utils";

export const metadata = { title: "Leads" };
export const dynamic = "force-dynamic";

type SP = { view?: string; rep?: string; stage?: string; source?: string; due?: string; q?: string };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { supabase } = await requireStaff();
  const sp = await searchParams;
  const [leads, staff] = await Promise.all([loadLeads(supabase), loadStaff(supabase)]);
  const repName = new Map(staff.map((s) => [s.id, s.full_name]));
  const today = todayDubai();
  const q = (sp.q ?? "").toLowerCase();
  const view = sp.view === "table" ? "table" : "pipeline";

  const filtered = leads.filter(
    (l) =>
      (!sp.rep || (sp.rep === "none" ? !l.assigned_rep_id : l.assigned_rep_id === sp.rep)) &&
      (!sp.stage || l.stage === sp.stage) &&
      (!sp.source || l.source === sp.source) &&
      (!sp.due || (!!l.next_follow_up && l.next_follow_up <= today && l.stage !== "enrolled" && l.stage !== "lost")) &&
      (!q || [l.name, l.phone, l.email, l.interest, l.emirate].join(" ").toLowerCase().includes(q)),
  );
  const sorted = [...filtered].sort((a, b) =>
    (a.next_follow_up ?? "9999").localeCompare(b.next_follow_up ?? "9999") || b.created_at.localeCompare(a.created_at),
  );
  const qs = (extra: Partial<SP>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...extra })) if (v) p.set(k, v);
    return `?${p.toString()}`;
  };

  return (
    <>
      <PageHeader title="Leads" sub={`${filtered.length} of ${leads.length} leads. Website enquiries arrive here automatically.`}>
        <Link href="/admin/leads/new" className={linkBtnPrimary}>
          Add lead
        </Link>
        <Link href={qs({ view: view === "table" ? "pipeline" : "table" })} className={linkBtnOutline}>
          {view === "table" ? "Pipeline view" : "Table view"}
        </Link>
      </PageHeader>

      <form className="flex flex-wrap gap-2" method="get">
        <input type="hidden" name="view" value={view} />
        <input name="q" defaultValue={sp.q} placeholder="Search name, phone, course" className={cn(inputCls, "min-w-0 flex-[2_1_200px]")} />
        <select name="rep" defaultValue={sp.rep ?? ""} className={cn(inputCls, "flex-[1_1_140px]")}>
          <option value="">All reps</option>
          <option value="none">Unassigned</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name}
            </option>
          ))}
        </select>
        <select name="stage" defaultValue={sp.stage ?? ""} className={cn(inputCls, "flex-[1_1_140px]")}>
          <option value="">All stages</option>
          {LEAD_STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABEL[s]}
            </option>
          ))}
        </select>
        <select name="source" defaultValue={sp.source ?? ""} className={cn(inputCls, "flex-[1_1_140px]")}>
          <option value="">All sources</option>
          {LEAD_SOURCES.map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABEL[s]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" name="due" value="1" defaultChecked={!!sp.due} className="h-4 w-4" /> Follow-up due
        </label>
        <button className={linkBtnOutline} type="submit">
          Filter
        </button>
        {Object.values(sp).some(Boolean) ? (
          <Link href={`/admin/leads?view=${view}`} className="self-center text-sm font-bold text-seedrix-green">
            Clear
          </Link>
        ) : null}
      </form>

      {view === "table" ? (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Stage</Th>
              <Th>Source</Th>
              <Th>Interest</Th>
              <Th>Rep</Th>
              <Th>Follow-up</Th>
              <Th>Contact</Th>
            </tr>
          </thead>
          <tbody>
            {sorted.length ? (
              sorted.map((l) => (
                <tr key={l.id}>
                  <Td>
                    <Link href={`/admin/leads/${l.id}`} className="font-bold hover:underline">
                      {l.name}
                    </Link>
                    <div className="text-xs text-seedrix-black/50">{[l.emirate, l.child_grades].filter(Boolean).join(" · ")}</div>
                  </Td>
                  <Td>
                    <StagePill stage={l.stage} />
                  </Td>
                  <Td>{SOURCE_LABEL[l.source]}</Td>
                  <Td className="max-w-[18rem]">
                    <span className="line-clamp-2">{l.interest}</span>
                  </Td>
                  <Td>{l.assigned_rep_id ? repName.get(l.assigned_rep_id) : <Pill tone="warn">None</Pill>}</Td>
                  <Td className={cn("whitespace-nowrap", l.next_follow_up && l.next_follow_up <= today && "font-bold text-red-700")}>
                    {fmtDate(l.next_follow_up)}
                  </Td>
                  <Td>
                    <ContactLinks phone={l.phone} />
                  </Td>
                </tr>
              ))
            ) : (
              <tr>
                <Td colSpan={7}>
                  <Empty title="No leads match">Try clearing the filters.</Empty>
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
      ) : (
        <Pipeline leads={sorted} repName={repName} today={today} />
      )}
    </>
  );
}

function LeadCard({ l, repName, today }: { l: Lead; repName: Map<string, string>; today: string }) {
  return (
    <div className="rounded-[8px] border border-seedrix-darkest/10 bg-seedrix-white p-2 text-sm">
      <Link href={`/admin/leads/${l.id}`} className="block font-bold hover:underline">
        {l.name}
      </Link>
      {l.interest ? <div className="line-clamp-2 text-xs text-seedrix-black/60">{l.interest}</div> : null}
      <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-seedrix-black/55">
        <span>{SOURCE_LABEL[l.source]}</span>
        {l.assigned_rep_id ? <span>· {repName.get(l.assigned_rep_id)}</span> : null}
        {l.next_follow_up ? (
          <span className={cn(l.next_follow_up <= today && "font-bold text-red-700")}>· {fmtDate(l.next_follow_up)}</span>
        ) : null}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <ContactLinks phone={l.phone} />
        <form action={moveLeadStage} className="flex items-center gap-1">
          <input type="hidden" name="id" value={l.id} />
          <select name="stage" defaultValue={l.stage} aria-label="Move to stage" className="h-8 rounded-[6px] border border-seedrix-darkest/15 bg-seedrix-white px-1 text-xs">
            {LEAD_STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </select>
          <button type="submit" className="h-8 rounded-[6px] px-2 text-xs font-bold text-seedrix-green hover:bg-seedrix-green/10">
            Move
          </button>
        </form>
      </div>
    </div>
  );
}

function Pipeline({ leads, repName, today }: { leads: Lead[]; repName: Map<string, string>; today: string }) {
  const groups = LEAD_STAGES.map((s) => ({ stage: s, rows: leads.filter((l) => l.stage === s) }));
  return (
    <>
      {/* desktop: kanban */}
      <div className="hidden gap-2 overflow-x-auto md:grid md:grid-cols-6">
        {groups.map((g) => (
          <div key={g.stage} className="flex min-w-[11rem] flex-col gap-2 rounded-[12px] bg-seedrix-darkest/[0.04] p-2">
            <div className="flex items-center justify-between px-1">
              <StagePill stage={g.stage} />
              <span className="text-xs font-bold text-seedrix-black/50">{g.rows.length}</span>
            </div>
            <div className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto">
              {g.rows.slice(0, 150).map((l) => (
                <LeadCard key={l.id} l={l} repName={repName} today={today} />
              ))}
              {g.rows.length > 150 ? <p className="px-1 text-xs text-seedrix-black/50">+{g.rows.length - 150} more — use filters or the table.</p> : null}
            </div>
          </div>
        ))}
      </div>
      {/* mobile: grouped list */}
      <div className="flex flex-col gap-2 md:hidden">
        {groups.map((g) => (
          <details key={g.stage} open={g.stage === "new" || g.stage === "contacted"}>
            <summary className="flex cursor-pointer items-center justify-between rounded-[8px] bg-seedrix-white px-3 py-2">
              <StagePill stage={g.stage} />
              <span className="text-xs font-bold text-seedrix-black/50">{g.rows.length}</span>
            </summary>
            <Card className="mt-1 flex flex-col gap-2 p-2">
              {g.rows.length ? g.rows.slice(0, 100).map((l) => <LeadCard key={l.id} l={l} repName={repName} today={today} />) : (
                <p className="p-2 text-xs text-seedrix-black/50">None</p>
              )}
            </Card>
          </details>
        ))}
      </div>
    </>
  );
}
