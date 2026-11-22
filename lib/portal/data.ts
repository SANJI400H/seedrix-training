import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BankLine,
  BankMatch,
  ClientPayment,
  Lead,
  Payout,
  Settings,
  Staff,
  Student,
  Teacher,
} from "./types";

const PAGE = 1000; // Supabase's default max rows per request

/** Read every row of a table, paging past the 1000-row API cap. */
export async function fetchAll<T>(
  supabase: SupabaseClient,
  table: string,
  opts: { select?: string; order?: string; ascending?: boolean } = {},
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select(opts.select ?? "*");
    if (opts.order) q = q.order(opts.order, { ascending: opts.ascending ?? false });
    q = q.order("id", { ascending: true });
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export const DEFAULT_SETTINGS: Settings = {
  sales_pct: 80,
  company_name: "Seedrix LLC",
  trade_name: "Seedrix Learning",
  address: "Shams Free Zone, Sharjah, UAE",
  license_no: "2648158.01",
  bank_name: "Wio Bank",
  iban: "",
  trn: "",
  invoice_footer: "",
};

export async function loadSettings(supabase: SupabaseClient): Promise<Settings> {
  const { data } = await supabase.from("settings").select("*").maybeSingle();
  return { ...DEFAULT_SETTINGS, ...((data as Partial<Settings>) ?? {}), sales_pct: Number(data?.sales_pct ?? 80) };
}

function numify<T>(rows: T[], keys: string[]): T[] {
  for (const r of rows as Array<Record<string, unknown>>) {
    for (const k of keys) if (r[k] !== null && r[k] !== undefined) r[k] = Number(r[k]);
  }
  return rows;
}

export const loadStaff = (s: SupabaseClient) => fetchAll<Staff>(s, "staff", { order: "full_name", ascending: true });
export const loadTeachers = (s: SupabaseClient) => fetchAll<Teacher>(s, "teachers", { order: "name", ascending: true });
export const loadLeads = (s: SupabaseClient) => fetchAll<Lead>(s, "leads", { order: "created_at" });
export const loadStudents = async (s: SupabaseClient) =>
  numify(await fetchAll<Student>(s, "students", { order: "name", ascending: true }), ["agreed_fee", "next_payment_amount"]);
export const loadPayments = async (s: SupabaseClient) =>
  numify(await fetchAll<ClientPayment>(s, "client_payments", { order: "paid_on" }), [
    "amount",
    "teacher_share",
    "sales_pct",
    "commission",
    "academy",
  ]);
export const loadPayouts = async (s: SupabaseClient) =>
  numify(await fetchAll<Payout>(s, "payouts", { order: "paid_on" }), ["amount"]);
export const loadMatches = async (s: SupabaseClient) =>
  numify(await fetchAll<BankMatch>(s, "bank_matches", { order: "matched_at" }), ["matched_amount", "manual_amount"]);
export const loadBankLines = async (s: SupabaseClient) =>
  numify(await fetchAll<BankLine>(s, "bank_lines", { order: "booked_on" }), ["amount", "balance"]);

/** Everything the money screens need, in one go. */
export async function loadLedger(supabase: SupabaseClient) {
  const [settings, staff, teachers, students, payments, payouts, matches] = await Promise.all([
    loadSettings(supabase),
    loadStaff(supabase),
    loadTeachers(supabase),
    loadStudents(supabase),
    loadPayments(supabase),
    loadPayouts(supabase),
    loadMatches(supabase),
  ]);
  return { settings, staff, teachers, students, payments, payouts, matches };
}

export type Ledger = Awaited<ReturnType<typeof loadLedger>>;

export function byId<T extends { id: string }>(rows: T[]) {
  return new Map(rows.map((r) => [r.id, r]));
}

/** Map auth user id -> staff full name (for "who did it"). */
export function staffByUser(staff: Staff[]) {
  return new Map(staff.filter((s) => s.user_id).map((s) => [s.user_id as string, s.full_name]));
}
