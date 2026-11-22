import Link from "next/link";
import { bulkAssignLeads, moveLeadStage } from "@/app/admin/actions/leads";
import { ActionForm } from "@/components/portal/action-form";
import { ContactLinks, StagePill } from "@/components/portal/bits";
import { Card, Empty, PageHeader, Pill, Table, Td, Th, inputCls, linkBtnOutline, linkBtnPrimary } from "@/components/portal/ui";
import { fmtDate, todayDubai } from "@/lib/ledger/dates";
import { isManager, requireStaff } from "@/lib/portal/auth";
import { loadLeads, loadStaff } from "@/lib/portal/data";
import { isNewLead } from "@/lib/portal/leads";
import { LEAD_SOURCES, LEAD_STAGES, SOURCE_LABEL, STAGE_LABEL, type Lead } from "@/lib/portal/types";
import { cn } from "@/lib/utils";

export const metadata = { title: "Leads" };
export const dynamic = "force-dynamic";

type SP = { view?: string; rep?: string; stage?: string; source?: string; campaign?: string; due?: string; q?: string; queue?: string };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { supabase, me } = await requireStaff();
  const manager = isManager(me.role);
  const sp = await searchParams;
  const [leads, staff] = await Promise.all([loadLeads(supabase), loadStaff(supabase)]);
  const repName = new Map(staff.map((s) => [s.id, s.full_name]));
  const today = todayDubai();
  const q = (sp.q ?? "").toLowerCase();
  const view = sp.view === "table" ? "table" : "pipeline";
  const queue = manager && sp.queue === "unassigned";
  const campaigns = [...new Set(leads.map((l) => l.campaign).filter(Boolean) as string[])].sort();
  const unassignedCount = manager ? leads.filter((l) => !l.assigned_rep_id).length : 0;
  const newCount = leads.filter(isNewLead).length;

  const filtered = leads.filter(
    (l) =>
      (!queue || !l.assigned_rep_id) &&
      (!sp.rep || (sp.rep === "none" ? !l.assigned_rep_id : l.assigned_rep_id === sp.rep)) &&
      (!sp.stage || l.stage === sp.stage) &&
      (!sp.source || l.source === sp.source) &&
      (!sp.campaign || l.campaign === sp.campaign) &&
      (!sp.due || (!!l.next_follow_up && l.next_follow_up <= today && l.stage !== "enrolled" && l.stage !== "lost")) &&
      (!q || [l.name, l.phone, l.email, l.interest, l.emirate, l.campaign].join(" ").toLowerCase().includes(q)),
  );
  // newest activity first (a lead that came in again jumps to the top)
  const sorted = [...filtered].sort((a, b) => b.last_inbound_at.localeCompare(a.last_inbound_at));
  const qs = (extra: Partial<SP>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...extra })) if (v) p.set(k, v);
    return `?${p.toString()}`;
  };
  const reps = staff.filter((s) => s.active);

  return (
    <>
      <PageHeader
        title={manager ? (queue ? "Unassigned leads" : "Leads") : "My leads"}
        sub={
          manager
            ? `${filtered.length} of ${leads.length} leads · ${unassignedCount} unassigned · ${newCount} new. Website and ad leads arrive automatically.`
            : `${filtered.length} leads assigned to you · ${newCount} new.`
        }
      >
        <Link href="/admin/leads/new" className={linkBtnPrimary}>
          Add lead
        </Link>
        {manager ? (
          <Link href={queue ? "/admin/leads" : `/admin/leads?queue=unassigned&view=table`} className={linkBtnOutline}>
            {queue ? "All leads" : `Unassigned queue (${unassignedCount})`}
          </Link>
        ) : null}
        <Link href={qs({ view: view === "table" ? "pipeline" : "table" })} className={linkBtnOutline}>
          {view === "table" ? "Pipeline view" : "Table view"}
        </Link>
      </PageHeader>

      <form className="flex flex-wrap gap-2" method="get">
        <input type="hidden" name="view" value={view} />
        {queue ? <input type="hidden" name="queue" value="unassigned" /> : null}
        <input name="q" defaultValue={sp.q} placeholder="Search name, phone, course" className={cn(inputCls, "min-w-0 flex-[2_1_200px]")} />
        {manager && !queue ? (
          <select name="rep" defaultValue={sp.rep ?? ""} className={cn(inputCls, "flex-[1_1_140px]")}>
            <option value="">All reps</option>
            <option value="none">Unassigned</option>
            {reps.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>
        ) : null}
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
        {campaigns.length ? (
          <select name="campaign" defaultValue={sp.campaign ?? ""} className={cn(inputCls, "flex-[1_1_160px]")}>
            <option value="">All campaigns</option>
            {campaigns.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        ) : null}
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" name="due" value="1" defaultChecked={!!sp.due} className="h-4 w-4" /> Follow-up due
        </label>
        <button className={linkBtnOutline} type="submit">
          Filter
        </button>
        {Object.entries(sp).some(([k, v]) => v && k !== "view" && k !== "queue") ? (
          <Link href={`/admin/leads?view=${view}${queue ? "&queue=unassigned" : ""}`} className="self-center text-sm font-bold text-seedrix-green">
            Clear
          </Link>
        ) : null}
      </form>

      {view === "table" ? (
        manager ? (
          <ActionForm action={bulkAssignLeads} submitLabel="Assign ticked leads" submitVariant="secondary">
            <div className="flex flex-wrap items-center gap-2 rounded-[8px] bg-seedrix-darkest/[0.04] p-2 text-sm">
              <span className="font-bold">Assign ticked leads to</span>
              <select name="rep_id" defaultValue="" className={cn(inputCls, "w-auto min-w-40")} aria-label="Assign to rep">
                <option value="">Choose a rep…</option>
                {reps.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
                <option value="none">Unassigned</option>
              </select>
            </div>
            <LeadTable leads={sorted} repName={repName} today={today} selectable />
          </ActionForm>
        ) : (
          <LeadTable leads={sorted} repName={repName} today={today} />
        )
      ) : (
        <Pipeline leads={sorted} repName={repName} today={today} showRep={manager} />
      )}
    </>
  );
}

function LeadTable({ leads, repName, today, selectable }: { leads: Lead[]; repName: Map<string, string>; today: string; selectable?: boolean }) {
  return (
    <Table>
      <thead>
        <tr>
          {selectable ? <Th className="w-8">✓</Th> : null}
          <Th>Name</Th>
          <Th>Stage</Th>
          <Th>Source / campaign</Th>
          <Th>Interest</Th>
          {selectable ? <Th>Rep</Th> : null}
          <Th>Follow-up</Th>
          <Th>Contact</Th>
        </tr>
      </thead>
      <tbody>
        {leads.length ? (
          leads.slice(0, 500).map((l) => (
            <tr key={l.id}>
              {selectable ? (
                <Td>
                  <input type="checkbox" name="ids" value={l.id} aria-label={`Select ${l.name}`} className="h-5 w-5" />
                </Td>
              ) : null}
              <Td>
                <Link href={`/admin/leads/${l.id}`} className="font-bold hover:underline">
                  {l.name}
                </Link>
                {isNewLead(l) ? <Pill tone="info" className="ms-1">New</Pill> : null}
                <div className="text-xs text-seedrix-black/50">{[l.emirate, l.child_grades].filter(Boolean).join(" · ")}</div>
              </Td>
              <Td>
                <StagePill stage={l.stage} />
              </Td>
              <Td>
                {SOURCE_LABEL[l.source] ?? l.source}
                {l.campaign ? <div className="text-xs text-seedrix-black/50">{l.campaign}</div> : null}
              </Td>
              <Td className="max-w-[16rem]">
                <span className="line-clamp-2">{l.interest}</span>
              </Td>
              {selectable ? <Td>{l.assigned_rep_id ? repName.get(l.assigned_rep_id) : <Pill tone="warn">Unassigned</Pill>}</Td> : null}
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
            <Td colSpan={8}>
              <Empty title="No leads here">Try clearing the filters.</Empty>
            </Td>
          </tr>
        )}
      </tbody>
    </Table>
  );
}

function LeadCard({ l, repName, today, showRep }: { l: Lead; repName: Map<string, string>; today: string; showRep: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-[8px] border border-seedrix-darkest/10 bg-seedrix-white p-2 text-sm">
      <div className="min-w-0">
        <Link href={`/admin/leads/${l.id}`} className="break-words font-bold hover:underline">
          {l.name}
        </Link>
        {isNewLead(l) ? <Pill tone="info" className="ms-1">New</Pill> : null}
        {l.interest ? <div className="line-clamp-2 text-xs text-seedrix-black/60">{l.interest}</div> : null}
        <div className="mt-1 flex flex-wrap items-center gap-x-1 text-xs text-seedrix-black/55">
          <span>{SOURCE_LABEL[l.source] ?? l.source}</span>
          {showRep ? <span>· {l.assigned_rep_id ? repName.get(l.assigned_rep_id) : "Unassigned"}</span> : null}
          {l.next_follow_up ? (
            <span className={cn(l.next_follow_up <= today && "font-bold text-red-700")}>· {fmtDate(l.next_follow_up)}</span>
          ) : null}
        </div>
      </div>
      <ContactLinks phone={l.phone} />
      <form action={moveLeadStage} className="flex w-full min-w-0 items-center gap-1">
        <input type="hidden" name="id" value={l.id} />
        <select
          name="stage"
          defaultValue={l.stage}
          aria-label="Move to stage"
          className="h-9 min-w-0 flex-1 rounded-[6px] border border-seedrix-darkest/15 bg-seedrix-white px-1 text-xs"
        >
          {LEAD_STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABEL[s]}
            </option>
          ))}
        </select>
        <button type="submit" className="h-9 shrink-0 rounded-[6px] px-2 text-xs font-bold text-seedrix-green hover:bg-seedrix-green/10">
          Move
        </button>
      </form>
    </div>
  );
}

function Pipeline({ leads, repName, today, showRep }: { leads: Lead[]; repName: Map<string, string>; today: string; showRep: boolean }) {
  const groups = LEAD_STAGES.map((s) => ({ stage: s, rows: leads.filter((l) => l.stage === s) }));
  return (
    <>
      {/* desktop: kanban, scrolls sideways if the window is narrow */}
      <div className="hidden overflow-x-auto pb-2 md:block">
        <div className="grid min-w-[66rem] grid-cols-6 gap-2">
          {groups.map((g) => (
            <div key={g.stage} className="flex min-w-0 flex-col gap-2 rounded-[12px] bg-seedrix-darkest/[0.04] p-2">
              <div className="flex items-center justify-between px-1">
                <StagePill stage={g.stage} />
                <span className="text-xs font-bold text-seedrix-black/50">{g.rows.length}</span>
              </div>
              <div className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto">
                {g.rows.slice(0, 150).map((l) => (
                  <LeadCard key={l.id} l={l} repName={repName} today={today} showRep={showRep} />
                ))}
                {g.rows.length > 150 ? <p className="px-1 text-xs text-seedrix-black/50">+{g.rows.length - 150} more — use filters or the table.</p> : null}
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* mobile: grouped list */}
      <div className="flex flex-col gap-2 md:hidden">
        {groups.map((g) => (
          <details key={g.stage} open={g.stage === groups.find((x) => x.rows.length)?.stage}>
            <summary className="flex cursor-pointer items-center justify-between rounded-[8px] bg-seedrix-white px-3 py-2">
              <StagePill stage={g.stage} />
              <span className="text-xs font-bold text-seedrix-black/50">{g.rows.length}</span>
            </summary>
            <Card className="mt-1 flex flex-col gap-2 p-2">
              {g.rows.length ? (
                <>
                  {g.rows.slice(0, 25).map((l) => (
                    <LeadCard key={l.id} l={l} repName={repName} today={today} showRep={showRep} />
                  ))}
                  {g.rows.length > 25 ? (
                    <Link href={`/admin/leads?view=table&stage=${g.stage}`} className="p-2 text-center text-sm font-bold text-seedrix-green">
                      See all {g.rows.length} in the table
                    </Link>
                  ) : null}
                </>
              ) : (
                <p className="p-2 text-xs text-seedrix-black/50">None</p>
              )}
            </Card>
          </details>
        ))}
      </div>
    </>
  );
}
