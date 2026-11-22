"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dedupeByRef, parseWioCsv } from "@/lib/ledger/bank";
import { aed, toCents } from "@/lib/ledger/money";
import type { ActionState } from "@/lib/portal/action-state";
import { requireManager } from "@/lib/portal/auth";
import { fetchAll } from "@/lib/portal/data";
import { confirmed, dbError, formObject, isoDate, money, optText, reqText, zodErrors } from "@/lib/portal/forms";

const MAX_BYTES = 900_000; // stays under the default 1 MB server action body limit

export async function importBankCsv(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireManager();
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose the CSV file exported from Wio." };
  if (file.size > MAX_BYTES) return { error: "That file is too large. Export a shorter date range." };
  const text = await file.text();
  const parsed = parseWioCsv(text);
  if (!parsed.lines.length) return { error: parsed.errors[0] ?? "No transactions found in the file." };

  const existing = await fetchAll<{ id: string; ref: string }>(supabase, "bank_lines", { select: "id, ref" });
  const { fresh, duplicates } = dedupeByRef(parsed.lines, existing.map((e) => e.ref));
  let inserted = 0;
  for (let i = 0; i < fresh.length; i += 200) {
    const chunk = fresh.slice(i, i + 200).map((l) => ({
      booked_on: l.booked_on,
      ref: l.ref,
      txn_type: l.txn_type,
      description: l.description,
      amount: l.amount,
      balance: l.balance,
      original_ref: l.original_ref,
      notes: l.notes,
      raw: l.raw,
    }));
    const { data, error } = await supabase
      .from("bank_lines")
      .upsert(chunk, { onConflict: "ref", ignoreDuplicates: true })
      .select("id");
    if (error) return dbError(error, `Imported ${inserted} lines, then failed`);
    inserted += data?.length ?? 0;
  }
  revalidatePath("/admin/bank");
  const notes = parsed.errors.length ? ` ${parsed.errors.length} row(s) skipped: ${parsed.errors.slice(0, 3).join("; ")}` : "";
  return {
    ok: true,
    message: `Imported ${inserted} new line(s). ${duplicates.length} were already imported and skipped.${notes}`,
  };
}

const matchSchema = z
  .object({
    kind: z.enum(["payment", "payout"]),
    entry_id: z.string().uuid(),
    bank_line_id: z.string().uuid().optional(),
    manual_date: isoDate.optional(),
    manual_amount: money("Amount").optional(),
    manual_ref: optText,
  })
  .refine((v) => v.bank_line_id || (v.manual_date && v.manual_amount !== undefined), {
    message: "Pick a bank line or enter the statement date and amount",
  });

export async function matchToBank(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireManager();
  const parsed = matchSchema.safeParse(formObject(fd));
  if (!parsed.success) return zodErrors(parsed.error);
  const v = parsed.data;
  const table = v.kind === "payment" ? "client_payments" : "payouts";
  const { data: entry } = await supabase.from(table).select("id, amount, void").eq("id", v.entry_id).maybeSingle();
  if (!entry) return { error: "Entry not found" };
  if (entry.void) return { error: "Voided entries can't be matched." };

  const warnings: string[] = [];
  if (v.bank_line_id) {
    const { data: line } = await supabase.from("bank_lines").select("amount").eq("id", v.bank_line_id).maybeSingle();
    if (!line) return { error: "Bank line not found" };
    const expected = v.kind === "payment" ? toCents(entry.amount) : -toCents(entry.amount);
    if (toCents(line.amount) !== expected) {
      warnings.push(`The bank line is AED ${aed(line.amount)} but the recorded entry is AED ${aed(entry.amount)}.`);
    }
  } else if (v.manual_amount !== undefined && toCents(v.manual_amount) !== toCents(entry.amount)) {
    warnings.push(`The statement amount AED ${aed(v.manual_amount)} differs from the recorded AED ${aed(entry.amount)}.`);
  }
  if (warnings.length && !confirmed(fd)) return { confirm: warnings };

  const { error } = await supabase.from("bank_matches").insert({
    bank_line_id: v.bank_line_id ?? null,
    manual_date: v.bank_line_id ? null : v.manual_date,
    manual_amount: v.bank_line_id ? null : v.manual_amount,
    manual_ref: v.bank_line_id ? null : v.manual_ref,
    client_payment_id: v.kind === "payment" ? v.entry_id : null,
    payout_id: v.kind === "payout" ? v.entry_id : null,
    matched_amount: entry.amount,
  });
  if (error) {
    if (error.code === "23505") return { error: "This entry is already matched. Remove the old match first." };
    return dbError(error);
  }
  revalidatePath("/admin/bank");
  revalidatePath(v.kind === "payment" ? `/admin/payments/${v.entry_id}` : `/admin/payouts/${v.entry_id}`);
  return { ok: true, message: "Matched to the bank." };
}

/** One-click confirm of an auto-suggestion (plain form action). */
export async function confirmSuggestion(fd: FormData) {
  const { supabase } = await requireManager();
  const kind = z.enum(["payment", "payout"]).parse(fd.get("kind"));
  const entryId = z.string().uuid().parse(fd.get("entry_id"));
  const lineId = z.string().uuid().parse(fd.get("bank_line_id"));
  const table = kind === "payment" ? "client_payments" : "payouts";
  const { data: entry } = await supabase.from(table).select("amount, void").eq("id", entryId).maybeSingle();
  if (!entry || entry.void) return;
  await supabase.from("bank_matches").insert({
    bank_line_id: lineId,
    client_payment_id: kind === "payment" ? entryId : null,
    payout_id: kind === "payout" ? entryId : null,
    matched_amount: entry.amount,
  });
  revalidatePath("/admin/bank");
}

export async function unmatch(matchId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireManager();
  const parsed = z.object({ unmatch_reason: reqText("Reason") }).safeParse(formObject(fd));
  if (!parsed.success) return zodErrors(parsed.error);
  const { error } = await supabase
    .from("bank_matches")
    .update({ unmatched_at: new Date().toISOString(), unmatch_reason: parsed.data.unmatch_reason })
    .eq("id", matchId);
  if (error) return dbError(error);
  revalidatePath("/admin/bank");
  revalidatePath("/admin/payments");
  revalidatePath("/admin/payouts");
  return { ok: true, message: "Match removed (kept in the log)." };
}

export async function setLineIgnored(fd: FormData) {
  const { supabase } = await requireManager();
  const id = z.string().uuid().parse(fd.get("id"));
  const ignored = fd.get("ignored") === "1";
  const reason = String(fd.get("reason") ?? "").trim() || (ignored ? "Not a client/teacher transaction" : null);
  await supabase.from("bank_lines").update({ ignored, ignored_reason: ignored ? reason : null }).eq("id", id);
  revalidatePath("/admin/bank");
}
