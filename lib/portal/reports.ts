import { fromCents, toCents } from "@/lib/ledger/money";
import type { Ledger } from "./data";
import type { Lead } from "./types";

export type Range = { from?: string; to?: string };
const inRange = (d: string, r: Range) => (!r.from || d >= r.from) && (!r.to || d <= r.to);

export type RepRow = {
  id: string;
  name: string;
  leads: number;
  trials: number;
  enrolments: number;
  revenue: number;
  commissionDue: number;
  commissionPaid: number;
  commissionOwed: number;
};

export function repReport(ledger: Ledger, leads: Lead[], r: Range): RepRow[] {
  const P = ledger.payments.filter((p) => !p.void && inRange(p.paid_on, r));
  const O = ledger.payouts.filter((o) => !o.void && o.type === "commission" && inRange(o.paid_on, r));
  const L = leads.filter((l) => inRange((l.first_contact_on ?? l.created_at).slice(0, 10), r));
  const S = ledger.students.filter((s) => inRange((s.start_date ?? s.created_at).slice(0, 10), r));
  const rows: RepRow[] = ledger.staff.map((s) => {
    const mine = P.filter((p) => p.rep_id === s.id);
    const due = mine.reduce((a, p) => a + toCents(p.commission), 0);
    const paid = O.filter((o) => o.staff_id === s.id).reduce((a, o) => a + toCents(o.amount), 0);
    const myLeads = L.filter((l) => l.assigned_rep_id === s.id);
    return {
      id: s.id,
      name: s.full_name,
      leads: myLeads.length,
      trials: myLeads.filter((l) => ["trial_booked", "trial_done", "enrolled"].includes(l.stage)).length,
      enrolments: S.filter((x) => x.rep_id === s.id).length,
      revenue: fromCents(mine.reduce((a, p) => a + toCents(p.amount), 0)),
      commissionDue: fromCents(due),
      commissionPaid: fromCents(paid),
      commissionOwed: fromCents(due - paid),
    };
  });
  const noRep = P.filter((p) => !p.rep_id);
  const unassignedPaid = O.filter((o) => !o.staff_id).reduce((a, o) => a + toCents(o.amount), 0);
  if (noRep.length || unassignedPaid) {
    const due = noRep.reduce((a, p) => a + toCents(p.commission), 0);
    rows.push({
      id: "none",
      name: "No rep / not specified",
      leads: L.filter((l) => !l.assigned_rep_id).length,
      trials: 0,
      enrolments: S.filter((x) => !x.rep_id).length,
      revenue: fromCents(noRep.reduce((a, p) => a + toCents(p.amount), 0)),
      commissionDue: fromCents(due),
      commissionPaid: fromCents(unassignedPaid),
      commissionOwed: fromCents(due - unassignedPaid),
    });
  }
  return rows.filter((x) => x.leads || x.revenue || x.commissionDue || x.commissionPaid || x.enrolments);
}

export type TeacherRow = { id: string; name: string; students: number; due: number; paid: number; owed: number };

export function teacherReport(ledger: Ledger, r: Range): TeacherRow[] {
  const studentTeacher = new Map(ledger.students.map((s) => [s.id, s.teacher_id]));
  const P = ledger.payments.filter((p) => !p.void && inRange(p.paid_on, r));
  const O = ledger.payouts.filter((o) => !o.void && o.type === "teacher" && inRange(o.paid_on, r));
  const paymentById = new Map(ledger.payments.map((p) => [p.id, p]));
  const teacherOfPayout = (o: (typeof O)[number]) =>
    o.teacher_id ?? (o.client_payment_id ? studentTeacher.get(paymentById.get(o.client_payment_id)?.student_id ?? "") : null) ?? null;
  const ids = new Set<string | null>([...ledger.teachers.map((t) => t.id), null]);
  const name = new Map(ledger.teachers.map((t) => [t.id, t.name]));
  const rows: TeacherRow[] = [];
  for (const id of ids) {
    const due = P.filter((p) => (studentTeacher.get(p.student_id) ?? null) === id).reduce((a, p) => a + toCents(p.teacher_share), 0);
    const paid = O.filter((o) => teacherOfPayout(o) === id).reduce((a, o) => a + toCents(o.amount), 0);
    const students = ledger.students.filter((s) => (s.teacher_id ?? null) === id && s.status !== "archived").length;
    if (!due && !paid && (id === null || !students)) continue;
    rows.push({
      id: id ?? "none",
      name: id ? name.get(id) ?? "?" : "No teacher set on student",
      students,
      due: fromCents(due),
      paid: fromCents(paid),
      owed: fromCents(due - paid),
    });
  }
  return rows.sort((a, b) => b.owed - a.owed);
}

export type MonthRow = {
  month: string;
  moneyIn: number;
  teacherShare: number;
  commission: number;
  academy: number;
  teacherPaid: number;
  commissionPaid: number;
  refunds: number;
  other: number;
  net: number;
  payments: number;
};

export function monthlyReport(ledger: Ledger, r: Range): MonthRow[] {
  const map = new Map<string, Record<keyof Omit<MonthRow, "month">, number>>();
  const get = (m: string) => {
    let x = map.get(m);
    if (!x) {
      x = { moneyIn: 0, teacherShare: 0, commission: 0, academy: 0, teacherPaid: 0, commissionPaid: 0, refunds: 0, other: 0, net: 0, payments: 0 };
      map.set(m, x);
    }
    return x;
  };
  for (const p of ledger.payments) {
    if (p.void || !inRange(p.paid_on, r)) continue;
    const x = get(p.paid_on.slice(0, 7));
    x.moneyIn += toCents(p.amount);
    x.teacherShare += toCents(p.teacher_share);
    x.commission += toCents(p.commission);
    x.academy += toCents(p.academy);
    x.net += toCents(p.amount);
    x.payments += 1;
  }
  for (const o of ledger.payouts) {
    if (o.void || !inRange(o.paid_on, r)) continue;
    const x = get(o.paid_on.slice(0, 7));
    const c = toCents(o.amount);
    if (o.type === "teacher") x.teacherPaid += c;
    else if (o.type === "commission") x.commissionPaid += c;
    else if (o.type === "refund") x.refunds += c;
    else x.other += c;
    x.net -= c;
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, x]) => ({
      month,
      moneyIn: fromCents(x.moneyIn),
      teacherShare: fromCents(x.teacherShare),
      commission: fromCents(x.commission),
      academy: fromCents(x.academy),
      teacherPaid: fromCents(x.teacherPaid),
      commissionPaid: fromCents(x.commissionPaid),
      refunds: fromCents(x.refunds),
      other: fromCents(x.other),
      net: fromCents(x.net),
      payments: x.payments,
    }));
}

export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    // neutralise spreadsheet formulas
    const safe = /^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\r\n");
}

export type SourceRow = { key: string; leads: number; trials: number; enrolments: number; revenue: number };

/** Leads, trials, enrolments and revenue grouped by lead source or campaign. */
export function attributionReport(ledger: Ledger, leads: Lead[], r: Range, by: "source" | "campaign"): SourceRow[] {
  const L = leads.filter((l) => inRange((l.received_at ?? l.created_at).slice(0, 10), r));
  const keyOf = (l: Lead) => (by === "source" ? l.source : (l.campaign ?? "(no campaign)"));
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const map = new Map<string, SourceRow>();
  const get = (k: string) => {
    let x = map.get(k);
    if (!x) map.set(k, (x = { key: k, leads: 0, trials: 0, enrolments: 0, revenue: 0 }));
    return x;
  };
  for (const l of L) {
    const x = get(keyOf(l));
    x.leads++;
    if (["trial_booked", "trial_done", "enrolled"].includes(l.stage)) x.trials++;
    if (l.stage === "enrolled") x.enrolments++;
  }
  const studentLead = new Map(ledger.students.map((s) => [s.id, s.lead_id ? leadById.get(s.lead_id) : undefined]));
  for (const p of ledger.payments) {
    if (p.void || !inRange(p.paid_on, r)) continue;
    const l = studentLead.get(p.student_id);
    const x = get(l ? keyOf(l) : by === "source" ? "(no lead linked)" : "(no campaign)");
    x.revenue = fromCents(toCents(x.revenue) + toCents(p.amount));
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue || b.leads - a.leads);
}
