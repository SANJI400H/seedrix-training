"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { toE164 } from "@/lib/leads/phone";
import type { ActionState } from "@/lib/portal/action-state";
import { requireManager } from "@/lib/portal/auth";
import { dbError, formObject, optMoney, optText, reqText, zodErrors } from "@/lib/portal/forms";
import { TEACHER_STATUSES } from "@/lib/portal/types";
import { getSupabaseAdmin } from "@/lib/supabase";

const teacherSchema = z.object({
  name: reqText("Name"),
  nationality: optText,
  languages: optText,
  subjects: optText,
  curricula: optText,
  grade_range: optText,
  emirate: optText,
  areas: optText,
  delivery_modes: optText,
  availability: optText,
  bio: optText,
  status: z.enum(TEACHER_STATUSES).default("active"),
  phone: optText,
  email: z.string().email("Enter a valid email").optional().transform((v) => v ?? null),
  rate_aed: optMoney,
  pay_unit: z.enum(["hour", "class", "course"]).optional().transform((v) => v ?? null),
  rate_note: optText,
  bank_name: optText,
  iban: optText,
  rating: z
    .union([z.literal(""), z.undefined(), z.coerce.number().min(0).max(5)])
    .transform((v) => (v === "" || v === undefined ? null : v)),
  notes: optText,
});

export async function saveTeacher(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireManager();
  const parsed = teacherSchema.safeParse(formObject(fd));
  if (!parsed.success) return zodErrors(parsed.error);
  const row = { ...parsed.data, phone: parsed.data.phone ? (toE164(parsed.data.phone) ?? parsed.data.phone) : null, iban: parsed.data.iban?.replace(/\s+/g, "") ?? null };
  if (id) {
    const { data, error } = await supabase.from("teachers").update(row).eq("id", id).select("id");
    if (error) return dbError(error);
    if (!data?.length) return { error: "Only the owner or an admin can edit teachers." };
    revalidatePath(`/admin/teachers/${id}`);
    return { ok: true, message: "Saved" };
  }
  const { data, error } = await supabase.from("teachers").insert(row).select("id").single();
  if (error || !data) return dbError(error);
  revalidatePath("/admin/teachers");
  redirect(`/admin/teachers/${data.id}`);
}

/** Upload a profile photo to the private `teacher-photos` Storage bucket. */
export async function uploadTeacherPhoto(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireManager();
  const file = fd.get("photo");
  if (!(file instanceof File) || !file.size) return { error: "Choose a photo." };
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return { error: "Use a JPG, PNG or WebP image." };
  if (file.size > 800_000) return { error: "Keep the photo under 800 KB." };
  const admin = getSupabaseAdmin();
  if (!admin) return { error: "Storage needs SUPABASE_SERVICE_ROLE_KEY on the server." };
  const ext = file.type.split("/")[1].replace("jpeg", "jpg");
  const path = `${id}/${Date.now()}.${ext}`;
  try {
    const { error } = await admin.storage.from("teacher-photos").upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      upsert: true,
    });
    if (error) return { error: `Upload failed: ${error.message}. Is the teacher-photos bucket created?` };
  } catch (e) {
    return { error: `Storage is not reachable: ${e instanceof Error ? e.message : "unknown error"}` };
  }
  const { error } = await supabase.from("teachers").update({ photo_path: path }).eq("id", id);
  if (error) return dbError(error);
  revalidatePath(`/admin/teachers/${id}`);
  return { ok: true, message: "Photo saved." };
}
