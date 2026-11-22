"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/lib/portal/action-state";
import { getPortalClient } from "@/lib/portal/supabase-server";

function safeNext(v: FormDataEntryValue | null) {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/admin") && !s.startsWith("//") ? s : "/admin";
}

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return process.env.NEXT_PUBLIC_SITE_URL ?? (host ? `${proto}://${host}` : "http://localhost:3000");
}

const passwordSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

export async function signInWithPassword(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = passwordSchema.safeParse({ email: fd.get("email"), password: fd.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const supabase = await getPortalClient();
  if (!supabase) return { error: "The portal is not configured yet (Supabase keys missing)." };
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "Email or password is not right." };
  redirect(safeNext(fd.get("next")));
}

export async function sendMagicLink(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = z.string().trim().email().safeParse(fd.get("email"));
  if (!email.success) return { error: "Enter a valid email" };
  const supabase = await getPortalClient();
  if (!supabase) return { error: "The portal is not configured yet (Supabase keys missing)." };
  const next = safeNext(fd.get("next"));
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${await origin()}/admin/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) return { error: "Couldn't send the link. Ask the owner to check your account is invited." };
  return { ok: true, message: "Check your email for a sign-in link. Open it on this device." };
}

export async function sendPasswordReset(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = z.string().trim().email().safeParse(fd.get("email"));
  if (!email.success) return { error: "Enter a valid email" };
  const supabase = await getPortalClient();
  if (!supabase) return { error: "The portal is not configured yet." };
  await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${await origin()}/admin/auth/confirm?next=/admin/account`,
  });
  return { ok: true, message: "If that email is on the team, a reset link is on its way." };
}

export async function signOut() {
  const supabase = await getPortalClient();
  await supabase?.auth.signOut();
  redirect("/admin/login");
}
