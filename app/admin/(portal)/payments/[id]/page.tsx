import Link from "next/link";
import { notFound } from "next/navigation";
import { restorePayment, savePayment, voidPayment } from "@/app/admin/actions/payments";
import { ActionForm } from "@/components/portal/action-form";
import { BankMatchPanel } from "@/components/portal/bank-match-panel";
import { MethodLabel } from "@/components/portal/bits";
import { PaymentForm } from "@/components/portal/payment-form";
import { RowHistory } from "@/components/portal/row-history";
import { Card, Field, Money, Notice, PageHeader, Pill, SectionTitle, Table, Td, Th, inputCls, linkBtnOutline, linkBtnPrimary } from "@/components/portal/ui";
import { checkPayout, paidByStudent } from "@/lib/ledger/balances";
import { fmtDate, fmtDateTime, todayDubai } from "@/lib/ledger/dates";
import { aed } from "@/lib/ledger/money";
import { isManager, requireStaff } from "@/lib/portal/auth";
import { loadBankContext } from "@/lib/portal/bank-view";
import { loadPayments, loadStaff, loadStudents, staffByUser } from "@/lib/portal/data";
import { PAYOUT_LABEL, type ClientPayment, type Payout } from "@/lib/portal/types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, me } = await requireStaff();
  const manager = isManager(me.role);
  const { data } = await supabase.from("client_payments").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const p: ClientPayment = {
    ...(data as ClientPayment),
    amount: Number(data.amount),
    teacher_share: Number(data.teacher_share),
    commission: Number(data.commission),
    academy: Number(data.academy),
    sales_pct: Number(data.sales_pct),
  };
  const [students, payments, staff, { data: outs }, { data: inv }, bank] = await Promise.all([
    loadStudents(supabase),
    loadPayments(supabase),
    loadStaff(supabase),
    supabase.from("payouts").select("*").eq("client_payment_id", id).order("paid_on"),
    p.invoice_id ? supabase.from("invoices").select("invoice_number").eq("id", p.invoice_id).maybeSingle() : Promise.resolve({ data: null }),
    loadBankContext(supabase, "payment", p, manager),
  ]);
  const payouts = ((outs ?? []) as Payout[]).map((o) => ({ ...o, amount: Number(o.amount) }));
  const student = students.find((s) => s.id === p.student_id);
  const who = staffByUser(staff);
  const staffName = new Map(staff.map((s) => [s.id, s.full_name]));
  const canEdit = !p.void || manager;

  return (
    <>
      <PageHeader
        title={`Payment · AED ${aed(p.amount)}`}
        sub={
          <span className="flex flex-wrap items-center gap-2">
            {fmtDate(p.paid_on)} ·{" "}
            {student ? (
              <Link href={`/admin/students/${student.id}`} className="font-bold text-seedrix-green underline">
                {student.name}
              </Link>
            ) : null}
            {inv?.invoice_number ? <span className="font-mono text-xs">{inv.invoice_number}</span> : null}
            {p.void ? <Pill tone="bad">Void: {p.void_reason}</Pill> : null}
          </span>
        }
      >
        {!p.void || p.invoice_id ? (
          <a href={`/admin/payments/${id}/invoice`} className={linkBtnPrimary}>
            Invoice &amp; send
          </a>
        ) : null}
        {manager ? (
          <Link href={`/admin/payouts/new?payment=${id}`} className={linkBtnOutline}>
            Record payout
          </Link>
        ) : null}
      </PageHeader>
      {sp.saved ? <Notice tone="good">Saved.</Notice> : null}
      {p.duplicate_confirmed ? <Notice tone="warn">Saved after a “possible double entry” warning was confirmed.</Notice> : null}
      {p.overpay_confirmed ? <Notice tone="warn">Saved although it took the student over the agreed fee.</Notice> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle className="mb-2">Details</SectionTitle>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-seedrix-black/55">How</dt>
            <dd>
              <MethodLabel method={p.method} />
              {p.received_by_staff_id ? ` — received by ${staffName.get(p.received_by_staff_id)}` : ""}
            </dd>
            <dt className="text-seedrix-black/55">Paid by</dt>
            <dd>{p.payer_name ?? "—"}</dd>
            <dt className="text-seedrix-black/55">Bank ref</dt>
            <dd>{p.bank_ref ?? "—"}</dd>
            <dt className="text-seedrix-black/55">Sales rep</dt>
            <dd>{p.rep_id ? staffName.get(p.rep_id) : "—"}</dd>
            {manager ? (
              <>
                <dt className="text-seedrix-black/55">Split ({p.sales_pct}% sales)</dt>
                <dd>
                  Teacher <Money value={p.teacher_share} /> · Commission <Money value={p.commission} /> · Academy{" "}
                  <Money value={p.academy} />
                </dd>
              </>
            ) : (
              <>
                <dt className="text-seedrix-black/55">Your commission</dt>
                <dd>{p.rep_id === me.staff.id ? <Money value={p.commission} /> : "—"}</dd>
              </>
            )}
            <dt className="text-seedrix-black/55">Note</dt>
            <dd>{p.note ?? "—"}</dd>
            <dt className="text-seedrix-black/55">Recorded</dt>
            <dd>
              {fmtDateTime(p.created_at)} by {p.created_by ? who.get(p.created_by) ?? "—" : "import"}
            </dd>
            {student ? (
              <>
                <dt className="text-seedrix-black/55">Student balance</dt>
                <dd>
                  Fee {aed(student.agreed_fee)} · paid {aed(paidByStudent(student.id, payments))} · left{" "}
                  {aed(student.agreed_fee - paidByStudent(student.id, payments))}
                </dd>
              </>
            ) : null}
          </dl>
        </Card>

        <BankMatchPanel
          kind="payment"
          entry={p}
          state={bank.state}
          match={bank.match}
          matchLine={bank.matchLine}
          candidates={bank.candidates}
          canMatch={manager}
          matchedByName={bank.match?.matched_by ? who.get(bank.match.matched_by) : undefined}
          history={bank.history}
        />
      </div>

      {manager ? (
      <section className="flex flex-col gap-2">
        <SectionTitle>Paid out against this payment</SectionTitle>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {(["teacher", "commission", "refund"] as const).map((t) => {
            const c = checkPayout(p, t, 0, payouts);
            return (
              <Card key={t} className="p-3 text-sm">
                <div className="font-bold">{PAYOUT_LABEL[t]}</div>
                <div>
                  Due <Money value={c.due} /> · paid <Money value={c.alreadyPaid} />
                </div>
                <div className={cn((c.remainingBefore ?? 0) < 0 && "font-bold text-red-700")}>
                  {(c.remainingBefore ?? 0) < 0 ? `Overpaid by ${aed(-(c.remainingBefore ?? 0))}` : `Left ${aed(c.remainingBefore)}`}
                </div>
              </Card>
            );
          })}
        </div>
        {payouts.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Type</Th>
                <Th>Paid to</Th>
                <Th num>Amount</Th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((o) => (
                <tr key={o.id} className={cn(o.void && "text-seedrix-black/40 line-through")}>
                  <Td>
                    <Link href={`/admin/payouts/${o.id}`} className="font-bold hover:underline">
                      {fmtDate(o.paid_on)}
                    </Link>
                  </Td>
                  <Td>{PAYOUT_LABEL[o.type]}</Td>
                  <Td>{o.payee}</Td>
                  <Td num>
                    <Money value={o.amount} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
      </section>
      ) : null}

      {canEdit && !p.void ? (
        <Card>
          <details>
            <summary className="cursor-pointer text-base font-bold text-seedrix-darkest">Edit payment</summary>
            {bank.match ? (
              <div className="mt-2">
                <Notice tone="warn">This payment was matched to the bank. Changing the amount will flag it as “Changed after confirm”.</Notice>
              </div>
            ) : null}
            <div className="mt-3">
              <PaymentForm
                action={savePayment.bind(null, id)}
                payment={p}
                students={students
                  .filter((s) => s.status !== "archived" || s.id === p.student_id)
                  .map((s) => ({ id: s.id, name: s.name, agreed_fee: s.agreed_fee, paid: paidByStudent(s.id, payments), rep_id: s.rep_id, payer_name: s.payer_name }))}
                staff={staff.filter((s) => s.active || s.id === p.rep_id).map((s) => ({ id: s.id, full_name: s.full_name }))}
                salesPct={p.sales_pct}
                today={todayDubai()}
                canAssign={manager}
              />
            </div>
          </details>
        </Card>
      ) : null}

      {!p.void ? (
        <Card>
          <details>
            <summary className="cursor-pointer text-base font-bold text-red-700">Void this payment</summary>
            <p className="mt-1 text-sm text-seedrix-black/60">Use this for mistakes or double entries. It stays visible, crossed out, and in the log.</p>
            <div className="mt-3">
              <ActionForm action={voidPayment.bind(null, id)} submitLabel="Void payment" submitVariant="secondary">
                <Field label="Reason">
                  <input className={inputCls} name="void_reason" required placeholder="Entered twice / wrong student / never received" />
                </Field>
              </ActionForm>
            </div>
          </details>
        </Card>
      ) : manager ? (
        <Card>
          <SectionTitle>Restore</SectionTitle>
          <p className="mb-2 text-sm text-seedrix-black/60">Voided by {p.voided_by ? who.get(p.voided_by) : "—"} {fmtDateTime(p.voided_at)}.</p>
          <ActionForm action={restorePayment.bind(null, id)} submitLabel="Restore payment" submitVariant="outline">
            <span />
          </ActionForm>
        </Card>
      ) : null}

      <RowHistory supabase={supabase} table="client_payments" rowId={id} who={who} />
    </>
  );
}
