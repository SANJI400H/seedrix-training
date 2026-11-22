import { toCents } from "./money";
import type { BankLineLike, MatchLike, PaymentLike, PayoutLike } from "./types";

// ---------------------------------------------------------------------------
// Wio CSV parsing
// ---------------------------------------------------------------------------

export const WIO_COLUMNS = [
  "Account name",
  "Account type",
  "Account IBAN",
  "Account number",
  "Card number",
  "Account currency",
  "Transaction type",
  "Date",
  "Ref. number",
  "Description",
  "Amount",
  "Balance",
  "Original ref. number",
  "Notes",
] as const;

export type ParsedBankLine = {
  booked_on: string;
  ref: string;
  txn_type: string;
  kind: "transfer" | "card" | "fee" | "other";
  description: string;
  amount: number;
  balance: number | null;
  original_ref: string | null;
  notes: string | null;
  raw: Record<string, string>;
};

export type ParseResult = {
  lines: ParsedBankLine[];
  errors: string[];
  account: { name: string; iban: string; currency: string } | null;
};

/** RFC 4180-ish CSV parser (quotes, escaped quotes, CRLF, BOM). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

const na = (v: string | undefined) => {
  const t = (v ?? "").trim();
  return t === "" || t.toUpperCase() === "N/A" ? null : t;
};

function parseAmount(v: string | undefined): number | null {
  const t = (v ?? "").replace(/,/g, "").replace(/AED/i, "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Accepts YYYY-MM-DD, DD/MM/YYYY and DD-MM-YYYY (Wio exports ISO). */
export function parseBankDate(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

function kindOf(type: string): ParsedBankLine["kind"] {
  const t = type.toLowerCase();
  if (t.startsWith("transfer")) return "transfer";
  if (t.startsWith("card")) return "card";
  if (t.startsWith("fee")) return "fee";
  return "other";
}

export function parseWioCsv(text: string): ParseResult {
  const rows = parseCsv(text);
  const errors: string[] = [];
  if (rows.length === 0) return { lines: [], errors: ["The file is empty"], account: null };
  const header = rows[0].map((h) => h.trim());
  const idx = (name: string) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const required = ["Date", "Ref. number", "Description", "Amount"];
  const missing = required.filter((r) => idx(r) < 0);
  if (missing.length) {
    return {
      lines: [],
      errors: [`This doesn't look like a Wio statement export. Missing columns: ${missing.join(", ")}`],
      account: null,
    };
  }
  const lines: ParsedBankLine[] = [];
  let account: ParseResult["account"] = null;
  const seen = new Set<string>();
  rows.slice(1).forEach((r, i) => {
    const rowNo = i + 2;
    const raw: Record<string, string> = {};
    header.forEach((h, j) => (raw[h] = (r[j] ?? "").trim()));
    const date = parseBankDate(raw["Date"]);
    const ref = na(raw["Ref. number"]);
    const amount = parseAmount(raw["Amount"]);
    if (!date || !ref || amount === null) {
      errors.push(`Row ${rowNo}: missing date, reference or amount — skipped`);
      return;
    }
    if (seen.has(ref)) {
      errors.push(`Row ${rowNo}: reference ${ref} appears twice in this file — kept the first`);
      return;
    }
    seen.add(ref);
    if (!account && raw["Account name"]) {
      account = {
        name: raw["Account name"],
        iban: raw["Account IBAN"] ?? "",
        currency: raw["Account currency"] ?? "AED",
      };
    }
    const txnType = raw["Transaction type"] ?? "";
    lines.push({
      booked_on: date,
      ref,
      txn_type: txnType,
      kind: kindOf(txnType),
      description: raw["Description"] ?? "",
      amount,
      balance: parseAmount(raw["Balance"]),
      original_ref: na(raw["Original ref. number"]),
      notes: na(raw["Notes"]),
      raw,
    });
  });
  return { lines, errors, account };
}

/** Split a statement into new lines and those whose ref is already stored. */
export function dedupeByRef<T extends { ref: string }>(lines: T[], existingRefs: Iterable<string>) {
  const have = new Set(existingRefs);
  const fresh: T[] = [];
  const duplicates: T[] = [];
  for (const l of lines) (have.has(l.ref) ? duplicates : fresh).push(l);
  return { fresh, duplicates };
}

// ---------------------------------------------------------------------------
// Name similarity + match suggestions
// ---------------------------------------------------------------------------

const STOP = new Set(["from", "to", "mr", "mrs", "ms", "umm", "um", "abu", "al", "el", "bin", "the", "and", "for"]);

export function nameTokens(s: string | null | undefined): string[] {
  return (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

/** 0..1 — share of the shorter token set that appears (or prefixes) in the other. */
export function nameSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const A = nameTokens(a);
  const B = nameTokens(b);
  if (!A.length || !B.length) return 0;
  const [small, big] = A.length <= B.length ? [A, B] : [B, A];
  let hits = 0;
  for (const t of small) {
    if (big.some((u) => u === t || (t.length >= 4 && (u.startsWith(t) || t.startsWith(u))))) hits++;
  }
  return hits / small.length;
}

function dayDiff(a: string, b: string) {
  return Math.round(
    Math.abs(Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86400000,
  );
}

export type LedgerEntry =
  | { kind: "payment"; entry: PaymentLike; name: string }
  | { kind: "payout"; entry: PayoutLike; name: string };

export type Suggestion = {
  bankLineId: string;
  kind: "payment" | "payout";
  entryId: string;
  score: number;
  days: number;
  nameScore: number;
};

/**
 * Suggest matches: same amount (payments are money in, payouts money out),
 * dated within ±`window` days, ranked by name similarity then date distance.
 * Only unmatched lines/entries are considered. Each entry is suggested once.
 */
export function suggestMatches(
  lines: BankLineLike[],
  entries: LedgerEntry[],
  matches: MatchLike[],
  window = 3,
): Suggestion[] {
  const matchedPayments = new Set(
    matches.filter((m) => !m.unmatched_at && m.client_payment_id).map((m) => m.client_payment_id),
  );
  const matchedPayouts = new Set(
    matches.filter((m) => !m.unmatched_at && m.payout_id).map((m) => m.payout_id),
  );
  const matchedLines = new Set(matches.filter((m) => !m.unmatched_at && m.bank_line_id).map((m) => m.bank_line_id));

  const candidates: Suggestion[] = [];
  for (const line of lines) {
    if (line.ignored || matchedLines.has(line.id)) continue;
    const lc = toCents(line.amount);
    for (const e of entries) {
      if (e.entry.void) continue;
      if (e.kind === "payment" && matchedPayments.has(e.entry.id)) continue;
      if (e.kind === "payout" && matchedPayouts.has(e.entry.id)) continue;
      const signed = e.kind === "payment" ? toCents(e.entry.amount) : -toCents(e.entry.amount);
      if (signed !== lc) continue;
      const days = dayDiff(line.booked_on, e.entry.paid_on);
      if (days > window) continue;
      const nameScore = nameSimilarity(line.description, e.name);
      const score = nameScore * 10 + (window - days);
      candidates.push({ bankLineId: line.id, kind: e.kind, entryId: e.entry.id, score, days, nameScore });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const usedLines = new Set<string>();
  const usedEntries = new Set<string>();
  const out: Suggestion[] = [];
  for (const c of candidates) {
    if (usedLines.has(c.bankLineId) || usedEntries.has(c.entryId)) continue;
    usedLines.add(c.bankLineId);
    usedEntries.add(c.entryId);
    out.push(c);
  }
  return out;
}

/** Bank lines with no active match (receipts nobody recorded, payouts nobody logged). */
export function unmatchedBankLines<T extends BankLineLike>(lines: T[], matches: MatchLike[]): T[] {
  const matched = new Set(matches.filter((m) => !m.unmatched_at && m.bank_line_id).map((m) => m.bank_line_id));
  return lines.filter((l) => !l.ignored && !matched.has(l.id));
}

/** Non-void ledger entries with no active bank match. */
export function unmatchedEntries<T extends LedgerEntry>(entries: T[], matches: MatchLike[]): T[] {
  const mp = new Set(matches.filter((m) => !m.unmatched_at && m.client_payment_id).map((m) => m.client_payment_id));
  const mo = new Set(matches.filter((m) => !m.unmatched_at && m.payout_id).map((m) => m.payout_id));
  return entries.filter(
    (e) => !e.entry.void && !(e.kind === "payment" ? mp.has(e.entry.id) : mo.has(e.entry.id)),
  );
}
