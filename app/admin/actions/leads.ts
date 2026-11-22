"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { toE164 } from "@/lib/leads/phone";
import type { ActionState } from "@/lib/portal/action-state";
import { isManager, requireManager, requireStaff } from "@/lib/portal/auth";
import { dbError, formObject, money, optDate, optText, optUuid, reqText, zodErrors } from "@/lib/portal/forms";
import { CURRICULA, DELIVERY_MODES, LEAD_SOURCES, LEAD_STAGES, STAGE_LABEL, type LeadStage } from "@/lib/portal/types";

const leadSchema = z
  .object({
    name: reqText("Name"),
    phone: optText,
    email: z.string().email("Enter a valid email").optional().transform((v) => v ?? null),
    source: z.enum(LEAD_SOURCES).default("other"),
    campaign: optText,
    emirate: optText,
    interest: optText,
    child_grades: optText,
    stage: z.enum(LEAD_STAGES).default("new"),
    assigned_rep_id: optUuid,
    next_follow_up: optDate,
    lost_reason: optText,
  })
  .refine((v) => v.stage !== "lost" || !!v.lost_reason, {
    message: "Say why the lead was lost",
    path: ["lost_reason"],
  });

const normPhone = (p: string | null) => (p ? (toE164(p) ?? p) : null);

export async function createLead(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, me } = await requireStaff();
  const raw = formObject(fd);
  const parsed = leadSchema.safeParse(raw);
  if (!parsed.success) return zodErrors(parsed.error);
  const row = { ...parsed.data, phone: normPhone(parsed.data.phone) };
  // sales: the database assigns the lead to them whatever is sent
  if (!isManager(me.role)) row.assigned_rep_id = me.staff.id;
  const { data, error } = await supabase
    .from("leads")
    .insert({ ...row, first_contact_on: new Date().toISOString().slice(0, 10), viewed_at: new Date().toISOString() })
    .select("id")
    .single();
  if (error || !data) return dbError(error);
  if (raw.note) await supabase.from("lead_notes").insert({ lead_id: data.id, body: raw.note, kind: "note" });
  revalidatePath("/admin/leads");
  redirect(`/admin/leads/${data.id}`);
}

export async function updateLead(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, me } = await requireStaff();
  const parsed = leadSchema.safeParse(formObject(fd));
  if (!parsed.success) return zodErrors(parsed.error);
  const { data: before } = await supabase.from("leads").select("stage, assigned_rep_id").eq("id", id).maybeSingle();
  if (!before) return { error: "Lead not found" };
  const { assigned_rep_id, ...rest } = parsed.data;
  const row: Record<string, unknown> = { ...rest, phone: normPhone(rest.phone) };
  // only owner/admin assign; sales keep the current assignment
  if (isManager(me.role)) row.assigned_rep_id = assigned_rep_id;
  const { error } = await supabase.from("leads").update(row).eq("id", id);
  if (error) return dbError(error);
  if (before.stage !== parsed.data.stage) {
    await supabase.from("lead_notes").insert({
      lead_id: id,
      kind: "stage",
      body: `Stage: ${STAGE_LABEL[before.stage as LeadStage]} → ${STAGE_LABEL[parsed.data.stage]}${
        parsed.data.stage === "lost" && parsed.data.lost_reason ? ` (${parsed.data.lost_reason})` : ""
      }`,
    });
  }
  if (isManager(me.role) && before.assigned_rep_id !== assigned_rep_id) await noteAssignment(supabase, [id], assigned_rep_id);
  revalidatePath(`/admin/leads/${id}`);
  revalidatePath("/admin/leads");
  return { ok: true, message: "Saved" };
}

async function noteAssignment(supabase: Awaited<ReturnType<typeof requireStaff>>["supabase"], ids: string[], repId: string | null) {
  let name = "nobody (unassigned)";
  if (repId) {
    const { data } = await supabase.from("staff").select("full_name").eq("id", repId).maybeSingle();
    name = data?.full_name ?? "a rep";
  }
  await supabase.from("lead_notes").insert(ids.map((lead_id) => ({ lead_id, kind: "system", body: `Assigned to ${name}` })));
}

/** Owner/admin: assign or re-assign many leads at once (table view). */
export async function bulkAssignLeads(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireManager();
  const ids = fd.getAll("ids").map(String).filter((v) => z.string().uuid().safeParse(v).success);
  const rep = String(fd.get("rep_id") ?? "");
  if (!ids.length) return { error: "Tick the leads to assign first." };
  const repId = rep === "none" ? null : z.string().uuid().safeParse(rep).success ? rep : undefined;
  if (repId === undefined) return { error: "Choose a rep (or Unassigned)." };
  const { data, error } = await supabase.from("leads").update({ assigned_rep_id: repId, viewed_at: null }).in("id", ids).select("id");
  if (error) return dbError(error);
  await noteAssignment(supabase, ids, repId);
  revalidatePath("/admin/leads");
  return { ok: true, message: `${data?.length ?? 0} lead(s) assigned.` };
}

const noteSchema = z.object({
  body: reqText("Note").pipe(z.string().max(4000)),
  next_follow_up: optDate,
});

export async function addLeadNote(leadId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireStaff();
  const parsed = noteSchema.safeParse(formObject(fd));
  if (!parsed.success) return zodErrors(parsed.error);
  const { error } = await supabase.from("lead_notes").insert({ lead_id: leadId, body: parsed.data.body, kind: "note" });
  if (error) return dbError(error);
  if (parsed.data.next_follow_up) {
    await supabase.from("leads").update({ next_follow_up: parsed.data.next_follow_up }).eq("id", leadId);
  }
  await supabase.from("leads").update({ stage: "contacted" }).eq("id", leadId).eq("stage", "new");
  revalidatePath(`/admin/leads/${leadId}`);
  return { ok: true, message: "Note added" };
}

/** Quick stage move from the pipeline board. */
export async function moveLeadStage(fd: FormData) {
  const { supabase } = await requireStaff();
  const id = z.string().uuid().parse(fd.get("id"));
  const stage = z.enum(LEAD_STAGES).parse(fd.get("stage"));
  if (stage === "lost") redirect(`/admin/leads/${id}?lost=1`);
  if (stage === "enrolled") redirect(`/admin/leads/${id}?convert=1`);
  const { data: before } = await supabase.from("leads").select("stage").eq("id", id).maybeSingle();
  if (!before || before.stage === stage) return;
  const { error } = await supabase.from("leads").update({ stage }).eq("id", id);
  if (!error) {
    await supabase.from("lead_notes").insert({
      lead_id: id,
      kind: "stage",
      body: `Stage: ${STAGE_LABEL[before.stage as LeadStage]} → ${STAGE_LABEL[stage]}`,
    });
  }
  revalidatePath("/admin/leads");
}

const convertSchema = z.object({
  client_mode: z.enum(["new", "existing"]).default("new"),
  client_id: optUuid,
  client_name: optText,
  client_phone: optText,
  client_email: z.string().email("Enter a valid email").optional().transform((v) => v ?? null),
  name: reqText("Student name"),
  grade: optText,
  school: optText,
  curriculum: z.enum(CURRICULA).optional().transform((v) => v ?? null),
  subjects: optText,
  delivery_mode: z.enum(DELIVERY_MODES).optional().transform((v) => v ?? null),
  rep_id: optUuid,
  teacher_id: optUuid,
  course: optText,
  agreed_fee: money("Agreed fee"),
  schedule: optText,
  start_date: optDate,
  next_payment_date: optDate,
  notes: optText,
});

export async function convertLead(leadId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, me } = await requireStaff();
  const parsed = convertSchema.safeParse(formObject(fd));
  if (!parsed.success) return zodErrors(parsed.error);
  const v = parsed.data;
  const { data: lead } = await supabase.from("leads").select("*").eq("id", leadId).maybeSingle();
  if (!lead) return { error: "Lead not found" };
  const { data: existing } = await supabase.from("students").select("id").eq("lead_id", leadId).limit(1);
  if (existing?.length && fd.get("confirm") !== "1") {
    return { confirm: ["This lead already has a student record. Add another child?"] };
  }
  const repId = isManager(me.role) ? (v.rep_id ?? lead.assigned_rep_id) : me.staff.id;

  let clientId = v.client_mode === "existing" ? v.client_id : null;
  if (v.client_mode === "existing" && !clientId) return { error: "Choose the existing client (family)." };
  if (!clientId) {
    const { data: c, error } = await supabase
      .from("clients")
      .insert({
        name: v.client_name ?? lead.name,
        phone: normPhone(v.client_phone ?? lead.phone),
        whatsapp: normPhone(v.client_phone ?? lead.phone),
        email: v.client_email ?? lead.email,
        emirate: lead.emirate,
        source: lead.source,
        lead_id: leadId,
        rep_id: repId,
      })
      .select("id")
      .single();
    if (error || !c) return dbError(error, "Couldn't create the client.");
    clientId = c.id;
  }

  const { data, error } = await supabase
    .from("students")
    .insert({
      lead_id: leadId,
      client_id: clientId,
      name: v.name,
      phone: normPhone(v.client_phone ?? lead.phone),
      payer_name: v.client_name ?? lead.name,
      grade: v.grade,
      school: v.school,
      curriculum: v.curriculum,
      subjects: v.subjects,
      delivery_mode: v.delivery_mode,
      rep_id: repId,
      teacher_id: v.teacher_id,
      course: v.course,
      agreed_fee: v.agreed_fee,
      schedule: v.schedule,
      start_date: v.start_date,
      next_payment_date: v.next_payment_date,
      notes: v.notes,
      status: "active",
    })
    .select("id")
    .single();
  if (error || !data) return dbError(error);
  await supabase.from("leads").update({ stage: "enrolled" }).eq("id", leadId);
  await supabase.from("lead_notes").insert({
    lead_id: leadId,
    kind: "stage",
    body: `Converted to student "${v.name}" · agreed fee AED ${v.agreed_fee.toFixed(2)}`,
  });
  revalidatePath("/admin/leads");
  revalidatePath("/admin/students");
  redirect(`/admin/students/${data.id}`);
}
