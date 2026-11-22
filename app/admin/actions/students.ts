"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/lib/portal/action-state";
import { requireStaff } from "@/lib/portal/auth";
import { dbError, formObject, money, optDate, optMoney, optText, optUuid, reqText, zodErrors } from "@/lib/portal/forms";
import { STUDENT_STATUSES } from "@/lib/portal/types";

const studentSchema = z.object({
  name: reqText("Name"),
  phone: optText,
  payer_name: optText,
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

export async function createStudent(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireStaff();
  const parsed = studentSchema.safeParse(formObject(fd));
  if (!parsed.success) return zodErrors(parsed.error);
  const { data, error } = await supabase.from("students").insert(parsed.data).select("id").single();
  if (error || !data) return dbError(error);
  revalidatePath("/admin/students");
  redirect(`/admin/students/${data.id}`);
}

export async function updateStudent(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireStaff();
  const parsed = studentSchema.safeParse(formObject(fd));
  if (!parsed.success) return zodErrors(parsed.error);
  const { error } = await supabase.from("students").update(parsed.data).eq("id", id);
  if (error) return dbError(error);
  revalidatePath(`/admin/students/${id}`);
  revalidatePath("/admin/students");
  return { ok: true, message: "Saved" };
}
