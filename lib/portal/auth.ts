import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getPortalClient } from "./supabase-server";
import type { Role, Staff } from "./types";

export type Me = {
  userId: string;
  email: string | null;
  staff: Staff | null;
  role: Role | null;
};

export type StaffContext = {
  supabase: SupabaseClient;
  me: Me & { staff: Staff; role: Role };
};

/** The signed-in user and their staff row (cached per request). */
export const getMe = cache(async (): Promise<{ supabase: SupabaseClient | null; me: Me | null }> => {
  const supabase = await getPortalClient();
  if (!supabase) return { supabase: null, me: null };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, me: null };
  const { data } = await supabase
    .from("staff")
    .select("*")
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();
  const staff = (data as Staff | null) ?? null;
  return {
    supabase,
    me: { userId: user.id, email: user.email ?? null, staff, role: staff?.role ?? null },
  };
});

export async function requireStaff(): Promise<StaffContext> {
  const { supabase, me } = await getMe();
  if (!supabase) redirect("/admin/login?error=not_configured");
  if (!me) redirect("/admin/login");
  if (!me.staff || !me.role) redirect("/admin/no-access");
  return { supabase, me: me as StaffContext["me"] };
}

export function isManager(role: Role | null | undefined) {
  return role === "owner" || role === "admin";
}

/** Owner or admin (bank matching, reports on all money). */
export async function requireManager(): Promise<StaffContext> {
  const ctx = await requireStaff();
  if (!isManager(ctx.me.role)) redirect("/admin?denied=1");
  return ctx;
}

export async function requireOwner(): Promise<StaffContext> {
  const ctx = await requireStaff();
  if (ctx.me.role !== "owner") redirect("/admin?denied=1");
  return ctx;
}
