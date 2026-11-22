import { NextResponse, type NextRequest } from "next/server";
import { getMe } from "@/lib/portal/auth";
import { byId, loadLeads, loadLedger } from "@/lib/portal/data";
import { monthlyReport, repReport, teacherReport, toCsv } from "@/lib/portal/reports";
import { METHOD_LABEL, PAYOUT_LABEL } from "@/lib/portal/types";
import { bankState } from "@/lib/ledger/balances";

export async function GET(request: NextRequest) {
  const { supabase, me } = await getMe();
  if (!supabase || !me?.staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sp = request.nextUrl.searchParams;
  const range = { from: sp.get("from") || undefined, to: sp.get("to") || undefined };
  const type = sp.get("type") ?? "monthly";
  const ledger = await loadLedger(supabase);
  const staffName = new Map(ledger.staff.map((s) => [s.id, s.full_name]));
  const students = byId(ledger.students);
  const inRange = (d: string) => (!range.from || d >= range.from) && (!range.to || d <= range.to);

  let rows: Array<Record<string, unknown>> = [];
  const withoutId = <T extends { id: string }>(r: T) => {
    const copy: Record<string, unknown> = { ...r };
    delete copy.id;
    return copy;
  };
  if (type === "reps") rows = repReport(ledger, await loadLeads(supabase), range).map(withoutId);
  else if (type === "teachers") rows = teacherReport(ledger, range).map(withoutId);
  else if (type === "monthly") rows = monthlyReport(ledger, range);
  else if (type === "payments")
    rows = ledger.payments
      .filter((p) => inRange(p.paid_on))
      .map((p) => ({
        date: p.paid_on,
        student: students.get(p.student_id)?.name ?? "",
        payer: p.payer_name ?? "",
        amount: p.amount,
        method: METHOD_LABEL[p.method],
        rep: p.rep_id ? staffName.get(p.rep_id) ?? "" : "",
        teacher_share: p.teacher_share,
        sales_pct: p.sales_pct,
        commission: p.commission,
        academy: p.academy,
        bank_ref: p.bank_ref ?? "",
        bank: bankState(p, "payment", ledger.matches),
        void: p.void ? "yes" : "",
        void_reason: p.void_reason ?? "",
        note: p.note ?? "",
        id: p.id,
      }));
  else if (type === "payouts")
    rows = ledger.payouts
      .filter((o) => inRange(o.paid_on))
      .map((o) => ({
        date: o.paid_on,
        type: PAYOUT_LABEL[o.type],
        payee: o.payee,
        amount: o.amount,
        client_payment_id: o.client_payment_id ?? "",
        bank: bankState(o, "payout", ledger.matches),
        void: o.void ? "yes" : "",
        void_reason: o.void_reason ?? "",
        note: o.note ?? "",
        id: o.id,
      }));
  else return NextResponse.json({ error: "unknown type" }, { status: 400 });

  const csv = "﻿" + toCsv(rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="seedrix-${type}${range.from ? "-" + range.from : ""}${range.to ? "-" + range.to : ""}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
