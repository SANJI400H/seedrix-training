import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bankState } from "@/lib/ledger/balances";
import { addDays } from "@/lib/ledger/dates";
import { toCents } from "@/lib/ledger/money";
import type { BankLine, BankMatch } from "./types";

/** Everything the BankMatchPanel needs for one payment / payout. */
export async function loadBankContext(
  supabase: SupabaseClient,
  kind: "payment" | "payout",
  entry: { id: string; amount: number; paid_on: string },
  canMatch: boolean,
) {
  const col = kind === "payment" ? "client_payment_id" : "payout_id";
  const { data: ms } = await supabase.from("bank_matches").select("*").eq(col, entry.id).order("matched_at", { ascending: false });
  const matches = ((ms ?? []) as BankMatch[]).map((m) => ({ ...m, matched_amount: Number(m.matched_amount) }));
  const match = matches.find((m) => !m.unmatched_at);
  const history = matches.filter((m) => m.unmatched_at);
  const state = bankState(entry, kind, matches);

  let matchLine: BankLine | undefined;
  let candidates: BankLine[] = [];
  if (canMatch) {
    if (match?.bank_line_id) {
      const { data } = await supabase.from("bank_lines").select("*").eq("id", match.bank_line_id).maybeSingle();
      matchLine = (data as BankLine | null) ?? undefined;
    }
    if (!match) {
      const { data: lines } = await supabase
        .from("bank_lines")
        .select("*")
        .eq("ignored", false)
        .gte("booked_on", addDays(entry.paid_on, -14))
        .lte("booked_on", addDays(entry.paid_on, 14))
        .filter("amount", kind === "payment" ? "gt" : "lt", 0);
      const { data: taken } = await supabase.from("bank_matches").select("bank_line_id").is("unmatched_at", null).not("bank_line_id", "is", null);
      const used = new Set((taken ?? []).map((t) => t.bank_line_id));
      const target = kind === "payment" ? toCents(entry.amount) : -toCents(entry.amount);
      candidates = ((lines ?? []) as BankLine[])
        .map((l) => ({ ...l, amount: Number(l.amount) }))
        .filter((l) => !used.has(l.id))
        .sort((a, b) => Math.abs(toCents(a.amount) - target) - Math.abs(toCents(b.amount) - target))
        .slice(0, 40);
    }
  }
  return { match, history, state, matchLine, candidates };
}
