"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { toE164 } from "@/lib/leads/phone";
import type { ActionState } from "@/lib/portal/action-state";
import { isManager, requireStaff } from "@/lib/portal/auth";
import { dbError, formObject, isoDate, money, optDate, optMoney, optText, optUuid, reqText, zodErrors } from "@/lib/portal/forms";
import { CURRICULA, DELIVERY_MODES, STUDENT_STATUSES } from "@/lib/portal/types";

const studentSchema = z.object({
  name: reqText("Name"),
  phone: optText,
  payer_name: optText,
  client_id: optUuid,
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
  next_payment_amount: optMoney,
  next_payment_date: optDate,
  status: z.enum(STUDENT_STATUSES).default("active"),
  notes: optText,
});

type Ctx = Awaited<ReturnType<typeof requireStaff>>;

async function ensureClient({ supabase, me }: Ctx, v: z.infer<typeof studentSchema>) {
  if (v.client_id) return v.client_id;
  const { data, error } = await supabase
    .from("clients")
    .insert({
      name: v.payer_name ?? v.name,
      phone: v.phone ? (toE164(v.phone) ?? v.phone) : null,
      rep_id: isManager(me.role) ? v.rep_id : me.staff.id,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Couldn't create the client");
  return data.id as string;
}

export async function createStudent(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireStaff();
  const parsed = studentSchema.safeParse(formObject(fd));
  if (!parsed.success) return zodErrors(parsed.error);
  const v = parsed.data;
  let clientId: string;
  try {
    clientId = await ensureClient(ctx, v);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't create the client" };
  }
  const row = { ...v, client_id: clientId };
  if (!isManager(ctx.me.role)) row.rep_id = ctx.me.staff.id;
  const { data, error } = await ctx.supabase.from("students").insert(row).select("id").single();
  if (error || !data) return dbError(error);
  revalidatePath("/admin/students");
  redirect(`/admin/students/${data.id}`);
}

export async function updateStudent(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireStaff();
  const parsed = studentSchema.safeParse(formObject(fd));
  if (!parsed.success) return zodErrors(parsed.error);
  const { rep_id, ...rest } = parsed.data;
  let clientId: string;
  try {
    clientId = await ensureClient(ctx, parsed.data);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't create the client" };
  }
  const row: Record<string, unknown> = { ...rest, client_id: clientId };
  if (isManager(ctx.me.role)) row.rep_id = rep_id;
  const { error } = await ctx.supabase.from("students").update(row).eq("id", id);
  if (error) return dbError(error);
  revalidatePath(`/admin/students/${id}`);
  revalidatePath("/admin/students");
  return { ok: true, message: "Saved" };
}

const clientSchema = z.object({
  name: reqText("Name"),
  phone: optText,
  phone2: optText,
  whatsapp: optText,
  email: z.string().email("Enter a valid email").optional().transform((v) => v ?? null),
  emirate: optText,
  area: optText,
  address: optText,
  preferred_language: optText,
  source: optText,
  rep_id: optUuid,
  notes: optText,
});

export async function saveClient(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, me } = await requireStaff();
  const parsed = clientSchema.safeParse(formObject(fd));
  if (!parsed.success) return zodErrors(parsed.error);
  const { rep_id, ...rest } = parsed.data;
  const e164 = (p: string | null) => (p ? (toE164(p) ?? p) : null);
  const row: Record<string, unknown> = { ...rest, phone: e164(rest.phone), phone2: e164(rest.phone2), whatsapp: e164(rest.whatsapp) };
  if (isManager(me.role)) row.rep_id = rep_id;
  if (id) {
    const { error } = await supabase.from("clients").update(row).eq("id", id);
    if (error) return dbError(error);
    revalidatePath(`/admin/clients/${id}`);
    return { ok: true, message: "Saved" };
  }
  const { data, error } = await supabase.from("clients").insert(row).select("id").single();
  if (error || !data) return dbError(error);
  revalidatePath("/admin/clients");
  redirect(`/admin/clients/${data.id}`);
}

const billSchema = z.object({
  amount: money("Amount").refine((v) => v > 0, "Amount must be more than zero"),
  description: optText,
  due_date: isoDate.optional().transform((v) => v ?? null),
});

/** Unpaid invoice for a balance due / new course fee. */
export async function issueBill(studentId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireStaff();
  const parsed = billSchema.safeParse(formObject(fd));
  if (!parsed.success) return zodErrors(parsed.error);
  const { data, error } = await supabase.rpc("create_bill_invoice", {
    p_student: studentId,
    p_amount: parsed.data.amount,
    p_description: parsed.data.description,
    p_due_date: parsed.data.due_date,
  });
  if (error || !data) return dbError(error, "Couldn't create the invoice");
  revalidatePath(`/admin/students/${studentId}`);
  redirect(`/admin/invoices/${data}`);
}
