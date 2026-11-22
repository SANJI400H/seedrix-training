"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/lib/portal/action-state";
import { requireStaff } from "@/lib/portal/auth";
import { dbError, formObject, money, optDate, optText, optUuid, reqText, zodErrors } from "@/lib/portal/forms";
import { LEAD_SOURCES, LEAD_STAGES, STAGE_LABEL, type LeadStage } from "@/lib/portal/types";

const leadSchema = z
  .object({
    name: reqText("Name"),
    phone: optText,
    email: z.string().email("Enter a valid email").optional().transform((v) => v ?? null),
    source: z.enum(LEAD_SOURCES).default("other"),
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

export async function createLead(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireStaff();
  const raw = formObject(fd);
  const parsed = leadSchema.safeParse(raw);
  if (!parsed.success) return zodErrors(parsed.error);
  const { data, error } = await supabase
    .from("leads")
    .insert({ ...parsed.data, first_contact_on: new Date().toISOString().slice(0, 10) })
    .select("id")
    .single();
  if (error || !data) return dbError(error);
  if (raw.note) {
    await supabase.from("lead_notes").insert({ lead_id: data.id, body: raw.note, kind: "note" });
  }
  revalidatePath("/admin/leads");
  redirect(`/admin/leads/${data.id}`);
}

export async function updateLead(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireStaff();
  const parsed = leadSchema.safeParse(formObject(fd));
  if (!parsed.success) return zodErrors(parsed.error);
  const { data: before } = await supabase.from("leads").select("stage").eq("id", id).maybeSingle();
  if (!before) return { error: "Lead not found" };
  const { error } = await supabase.from("leads").update(parsed.data).eq("id", id);
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
  revalidatePath(`/admin/leads/${id}`);
  revalidatePath("/admin/leads");
  return { ok: true, message: "Saved" };
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
  // touching a "new" lead means it has been contacted
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
  name: reqText("Student name"),
  phone: optText,
  payer_name: optText,
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
  const { supabase } = await requireStaff();
  const parsed = convertSchema.safeParse(formObject(fd));
  if (!parsed.success) return zodErrors(parsed.error);
  const { data: lead } = await supabase.from("leads").select("id, stage").eq("id", leadId).maybeSingle();
  if (!lead) return { error: "Lead not found" };
  const { data: existing } = await supabase.from("students").select("id").eq("lead_id", leadId).limit(1);
  if (existing?.length && fd.get("confirm") !== "1") {
    return { confirm: ["This lead already has a student record. Create another one (e.g. a second child)?"] };
  }
  const { data, error } = await supabase
    .from("students")
    .insert({ ...parsed.data, lead_id: leadId, status: "active" })
    .select("id")
    .single();
  if (error || !data) return dbError(error);
  await supabase.from("leads").update({ stage: "enrolled" }).eq("id", leadId);
  await supabase.from("lead_notes").insert({
    lead_id: leadId,
    kind: "stage",
    body: `Converted to student "${parsed.data.name}" · agreed fee AED ${parsed.data.agreed_fee.toFixed(2)}`,
  });
  revalidatePath("/admin/leads");
  revalidatePath("/admin/students");
  redirect(`/admin/students/${data.id}`);
}
