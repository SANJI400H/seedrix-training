import Link from "next/link";
import { notFound } from "next/navigation";
import { restorePayout, savePayout, voidPayout } from "@/app/admin/actions/payouts";
import { ActionForm } from "@/components/portal/action-form";
import { BankMatchPanel } from "@/components/portal/bank-match-panel";
import { MethodLabel } from "@/components/portal/bits";
import { PayoutForm } from "@/components/portal/payout-form";
import { RowHistory } from "@/components/portal/row-history";
import { Card, Field, Money, Notice, PageHeader, Pill, SectionTitle, inputCls } from "@/components/portal/ui";
import { checkPayout } from "@/lib/ledger/balances";
import { fmtDate, fmtDateTime, todayDubai } from "@/lib/ledger/dates";
import { aed } from "@/lib/ledger/money";
import { requireManager } from "@/lib/portal/auth";
import { loadBankContext } from "@/lib/portal/bank-view";
import { byId, loadLedger, staffByUser } from "@/lib/portal/data";
import { paymentOptions, payoutLikes } from "@/lib/portal/payout-options";
import { PAYOUT_LABEL } from "@/lib/portal/types";

export const dynamic = "force-dynamic";

export default async function PayoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  // only owner/admin manage payouts; sales see their commission on the list page
  const { supabase } = await requireManager();
  const manager = true;
  const ledger = await loadLedger(supabase);
  const o = ledger.payouts.find((x) => x.id === id);
  if (!o) notFound();
  const bank = await loadBankContext(supabase, "payout", o, manager);
  const who = staffByUser(ledger.staff);
  const payment = o.client_payment_id ? byId(ledger.payments).get(o.client_payment_id) : undefined;
  const student = payment ? byId(ledger.students).get(payment.student_id) : undefined;
  const check = payment ? checkPayout(payment, o.type, 0, ledger.payouts) : null;

  return (
    <>
      <PageHeader
        title={`${PAYOUT_LABEL[o.type]} · AED ${aed(o.amount)}`}
        sub={
          <span className="flex flex-wrap items-center gap-2">
            {fmtDate(o.paid_on)} · to {o.payee}
            {o.void ? <Pill tone="bad">Void: {o.void_reason}</Pill> : null}
          </span>
        }
      />
      {sp.saved ? <Notice tone="good">Saved.</Notice> : null}
      {o.overpay_confirmed ? <Notice tone="warn">Saved after an “over what is due” warning was confirmed.</Notice> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle className="mb-2">Details</SectionTitle>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-seedrix-black/55">How</dt>
            <dd>
              <MethodLabel method={o.method} />
            </dd>
            <dt className="text-seedrix-black/55">For payment</dt>
            <dd>
              {payment ? (
                <Link href={`/admin/payments/${payment.id}`} className="font-bold text-seedrix-green underline">
                  {fmtDate(payment.paid_on)} · {student?.name} · AED {aed(payment.amount)}
                </Link>
              ) : (
                <Pill tone="warn">Not linked</Pill>
              )}
            </dd>
            {check && check.due !== null ? (
              <>
                <dt className="text-seedrix-black/55">Due vs paid</dt>
                <dd className={check.remainingBefore! < 0 ? "font-bold text-red-700" : ""}>
                  Due <Money value={check.due} /> · paid in total <Money value={check.alreadyPaid} />
                  {check.remainingBefore! < 0 ? ` · over by ${aed(-check.remainingBefore!)}` : ` · left ${aed(check.remainingBefore)}`}
                </dd>
              </>
            ) : null}
            <dt className="text-seedrix-black/55">Note</dt>
            <dd>{o.note ?? "—"}</dd>
            <dt className="text-seedrix-black/55">Recorded</dt>
            <dd>
              {fmtDateTime(o.created_at)} by {o.created_by ? who.get(o.created_by) ?? "—" : "import"}
            </dd>
          </dl>
        </Card>
        <BankMatchPanel
          kind="payout"
          entry={o}
          state={bank.state}
          match={bank.match}
          matchLine={bank.matchLine}
          candidates={bank.candidates}
          canMatch={manager}
          matchedByName={bank.match?.matched_by ? who.get(bank.match.matched_by) : undefined}
          history={bank.history}
        />
      </div>

      {!o.void ? (
        <>
          <Card>
            <details>
              <summary className="cursor-pointer text-base font-bold text-seedrix-darkest">Edit payout</summary>
              <div className="mt-3">
                <PayoutForm
                  action={savePayout.bind(null, id)}
                  payout={o}
                  payments={paymentOptions(ledger, o.client_payment_id)}
                  payouts={payoutLikes(ledger)}
                  teachers={ledger.teachers.filter((t) => t.active || t.id === o.teacher_id).map((t) => ({ id: t.id, name: t.name }))}
                  staff={ledger.staff.map((s) => ({ id: s.id, full_name: s.full_name }))}
                  today={todayDubai()}
                />
              </div>
            </details>
          </Card>
          <Card>
            <details>
              <summary className="cursor-pointer text-base font-bold text-red-700">Void this payout</summary>
              <div className="mt-3">
                <ActionForm action={voidPayout.bind(null, id)} submitLabel="Void payout" submitVariant="secondary">
                  <Field label="Reason">
                    <input className={inputCls} name="void_reason" required placeholder="Entered twice / wrong amount" />
                  </Field>
                </ActionForm>
              </div>
            </details>
          </Card>
        </>
      ) : manager ? (
        <Card>
          <SectionTitle>Restore</SectionTitle>
          <p className="mb-2 text-sm text-seedrix-black/60">
            Voided by {o.voided_by ? who.get(o.voided_by) : "—"} {fmtDateTime(o.voided_at)}.
          </p>
          <ActionForm action={restorePayout.bind(null, id)} submitLabel="Restore payout" submitVariant="outline">
            <span />
          </ActionForm>
        </Card>
      ) : null}

      <RowHistory supabase={supabase} table="payouts" rowId={id} who={who} />
    </>
  );
}
