"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import type { ActionState } from "@/lib/portal/action-state";
import { requireManager, requireOwner, requireStaff } from "@/lib/portal/auth";
import { dbError, formObject, reqText, zodErrors } from "@/lib/portal/forms";
import { getSupabaseAdmin } from "@/lib/supabase";

const companySchema = z.object({
  company_name: reqText("Company name"),
  trade_name: reqText("Trading name"),
  address: reqText("Address"),
  license_no: z.string().max(100).optional().transform((v) => v ?? ""),
  trn: z.string().max(64).optional().transform((v) => v ?? ""),
  company_phone: z.string().max(64).optional().transform((v) => v ?? ""),
  company_email: z.string().max(200).optional().transform((v) => v ?? ""),
  bank_name: z.string().max(100).optional().transform((v) => v ?? ""),
  iban: z.string().max(64).optional().transform((v) => (v ?? "").replace(/\s+/g, " ").trim()),
  invoice_footer: z.string().max(1000).optional().transform((v) => v ?? ""),
});

async function updateSettings(row: Record<string, unknown>, message: string): Promise<ActionState> {
  const { supabase } = await requireOwner();
  const { data, error } = await supabase.from("settings").update(row).eq("id", true).select("id");
  if (error) return dbError(error);
  if (!data?.length) return { error: "Only the owner can change settings." };
  revalidatePath("/admin", "layout");
  return { ok: true, message };
}

export async function saveCompany(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireOwner();
  const parsed = companySchema.safeParse(formObject(fd));
  if (!parsed.success) return zodErrors(parsed.error);
  return updateSettings(parsed.data, "Company and invoice details saved.");
}

const splitSchema = z.object({
  sales_pct: z.coerce.number().min(0, "0–100").max(100, "0–100"),
  vat_enabled: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  vat_rate: z.coerce.number().min(0).max(100).default(5),
});

export async function saveSplit(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireOwner();
  const parsed = splitSchema.safeParse(formObject(fd));
  if (!parsed.success) return zodErrors(parsed.error);
  return updateSettings(parsed.data, "Saved. The split % applies to payments recorded from now on; VAT applies to invoices issued from now on (only when a TRN is set).");
}

export async function saveLeadRouting(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireOwner();
  const ids = fd.getAll("round_robin_staff_ids").map(String).filter((v) => z.string().uuid().safeParse(v).success);
  const enabled = fd.get("round_robin_enabled") === "true";
  if (enabled && !ids.length) return { error: "Choose at least one rep for the rotation." };
  return updateSettings(
    { round_robin_enabled: enabled, round_robin_staff_ids: ids, notify_new_leads: fd.get("notify_new_leads") === "true" },
    enabled ? `Round-robin on for ${ids.length} rep(s).` : "Round-robin off: new website and ad leads go to the Unassigned queue.",
  );
}

/** Posts a sample lead to our own ingest endpoint, exactly like n8n would. */
export async function sendTestLead(): Promise<ActionState> {
  await requireManager();
  const secret = process.env.LEAD_INGEST_SECRET;
  if (!secret) return { error: "Set LEAD_INGEST_SECRET first." };
  const url = `${await siteOrigin()}/api/leads/ingest`;
  const stamp = new Date().toISOString().slice(11, 19);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-lead-secret": secret },
      body: JSON.stringify({
        name: `Test lead ${stamp}`,
        phone: `+97150${String(Date.now()).slice(-7)}`,
        source: "other",
        campaign: "Portal test",
        notes: "Sent from Settings → Lead sources. Safe to mark as lost.",
      }),
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { error: `Ingest answered ${res.status}: ${body.error ?? "error"}` };
    revalidatePath("/admin/leads");
    return { ok: true, message: `Test lead ${body.status ?? "created"} (${url}).` };
  } catch (e) {
    return { error: `Couldn't reach ${url}: ${e instanceof Error ? e.message : "error"}` };
  }
}

async function siteOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return process.env.NEXT_PUBLIC_SITE_URL ?? (host ? `${proto}://${host}` : "http://localhost:3000");
}

const inviteSchema = z.object({
  full_name: reqText("Name"),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  role: z.enum(["owner", "admin", "sales"]),
  staff_id: z.string().uuid().optional(),
});

/**
 * Owner only. Sends a Supabase invite email (needs the service role, server side)
 * and links the new auth user to a staff row.
 */
export async function inviteStaff(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireOwner();
  const parsed = inviteSchema.safeParse(formObject(fd));
  if (!parsed.success) return zodErrors(parsed.error);
  const v = parsed.data;
  const admin = getSupabaseAdmin();
  if (!admin) return { error: "SUPABASE_SERVICE_ROLE_KEY is not set on the server, so invites can't be sent." };

  const { data: invited, error: invErr } = await admin.auth.admin.inviteUserByEmail(v.email, {
    redirectTo: `${await siteOrigin()}/admin/auth/callback`,
    data: { full_name: v.full_name },
  });
  let userId = invited?.user?.id ?? null;
  if (invErr) {
    // Already registered? Link the existing account instead.
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    userId = list?.users.find((u) => u.email?.toLowerCase() === v.email)?.id ?? null;
    if (!userId) return { error: `Invite failed: ${invErr.message}` };
  }

  // Write the staff row with the owner's own session so RLS + audit see who did it.
  const row = { full_name: v.full_name, email: v.email, role: v.role, active: true, user_id: userId };
  const existing = v.staff_id
    ? { id: v.staff_id }
    : (
        await supabase
          .from("staff")
          .select("id")
          .or(userId ? `email.eq."${v.email}",user_id.eq.${userId}` : `email.eq."${v.email}"`)
          .limit(1)
          .maybeSingle()
      ).data;
  const { error } = existing
    ? await supabase.from("staff").update(row).eq("id", existing.id)
    : await supabase.from("staff").insert(row);
  if (error) return dbError(error);
  revalidatePath("/admin/settings");
  return {
    ok: true,
    message: invErr
      ? `${v.email} already had an account; it is now linked as ${v.role}.`
      : `Invite sent to ${v.email}. They set a password from the email link.`,
  };
}

const staffSchema = z.object({
  full_name: reqText("Name"),
  role: z.enum(["owner", "admin", "sales"]),
  active: z.enum(["true", "false"]).transform((v) => v === "true"),
});

export async function updateStaff(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireOwner();
  const parsed = staffSchema.safeParse(formObject(fd));
  if (!parsed.success) return zodErrors(parsed.error);
  const { data, error } = await supabase.from("staff").update(parsed.data).eq("id", id).select("id");
  if (error) return dbError(error);
  if (!data?.length) return { error: "Only the owner can manage staff." };
  revalidatePath("/admin/settings");
  return { ok: true, message: "Saved" };
}

/** A rep/teacher-side person without a login yet (e.g. a sales rep before invite). */
export async function addStaffWithoutLogin(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireOwner();
  const parsed = z
    .object({ full_name: reqText("Name"), role: z.enum(["admin", "sales"]).default("sales") })
    .safeParse(formObject(fd));
  if (!parsed.success) return zodErrors(parsed.error);
  const { error } = await supabase.from("staff").insert({ ...parsed.data, active: true });
  if (error) return dbError(error);
  revalidatePath("/admin/settings");
  return { ok: true, message: "Added. Invite them by email when they need to sign in." };
}

const passwordSchema = z
  .object({ password: z.string().min(10, "Use at least 10 characters"), password2: z.string() })
  .refine((v) => v.password === v.password2, { message: "The two passwords don't match", path: ["password2"] });

export async function updatePassword(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireStaff();
  const parsed = passwordSchema.safeParse({ password: fd.get("password"), password2: fd.get("password2") });
  if (!parsed.success) return zodErrors(parsed.error);
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.message };
  return { ok: true, message: "Password saved. You can sign in with it from now on." };
}
