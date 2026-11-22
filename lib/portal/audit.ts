import { aed } from "@/lib/ledger/money";
import type { AuditEntry } from "./types";

const IGNORE = new Set(["updated_at", "updated_by", "created_at", "created_by", "raw", "voided_at", "voided_by"]);
const MONEY = new Set([
  "amount",
  "teacher_share",
  "commission",
  "academy",
  "agreed_fee",
  "matched_amount",
  "manual_amount",
  "next_payment_amount",
  "sales_pct",
  "rate_aed",
  "balance",
  "amount_aed",
  "total_aed",
]);

export const TABLE_LABEL: Record<string, string> = {
  client_payments: "Payment",
  payouts: "Payout",
  students: "Student",
  leads: "Lead",
  lead_notes: "Lead note",
  teachers: "Teacher",
  staff: "Staff",
  settings: "Settings",
  bank_lines: "Bank line",
  bank_matches: "Bank match",
  invoices: "Invoice",
  inquiries: "Website enquiry",
};

function show(key: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (MONEY.has(key) && !Number.isNaN(Number(v))) return key === "sales_pct" ? `${Number(v)}%` : aed(Number(v));
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v);
  return s.length > 80 ? s.slice(0, 77) + "…" : s;
}

export type Change = { field: string; from: string; to: string; money: boolean };

/** Field-level before → after for an update. */
export function auditChanges(e: Pick<AuditEntry, "before" | "after" | "action">): Change[] {
  if (e.action !== "update" || !e.before || !e.after) return [];
  const out: Change[] = [];
  for (const k of Object.keys(e.after)) {
    if (IGNORE.has(k)) continue;
    const a = (e.before as Record<string, unknown>)[k];
    const b = (e.after as Record<string, unknown>)[k];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    out.push({ field: k.replace(/_/g, " "), from: show(k, a), to: show(k, b), money: MONEY.has(k) });
  }
  return out;
}

/** One-line description of what the row was. */
export function auditSummary(e: Pick<AuditEntry, "table_name" | "before" | "after" | "action">): string {
  const r = (e.after ?? e.before ?? {}) as Record<string, unknown>;
  switch (e.table_name) {
    case "client_payments":
      return `AED ${show("amount", r.amount)} on ${r.paid_on ?? ""}${r.void ? " (void: " + (r.void_reason ?? "") + ")" : ""}`;
    case "payouts":
      return `${r.type ?? ""} AED ${show("amount", r.amount)} to ${r.payee ?? ""}${r.void ? " (void: " + (r.void_reason ?? "") + ")" : ""}`;
    case "students":
      return `${r.name ?? ""} · fee ${show("agreed_fee", r.agreed_fee)}`;
    case "leads":
      return `${r.name ?? ""} · ${r.stage ?? ""}`;
    case "lead_notes":
      return show("body", r.body);
    case "bank_matches":
      return `${r.unmatched_at ? "Removed" : "Matched"} AED ${show("matched_amount", r.matched_amount)}${r.unmatch_reason ? " — " + r.unmatch_reason : ""}`;
    case "bank_lines":
      return `${r.booked_on ?? ""} AED ${show("amount", r.amount)} ${show("description", r.description)}`;
    case "staff":
      return `${r.full_name ?? ""} · ${r.role ?? ""}${r.active === false ? " (inactive)" : ""}`;
    case "teachers":
      return String(r.name ?? "");
    case "invoices":
      return `${r.invoice_number ?? ""} AED ${show("total_aed", r.total_aed)}`;
    case "inquiries":
      return `${r.full_name ?? ""} · ${r.service ?? ""}`;
    case "settings":
      return `Split ${show("sales_pct", r.sales_pct)} sales`;
    default:
      return "";
  }
}

export function auditLink(table: string, rowId: string | null, row: Record<string, unknown> | null): string | null {
  if (!rowId) return null;
  if (table === "client_payments") return `/admin/payments/${rowId}`;
  if (table === "payouts") return `/admin/payouts/${rowId}`;
  if (table === "students") return `/admin/students/${rowId}`;
  if (table === "leads") return `/admin/leads/${rowId}`;
  if (table === "lead_notes" && row?.lead_id) return `/admin/leads/${row.lead_id}`;
  if (table === "bank_matches") {
    if (row?.client_payment_id) return `/admin/payments/${row.client_payment_id}`;
    if (row?.payout_id) return `/admin/payouts/${row.payout_id}`;
  }
  return null;
}
