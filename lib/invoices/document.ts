import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { courseBalance, invoiceProgress, vatParts } from "@/lib/ledger/invoice";
import type { Client, ClientPayment, Invoice, Settings, Student } from "@/lib/portal/types";
import { DEFAULT_SETTINGS } from "@/lib/portal/data";

export type InvoiceDoc = {
  invoice: Invoice;
  student: Student | null;
  client: Client | null;
  settings: Settings;
  /** payments recorded against this invoice */
  payments: ClientPayment[];
  progress: ReturnType<typeof invoiceProgress>;
  vat: ReturnType<typeof vatParts>;
  course: ReturnType<typeof courseBalance> | null;
  amended: boolean;
};

const n = (v: unknown) => Number(v ?? 0);

/**
 * Everything needed to render / send one client invoice. Works with the
 * portal (RLS) client or the service-role client for the public page.
 */
export async function loadInvoiceDoc(db: SupabaseClient, invoiceId: string): Promise<InvoiceDoc | null> {
  const { data: inv } = await db.from("invoices").select("*").eq("id", invoiceId).maybeSingle();
  if (!inv) return null;
  const invoice = { ...(inv as Invoice), amount_aed: n(inv.amount_aed), vat_aed: n(inv.vat_aed), total_aed: n(inv.total_aed), amount_paid: n(inv.amount_paid), vat_rate: n(inv.vat_rate) };
  const [{ data: st }, { data: cfg }, { data: pays }] = await Promise.all([
    invoice.student_id ? db.from("students").select("*").eq("id", invoice.student_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from("settings").select("*").maybeSingle(),
    db.from("client_payments").select("*").eq("invoice_id", invoiceId).order("paid_on"),
  ]);
  const student = st ? ({ ...(st as Student), agreed_fee: n(st.agreed_fee) } as Student) : null;
  const { data: cl } = student?.client_id
    ? await db.from("clients").select("*").eq("id", student.client_id).maybeSingle()
    : invoice.client_id
      ? await db.from("clients").select("*").eq("id", invoice.client_id).maybeSingle()
      : { data: null };
  const { data: allPays } = student
    ? await db.from("client_payments").select("id, amount, void, paid_on").eq("student_id", student.id)
    : { data: [] };
  const settings: Settings = { ...DEFAULT_SETTINGS, ...((cfg as Partial<Settings>) ?? {}), vat_rate: n(cfg?.vat_rate ?? 5), sales_pct: n(cfg?.sales_pct ?? 80) };
  const payments = ((pays ?? []) as ClientPayment[]).map((p) => ({ ...p, amount: n(p.amount) }));
  const kind = invoice.kind === "receipt" ? "receipt" : "bill";
  const progress = invoiceProgress(invoice.total_aed, payments, kind);
  const asOf = kind === "receipt" ? (payments.at(-1)?.paid_on ?? invoice.created_at.slice(0, 10)) : undefined;
  const course = student
    ? courseBalance(student.agreed_fee, ((allPays ?? []) as Array<{ amount: unknown; void: boolean; paid_on: string }>).map((p) => ({ ...p, amount: n(p.amount) })), asOf)
    : null;
  // VAT parts as stored on the invoice when issued
  const vat = { net: invoice.amount_aed, vat: invoice.vat_aed, total: invoice.total_aed, rate: invoice.vat_rate };
  const amended = kind === "receipt" && payments.length > 0 && Math.round(progress.paid * 100) !== Math.round(invoice.total_aed * 100);
  return { invoice, student, client: (cl as Client | null) ?? null, settings, payments, progress, vat, course, amended };
}

export function publicInvoiceUrl(invoiceId: string, locale: "en" | "ar" = "en") {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/${locale}/payment/invoice/${invoiceId}`;
}
