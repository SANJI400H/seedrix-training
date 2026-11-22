import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { findDuplicateLead } from "./phone";
import { buildLeadRow, ingestSchema } from "./schema";
import { SOURCE_LABEL } from "./source";

export type IngestResult =
  | { ok: true; status: "created" | "merged"; leadId: string; assignedRepId: string | null }
  | { ok: false; status: 400 | 500; error: string; details?: unknown };

/**
 * Shared by POST /api/leads/ingest (n8n etc.) and the Meta webhook.
 * Runs with the service role. A phone number we already have does not create
 * a second lead: it adds a note "came in again via …" and bumps the lead to the top.
 */
export async function ingestLead(db: SupabaseClient, body: unknown): Promise<IngestResult> {
  const parsed = ingestSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, error: "invalid", details: parsed.error.flatten() };
  const row = buildLeadRow(parsed.data);
  if (!row.phone && !row.email) return { ok: false, status: 400, error: "phone or email is required" };

  // same external id from the same platform = a retry of the same webhook
  if (row.external_id) {
    const { data: same } = await db.from("leads").select("id, assigned_rep_id").eq("source", row.source).eq("external_id", row.external_id).maybeSingle();
    if (same) return { ok: true, status: "merged", leadId: same.id, assignedRepId: same.assigned_rep_id };
  }

  let existing: { id: string; assigned_rep_id: string | null } | null = null;
  const digits = (row.phone ?? "").replace(/\D/g, "");
  if (digits.length >= 7) {
    const { data } = await db
      .from("leads")
      .select("id, phone, assigned_rep_id, last_inbound_at, created_at")
      .ilike("phone", `%${digits.slice(-9)}`)
      .limit(50);
    existing = findDuplicateLead(row.phone, data ?? []);
  } else if (row.email) {
    const { data } = await db.from("leads").select("id, assigned_rep_id").ilike("email", row.email).limit(1).maybeSingle();
    existing = data;
  }

  const via = [SOURCE_LABEL[row.source], row.campaign, row.ad_name, row.form_name].filter(Boolean).join(" · ");
  const detail = [row.interest ? `Interest: ${row.interest}` : null, row.notes, row.emirate ? `Emirate: ${row.emirate}` : null]
    .filter(Boolean)
    .join("\n");

  if (existing) {
    const now = new Date().toISOString();
    const { error } = await db.from("leads").update({ last_inbound_at: now, viewed_at: null }).eq("id", existing.id);
    if (error) return { ok: false, status: 500, error: error.message };
    await db.from("lead_notes").insert({
      lead_id: existing.id,
      kind: "system",
      body: `Came in again via ${via}${row.name ? ` (as "${row.name}")` : ""}.${detail ? `\n${detail}` : ""}`,
    });
    return { ok: true, status: "merged", leadId: existing.id, assignedRepId: existing.assigned_rep_id };
  }

  const { notes, phoneValid, ...lead } = row;
  void phoneValid;
  const { data: created, error } = await db
    .from("leads")
    .insert({ ...lead, stage: "new", first_contact_on: row.received_at.slice(0, 10), last_inbound_at: new Date().toISOString() })
    .select("id, assigned_rep_id, name, phone, email, source, campaign")
    .single();
  if (error || !created) return { ok: false, status: 500, error: error?.message ?? "insert failed" };
  await db.from("lead_notes").insert({
    lead_id: created.id,
    kind: "system",
    body: `New lead via ${via}.${detail ? `\n${detail}` : ""}${notes && !detail.includes(notes) ? `\n${notes}` : ""}`,
  });
  await notifyNewLead(db, created).catch((e) => console.error("new lead email", e));
  return { ok: true, status: "created", leadId: created.id, assignedRepId: created.assigned_rep_id };
}

type NewLead = { id: string; assigned_rep_id: string | null; name: string; phone: string | null; email: string | null; source: string; campaign: string | null };

/** Email the team (and the assigned rep when round-robin picked one). */
export async function notifyNewLead(db: SupabaseClient, lead: NewLead) {
  const { data: cfg } = await db.from("settings").select("notify_new_leads, round_robin_enabled").maybeSingle();
  if (cfg && cfg.notify_new_leads === false) return;
  const key = process.env.RESEND_API_KEY;
  const team = process.env.SEEDRIX_TEAM_EMAIL;
  let repEmail: string | null = null;
  if (lead.assigned_rep_id) {
    const { data } = await db.from("staff").select("email").eq("id", lead.assigned_rep_id).maybeSingle();
    repEmail = data?.email ?? null;
  }
  const to = [team, repEmail].filter(Boolean) as string[];
  if (!key || !to.length) {
    console.info("[email:dev] new lead", { id: lead.id, source: lead.source, to });
    return;
  }
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  await new Resend(key).emails.send({
    from: process.env.RESEND_FROM ?? "Seedrix Training <noreply@seedrixtraining.com>",
    to,
    subject: `New lead — ${lead.name} (${SOURCE_LABEL[lead.source as keyof typeof SOURCE_LABEL] ?? lead.source})`,
    html: `<h2>New lead</h2><ul><li>Name: ${esc(lead.name)}</li><li>Phone: ${esc(lead.phone ?? "—")}</li><li>Email: ${esc(lead.email ?? "—")}</li><li>Source: ${esc(lead.source)}${lead.campaign ? ` · ${esc(lead.campaign)}` : ""}</li></ul><p><a href="${base}/admin/leads/${lead.id}">Open in the staff portal</a></p>`,
  });
}
