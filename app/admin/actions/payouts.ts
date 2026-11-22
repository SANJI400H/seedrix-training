"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { checkPayout } from "@/lib/ledger/balances";
import { todayDubai } from "@/lib/ledger/dates";
import { aed, toCents } from "@/lib/ledger/money";
import type { ActionState } from "@/lib/portal/action-state";
import { isManager, requireStaff } from "@/lib/portal/auth";
import { confirmed, dbError, formObject, isoDate, money, optText, optUuid, reqText, zodErrors } from "@/lib/portal/forms";
import {
  PAYMENT_METHODS,
  PAYOUT_LABEL,
  PAYOUT_TYPES,
  type BankMatch,
  type ClientPayment,
  type Payout,
} from "@/lib/portal/types";

const payoutSchema = z.object({
  paid_on: isoDate,
  type: z.enum(PAYOUT_TYPES),
  payee: optText,
  teacher_id: optUuid,
  staff_id: optUuid,
  amount: money("Amount").refine((v) => v > 0, "Amount must be more than zero"),
  client_payment_id: optUuid,
  method: z.enum(PAYMENT_METHODS).default("bank_transfer"),
  note: optText,
});

export async function savePayout(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireStaff();
  const parsed = payoutSchema.safeParse(formObject(fd));
  if (!parsed.success) return zodErrors(parsed.error);
  const v = parsed.data;
  if (v.paid_on > todayDubai()) return { error: "The date can't be in the future.", fieldErrors: { paid_on: "Not in the future" } };

  let existing: Payout | null = null;
  if (id) {
    const { data } = await supabase.from("payouts").select("*").eq("id", id).maybeSingle();
    existing = (data as Payout | null) ?? null;
    if (!existing) return { error: "Payout not found" };
    if (existing.void) return { error: "This payout is void. Restore it first (owner/admin)." };
  }

  // Resolve payee name from the chosen teacher / staff member
  let payee = v.payee;
  const teacherId = v.type === "teacher" ? v.teacher_id : null;
  const staffId = v.type === "commission" ? v.staff_id : null;
  if (teacherId) {
    const { data } = await supabase.from("teachers").select("name").eq("id", teacherId).maybeSingle();
    payee = payee ?? data?.name ?? null;
  }
  if (staffId) {
    const { data } = await supabase.from("staff").select("full_name").eq("id", staffId).maybeSingle();
    payee = payee ?? data?.full_name ?? null;
  }
  if (!payee) return { error: "Who was paid?", fieldErrors: { payee: "Who was paid?" } };

  const warnings: string[] = [];
  let overpayConfirmed = existing?.overpay_confirmed ?? false;
  if (v.client_payment_id) {
    const [{ data: payment }, { data: siblings }] = await Promise.all([
      supabase.from("client_payments").select("*").eq("id", v.client_payment_id).maybeSingle(),
      supabase.from("payouts").select("*").eq("client_payment_id", v.client_payment_id),
    ]);
    if (!payment) return { error: "Linked client payment not found" };
    if ((payment as ClientPayment).void) warnings.push("The linked client payment is void.");
    const c = checkPayout(
      { ...(payment as ClientPayment), amount: Number(payment.amount) },
      v.type,
      v.amount,
      ((siblings ?? []) as Payout[]).map((o) => ({ ...o, amount: Number(o.amount) })),
      id,
    );
    if (c.overpay) {
      warnings.push(
        `${PAYOUT_LABEL[v.type]} due on this payment is AED ${aed(c.due)}, already paid AED ${aed(c.alreadyPaid)}. This would overpay by AED ${aed(c.overBy)}.`,
      );
      overpayConfirmed = true;
    }
  } else if (v.type === "teacher" || v.type === "commission") {
    warnings.push(`This ${PAYOUT_LABEL[v.type].toLowerCase()} is not linked to a client payment, so nobody can check it was due.`);
  }
  if (existing && toCents(existing.amount) !== toCents(v.amount)) {
    const { data: m } = await supabase
      .from("bank_matches")
      .select("matched_amount")
      .eq("payout_id", existing.id)
      .is("unmatched_at", null)
      .maybeSingle();
    if (m) {
      warnings.push(
        `This payout was confirmed against the bank for AED ${aed((m as BankMatch).matched_amount)}. Changing the amount will show "Changed after confirm".`,
      );
    }
  }
  if (warnings.length && !confirmed(fd)) return { confirm: warnings };

  const row = {
    paid_on: v.paid_on,
    type: v.type,
    payee,
    teacher_id: teacherId,
    staff_id: staffId,
    amount: v.amount,
    client_payment_id: v.client_payment_id,
    method: v.method,
    note: v.note,
    overpay_confirmed: overpayConfirmed,
  };
  let savedId = id;
  if (id) {
    const { error } = await supabase.from("payouts").update(row).eq("id", id);
    if (error) return dbError(error);
  } else {
    const { data, error } = await supabase.from("payouts").insert(row).select("id").single();
    if (error || !data) return dbError(error);
    savedId = data.id;
  }
  revalidatePath("/admin/payouts");
  revalidatePath("/admin");
  redirect(`/admin/payouts/${savedId}?saved=1`);
}

export async function voidPayout(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireStaff();
  const parsed = z.object({ void_reason: reqText("Reason") }).safeParse(formObject(fd));
  if (!parsed.success) return zodErrors(parsed.error);
  const { data, error } = await supabase
    .from("payouts")
    .update({ void: true, void_reason: parsed.data.void_reason })
    .eq("id", id)
    .select("id");
  if (error) return dbError(error);
  if (!data?.length) return { error: "You can't void this entry." };
  revalidatePath(`/admin/payouts/${id}`);
  revalidatePath("/admin/payouts");
  return { ok: true, message: "Payout voided. It stays visible and in the activity log." };
}

export async function restorePayout(id: string): Promise<ActionState> {
  const { supabase, me } = await requireStaff();
  if (!isManager(me.role)) return { error: "Only the owner or an admin can restore a voided entry." };
  const { error } = await supabase.from("payouts").update({ void: false }).eq("id", id);
  if (error) return dbError(error);
  revalidatePath(`/admin/payouts/${id}`);
  return { ok: true, message: "Payout restored." };
}
