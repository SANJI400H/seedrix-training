"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { findPossibleDuplicates, overpaymentBy } from "@/lib/ledger/balances";
import { fmtDate, todayDubai } from "@/lib/ledger/dates";
import { aed, toCents } from "@/lib/ledger/money";
import type { ActionState } from "@/lib/portal/action-state";
import { isManager, requireStaff } from "@/lib/portal/auth";
import { confirmed, dbError, formObject, isoDate, money, optText, optUuid, reqText, zodErrors } from "@/lib/portal/forms";
import { PAYMENT_METHODS, type BankMatch, type ClientPayment, type Student } from "@/lib/portal/types";

const paymentSchema = z
  .object({
    paid_on: isoDate,
    student_id: z.string().min(1, "Choose a student"),
    new_student_name: optText,
    new_student_fee: z.coerce.number().min(0).optional(),
    amount: money("Amount").refine((v) => v > 0, "Amount must be more than zero"),
    method: z.enum(PAYMENT_METHODS),
    received_by_staff_id: optUuid,
    payer_name: optText,
    bank_ref: optText,
    rep_id: optUuid,
    invoice_id: optUuid,
    teacher_share: money("Teacher share"),
    note: optText,
  })
  .refine((v) => v.teacher_share <= v.amount, {
    message: "The teacher's share can't be more than the payment",
    path: ["teacher_share"],
  })
  .refine((v) => v.student_id !== "__new" || !!v.new_student_name, {
    message: "Enter the new student's name",
    path: ["new_student_name"],
  })
  .refine((v) => v.method !== "staff" || !!v.received_by_staff_id, {
    message: "Who on the team received the money?",
    path: ["received_by_staff_id"],
  });

export async function savePayment(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, me } = await requireStaff();
  const parsed = paymentSchema.safeParse(formObject(fd));
  if (!parsed.success) return zodErrors(parsed.error);
  const v = parsed.data;
  if (v.paid_on > todayDubai()) return { error: "The date can't be in the future.", fieldErrors: { paid_on: "Not in the future" } };

  let existing: ClientPayment | null = null;
  if (id) {
    const { data } = await supabase.from("client_payments").select("*").eq("id", id).maybeSingle();
    existing = (data as ClientPayment | null) ?? null;
    if (!existing) return { error: "Payment not found" };
    if (existing.void) return { error: "This payment is void. Restore it first (owner/admin)." };
  }

  // Warnings that need an explicit confirm --------------------------------
  const warnings: string[] = [];
  let duplicateConfirmed = existing?.duplicate_confirmed ?? false;
  let overpayConfirmed = existing?.overpay_confirmed ?? false;
  if (v.student_id !== "__new") {
    const [{ data: student }, { data: studentPayments }] = await Promise.all([
      supabase.from("students").select("*").eq("id", v.student_id).maybeSingle(),
      supabase.from("client_payments").select("*").eq("student_id", v.student_id),
    ]);
    if (!student) return { error: "Student not found" };
    const others = ((studentPayments ?? []) as ClientPayment[]).map((p) => ({ ...p, amount: Number(p.amount) }));
    const dups = findPossibleDuplicates({ id, student_id: v.student_id, amount: v.amount, paid_on: v.paid_on }, others);
    if (dups.length) {
      warnings.push(
        `Possible double entry: AED ${aed(v.amount)} from this student is already recorded on ${dups
          .map((d) => fmtDate(d.paid_on))
          .join(", ")}.`,
      );
      duplicateConfirmed = true;
    }
    const over = overpaymentBy(student as Student, others, v.amount, id);
    if (over > 0) {
      warnings.push(`This takes the student AED ${aed(over)} over the agreed fee of AED ${aed((student as Student).agreed_fee)}.`);
      overpayConfirmed = true;
    }
  }
  if (existing && toCents(existing.amount) !== toCents(v.amount)) {
    const { data: m } = await supabase
      .from("bank_matches")
      .select("id, matched_amount")
      .eq("client_payment_id", existing.id)
      .is("unmatched_at", null)
      .maybeSingle();
    if (m) {
      warnings.push(
        `This payment was confirmed against the bank for AED ${aed((m as BankMatch).matched_amount)}. Changing the amount will show "Changed after confirm".`,
      );
    }
  }
  if (v.invoice_id) {
    const { data: inv } = await supabase.from("invoices").select("student_id, kind, status").eq("id", v.invoice_id).maybeSingle();
    if (!inv || inv.kind !== "bill" || inv.student_id !== v.student_id) return { error: "That invoice is not an open invoice for this student." };
    if (inv.status === "cancelled") return { error: "That invoice was cancelled." };
  }
  if (warnings.length && !confirmed(fd)) return { confirm: warnings };

  // New student inline ----------------------------------------------------
  let studentId = v.student_id;
  if (studentId === "__new") {
    const { data: s, error } = await supabase
      .from("students")
      .insert({
        name: v.new_student_name,
        agreed_fee: v.new_student_fee ?? 0,
        rep_id: v.rep_id,
        payer_name: v.payer_name,
        status: "active",
      })
      .select("id")
      .single();
    if (error || !s) return dbError(error, "Couldn't add the student.");
    studentId = s.id;
  }

  // commission/academy are computed by the database trigger from teacher_share
  const row = {
    paid_on: v.paid_on,
    student_id: studentId,
    amount: v.amount,
    method: v.method,
    received_by_staff_id: v.method === "staff" ? v.received_by_staff_id : null,
    payer_name: v.payer_name,
    bank_ref: v.bank_ref,
    // sales: the database sets the rep to the person recording it
    rep_id: isManager(me.role) ? v.rep_id : me.staff.id,
    teacher_share: v.teacher_share,
    ...(v.invoice_id ? { invoice_id: v.invoice_id } : {}),
    note: v.note,
    duplicate_confirmed: duplicateConfirmed,
    overpay_confirmed: overpayConfirmed,
  };

  let savedId = id;
  if (id) {
    const { error } = await supabase.from("client_payments").update(row).eq("id", id);
    if (error) return dbError(error);
  } else {
    const { data, error } = await supabase.from("client_payments").insert(row).select("id").single();
    if (error || !data) return dbError(error);
    savedId = data.id;
    // a receipt invoice (SRX sequence) unless it was paid against an existing invoice
    if (!v.invoice_id) await supabase.rpc("create_payment_invoice", { p_payment_id: data.id });
  }
  revalidatePath("/admin/payments");
  revalidatePath("/admin");
  redirect(`/admin/payments/${savedId}?saved=1`);
}

const voidSchema = z.object({ void_reason: reqText("Reason") });

export async function voidPayment(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireStaff();
  const parsed = voidSchema.safeParse(formObject(fd));
  if (!parsed.success) return zodErrors(parsed.error);
  const { data: payouts } = await supabase
    .from("payouts")
    .select("id")
    .eq("client_payment_id", id)
    .eq("void", false);
  if (payouts?.length && !confirmed(fd)) {
    return {
      confirm: [`${payouts.length} payout(s) are linked to this payment. They stay as they are — void them separately if they were wrong too.`],
    };
  }
  const { data, error } = await supabase
    .from("client_payments")
    .update({ void: true, void_reason: parsed.data.void_reason })
    .eq("id", id)
    .select("id");
  if (error) return dbError(error);
  if (!data?.length) return { error: "You can't void this entry." };
  revalidatePath(`/admin/payments/${id}`);
  revalidatePath("/admin/payments");
  return { ok: true, message: "Payment voided. It stays visible and in the activity log." };
}

export async function restorePayment(id: string): Promise<ActionState> {
  const { supabase, me } = await requireStaff();
  if (!isManager(me.role)) return { error: "Only the owner or an admin can restore a voided entry." };
  const { error } = await supabase.from("client_payments").update({ void: false }).eq("id", id);
  if (error) return dbError(error);
  revalidatePath(`/admin/payments/${id}`);
  return { ok: true, message: "Payment restored." };
}
