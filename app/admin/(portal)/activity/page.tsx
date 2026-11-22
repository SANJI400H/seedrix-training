import Link from "next/link";
import { Card, Empty, PageHeader, Pill, inputCls, linkBtnOutline } from "@/components/portal/ui";
import { fmtDateTime } from "@/lib/ledger/dates";
import { TABLE_LABEL, auditChanges, auditLink, auditSummary } from "@/lib/portal/audit";
import { isManager, requireStaff } from "@/lib/portal/auth";
import { loadStaff, staffByUser } from "@/lib/portal/data";
import type { AuditEntry } from "@/lib/portal/types";
import { cn } from "@/lib/utils";

export const metadata = { title: "Activity log" };
export const dynamic = "force-dynamic";

const PAGE = 100;

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ table?: string; actor?: string; money?: string; before?: string }>;
}) {
  const { supabase, me } = await requireStaff();
  const manager = isManager(me.role);
  const sp = await searchParams;
  const staff = await loadStaff(supabase);
  const who = staffByUser(staff);

  let q = supabase.from("audit_log").select("*").order("id", { ascending: false }).limit(PAGE);
  if (sp.table) q = q.eq("table_name", sp.table);
  else q = q.neq("table_name", "bank_lines"); // statement imports are noisy; filter to see them
  if (sp.actor) q = q.eq("actor", sp.actor);
  if (sp.money) q = q.in("table_name", ["client_payments", "payouts", "bank_matches"]);
  if (sp.before) q = q.lt("id", Number(sp.before));
  const { data, error } = await q;
  const rows = (data ?? []) as AuditEntry[];
  const last = rows.at(-1);

  return (
    <>
      <PageHeader
        title={manager ? "Activity log" : "My activity"}
        sub={
          manager
            ? "Written by the database itself on every change. Nobody — including the owner — can edit or delete it from the app."
            : "Everything you recorded or changed, written by the database itself."
        }
      />
      <form className="flex flex-wrap gap-2" method="get">
        <select name="table" defaultValue={sp.table ?? ""} className={cn(inputCls, "flex-[1_1_160px]")}>
          <option value="">Everything (except statement lines)</option>
          {Object.entries(TABLE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        {manager ? (
        <select name="actor" defaultValue={sp.actor ?? ""} className={cn(inputCls, "flex-[1_1_160px]")}>
          <option value="">Anyone</option>
          {staff
            .filter((s) => s.user_id)
            .map((s) => (
              <option key={s.id} value={s.user_id!}>
                {s.full_name}
              </option>
            ))}
        </select>
        ) : null}
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" name="money" value="1" defaultChecked={!!sp.money} className="h-4 w-4" /> Money only
        </label>
        <button className={linkBtnOutline} type="submit">
          Filter
        </button>
      </form>
      {error ? <p className="text-sm text-red-700">Couldn&apos;t load the log: {error.message}</p> : null}
      <Card className="p-0">
        {rows.length ? (
          <ul className="divide-y divide-seedrix-darkest/10">
            {rows.map((e) => {
              const changes = auditChanges(e);
              const row = (e.after ?? e.before) as Record<string, unknown> | null;
              const href = auditLink(e.table_name, e.row_id, row);
              const voided = e.action === "update" && e.before?.void === false && e.after?.void === true;
              return (
                <li key={e.id} className="flex flex-col gap-1 px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-seedrix-black/55">{fmtDateTime(e.at)}</span>
                    <span className="font-bold">
                      {e.actor ? who.get(e.actor) ?? "Unknown user" : e.actor_role === "service_role" ? "Import / website" : "System (SQL)"}
                    </span>
                    <Pill tone={voided ? "bad" : e.action === "insert" ? "muted" : "warn"}>
                      {voided ? "voided" : e.action === "insert" ? "created" : e.action === "update" ? "changed" : e.action}
                    </Pill>
                    <span>{TABLE_LABEL[e.table_name] ?? e.table_name}</span>
                    {href ? (
                      <Link href={href} className="text-seedrix-green hover:underline">
                        {auditSummary(e)}
                      </Link>
                    ) : (
                      <span className="text-seedrix-black/70">{auditSummary(e)}</span>
                    )}
                  </div>
                  {changes.length ? (
                    <ul className="ps-4 text-xs text-seedrix-black/70">
                      {changes.slice(0, 8).map((c) => (
                        <li key={c.field}>
                          {c.field}: <span className={c.money ? "font-mono" : ""}>{c.from}</span> →{" "}
                          <b className={cn(c.money && "font-mono", c.money && "text-red-700")}>{c.to}</b>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty title="No activity yet">Every change to leads, students and money appears here with who made it.</Empty>
        )}
      </Card>
      {rows.length === PAGE && last ? (
        <Link
          className={linkBtnOutline}
          href={`/admin/activity?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([k, v]) => v && k !== "before")), before: String(last.id) })}`}
        >
          Older entries
        </Link>
      ) : null}
    </>
  );
}
