import type { SupabaseClient } from "@supabase/supabase-js";
import { Card, SectionTitle } from "@/components/portal/ui";
import { fmtDateTime } from "@/lib/ledger/dates";
import { auditChanges } from "@/lib/portal/audit";
import type { AuditEntry } from "@/lib/portal/types";

/** Audit trail for a single row (from the trigger-written audit_log). */
export async function RowHistory({
  supabase,
  table,
  rowId,
  who,
}: {
  supabase: SupabaseClient;
  table: string;
  rowId: string;
  who: Map<string, string>;
}) {
  const { data } = await supabase
    .from("audit_log")
    .select("*")
    .eq("table_name", table)
    .eq("row_id", rowId)
    .order("at", { ascending: false })
    .limit(50);
  const rows = (data ?? []) as AuditEntry[];
  return (
    <Card>
      <SectionTitle className="mb-2">History</SectionTitle>
      <ol className="flex flex-col gap-2 text-sm">
        {rows.map((e) => {
          const changes = auditChanges(e);
          return (
            <li key={e.id} className="border-s-2 border-seedrix-darkest/10 ps-3">
              <div className="text-xs text-seedrix-black/55">
                {fmtDateTime(e.at)} · {e.actor ? who.get(e.actor) ?? "Unknown user" : e.actor_role === "service_role" ? "Import / system" : "System"}
              </div>
              {e.action === "insert" ? (
                <div>Created</div>
              ) : changes.length ? (
                <ul>
                  {changes.map((c) => (
                    <li key={c.field}>
                      <span className="text-seedrix-black/60">{c.field}:</span>{" "}
                      <span className={c.money ? "font-mono" : ""}>{c.from}</span> →{" "}
                      <b className={c.money ? "font-mono" : ""}>{c.to}</b>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-seedrix-black/55">Saved with no visible change</div>
              )}
            </li>
          );
        })}
        {!rows.length ? <li className="text-seedrix-black/55">No history yet.</li> : null}
      </ol>
    </Card>
  );
}
