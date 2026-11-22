import Link from "next/link";
import { BankPill } from "@/components/portal/bits";
import { Card, Kpi, Notice, PageHeader, Pill, SectionTitle, linkBtnOutline, linkBtnPrimary } from "@/components/portal/ui";
import { unmatchedBankLines } from "@/lib/ledger/bank";
import { bankState, overdueBalances, payoutsOverDue, totals } from "@/lib/ledger/balances";
import { fmtDate, monthStartDubai, todayDubai } from "@/lib/ledger/dates";
import { aed, toCents } from "@/lib/ledger/money";
import { isManager, requireStaff } from "@/lib/portal/auth";
import { byId, loadBankLines, loadLeads, loadLedger } from "@/lib/portal/data";
import { METHOD_LABEL, OUTSIDE_ACCOUNT, PAYOUT_LABEL } from "@/lib/portal/types";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

type Item = { tone: "bad" | "warn"; text: string; href?: string };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const { supabase, me } = await requireStaff();
  const sp = await searchParams;
  const manager = isManager(me.role);
  const [ledger, leads, bankLines] = await Promise.all([
    loadLedger(supabase),
    loadLeads(supabase),
    manager ? loadBankLines(supabase) : Promise.resolve([]),
  ]);
  const { payments, payouts, students, matches } = ledger;
  const today = todayDubai();
  const monthStart = monthStartDubai();
  const studentById = byId(students);

  const t = totals(payments, payouts, students);
  const livePayments = payments.filter((p) => !p.void);
  const livePayouts = payouts.filter((o) => !o.void);
  const inThisMonth = livePayments.filter((p) => p.paid_on >= monthStart).reduce((a, p) => a + toCents(p.amount), 0) / 100;
  const followUps = leads.filter(
    (l) => l.next_follow_up && l.next_follow_up <= today && l.stage !== "enrolled" && l.stage !== "lost",
  );

  const items: Item[] = [];
  const changed =
    livePayments.filter((p) => bankState(p, "payment", matches) === "changed").length +
    livePayouts.filter((o) => bankState(o, "payout", matches) === "changed").length;
  if (changed)
    items.push({ tone: "bad", text: `${changed} bank-confirmed entr${changed > 1 ? "ies were" : "y was"} edited afterwards — the amount no longer matches the bank.`, href: "/admin/payments?bank=changed" });
  const outside = livePayments.filter((p) => OUTSIDE_ACCOUNT.includes(p.method));
  if (outside.length)
    items.push({
      tone: "bad",
      text: `${outside.length} payment${outside.length > 1 ? "s" : ""} (AED ${aed(outside.reduce((a, p) => a + p.amount, 0))}) taken as cash or paid to a staff member — money outside the account.`,
      href: "/admin/payments?method=outside",
    });
  const over = payoutsOverDue(payments, payouts);
  if (over.length)
    items.push({
      tone: "bad",
      text: `${over.length} client payment${over.length > 1 ? "s have" : " has"} more paid out than due (AED ${aed(over.reduce((a, o) => a + o.overBy, 0))} over: ${over
        .map((o) => PAYOUT_LABEL[o.type].toLowerCase())
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .join(", ")}).`,
      href: "/admin/payouts?over=1",
    });
  const unmatchedIn = livePayments.filter((p) => bankState(p, "payment", matches) === "none" && !OUTSIDE_ACCOUNT.includes(p.method));
  if (unmatchedIn.length)
    items.push({
      tone: "warn",
      text: `${unmatchedIn.length} payment${unmatchedIn.length > 1 ? "s" : ""} (AED ${aed(unmatchedIn.reduce((a, p) => a + p.amount, 0))}) not yet matched to the bank statement.`,
      href: "/admin/payments?bank=none",
    });
  const unlinked = livePayouts.filter((o) => (o.type === "teacher" || o.type === "commission") && !o.client_payment_id);
  if (unlinked.length)
    items.push({
      tone: "warn",
      text: `${unlinked.length} teacher/commission payout${unlinked.length > 1 ? "s are" : " is"} not linked to a client payment.`,
      href: "/admin/payouts?linked=no",
    });
  const overdue = overdueBalances(students, payments, today);
  if (overdue.length)
    items.push({
      tone: "warn",
      text: `${overdue.length} client${overdue.length > 1 ? "s have" : " has"} an overdue balance (AED ${aed(overdue.reduce((a, o) => a + o.balance, 0))}).`,
      href: "/admin/students?filter=overdue",
    });
  if (manager) {
    const unmatchedCredits = unmatchedBankLines(bankLines, matches).filter((l) => l.amount > 0);
    if (unmatchedCredits.length)
      items.push({
        tone: "bad",
        text: `${unmatchedCredits.length} money-in line${unmatchedCredits.length > 1 ? "s" : ""} on the bank statement (AED ${aed(unmatchedCredits.reduce((a, l) => a + l.amount, 0))}) not recorded against any client.`,
        href: "/admin/bank",
      });
  }

  const recent = [
    ...livePayments.map((p) => ({ d: p.paid_on, at: p.created_at, kind: "in" as const, p })),
    ...livePayouts.map((o) => ({ d: o.paid_on, at: o.created_at, kind: "out" as const, o })),
  ]
    .sort((a, b) => (b.d + b.at).localeCompare(a.d + a.at))
    .slice(0, 8);

  return (
    <>
      <PageHeader title="Dashboard" sub="Everything recorded so far. Bank ✓ means the owner matched it to the Wio statement.">
        <Link href="/admin/payments/new" className={linkBtnPrimary}>
          Record payment
        </Link>
        <Link href="/admin/payouts/new" className={linkBtnOutline}>
          Record payout
        </Link>
      </PageHeader>
      {sp.denied ? <Notice tone="bad">That page is for the owner or an admin.</Notice> : null}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Kpi hero label="Should be in the account" value={t.shouldBeInAccount} note="Money in minus money paid out" />
        <Kpi label="Money in this month" value={inThisMonth} note={`AED ${aed(t.moneyIn)} all time`} href="/admin/payments" />
        <Kpi
          label="Teachers still owed"
          value={t.teacherOwed}
          tone={t.teacherOwed < 0 ? "bad" : undefined}
          note={`Due ${aed(t.teacherDue)} · paid ${aed(t.teacherPaid)}`}
        />
        <Kpi
          label="Commission still owed"
          value={t.commissionOwed}
          tone={t.commissionOwed < 0 ? "bad" : undefined}
          note={`Due ${aed(t.commissionDue)} · paid ${aed(t.commissionPaid)}`}
        />
        <Kpi label="Academy share" value={t.academy} note={`${100 - ledger.settings.sales_pct}% after teacher pay`} />
        <Kpi label="Clients still owe" value={t.clientsOwe} note="Agreed fees not yet paid" href="/admin/students?filter=owes" />
        <Kpi label="Refunds + other out" value={t.refunds + t.other} note={`Refunds ${aed(t.refunds)}`} href="/admin/payouts" />
        <Link href="/admin/leads?due=1" className="block">
          <div className="h-full rounded-[12px] border border-seedrix-darkest/10 bg-seedrix-white p-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-seedrix-black/55">Follow-ups due today</div>
            <div className={`mt-1 font-mono text-lg font-bold md:text-xl ${followUps.length ? "text-amber-700" : ""}`}>
              {followUps.length}
            </div>
            <div className="mt-0.5 text-xs text-seedrix-black/55">Leads to call or message</div>
          </div>
        </Link>
      </div>

      <Card>
        <SectionTitle>Needs attention</SectionTitle>
        <ul className="mt-3 flex flex-col gap-2">
          {items.length ? (
            items.map((i) => (
              <li key={i.text} className="flex items-baseline gap-2 text-sm">
                <Pill tone={i.tone}>{i.tone === "bad" ? "Check" : "To do"}</Pill>
                {i.href ? (
                  <Link href={i.href} className="hover:underline">
                    {i.text}
                  </Link>
                ) : (
                  <span>{i.text}</span>
                )}
              </li>
            ))
          ) : (
            <li className="flex items-baseline gap-2 text-sm">
              <Pill tone="good">All clear</Pill>
              <span>Nothing waiting.</span>
            </li>
          )}
        </ul>
      </Card>

      {followUps.length ? (
        <Card>
          <SectionTitle>Follow-ups due</SectionTitle>
          <ul className="mt-2 divide-y divide-seedrix-darkest/10">
            {followUps.slice(0, 10).map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <Link href={`/admin/leads/${l.id}`} className="min-w-0 truncate font-bold hover:underline">
                  {l.name}
                </Link>
                <span className={l.next_follow_up! < today ? "text-red-700" : "text-seedrix-black/60"}>
                  {fmtDate(l.next_follow_up)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <section className="flex flex-col gap-2">
        <SectionTitle>Latest entries</SectionTitle>
        <Card className="p-0">
          {recent.length ? (
            <ul className="divide-y divide-seedrix-darkest/10">
              {recent.map((r) =>
                r.kind === "in" ? (
                  <li key={r.p.id}>
                    <Link href={`/admin/payments/${r.p.id}`} className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-seedrix-darkest/[0.02]">
                      <span className="w-20 shrink-0 text-seedrix-black/55">{fmtDate(r.p.paid_on)}</span>
                      <span className="min-w-0 flex-1 truncate">
                        {studentById.get(r.p.student_id)?.name ?? r.p.payer_name ?? "Client"} paid
                        <span className="text-seedrix-black/50"> · {METHOD_LABEL[r.p.method]}</span>
                      </span>
                      <BankPill state={bankState(r.p, "payment", matches)} />
                      <span className="w-24 shrink-0 text-right font-mono text-seedrix-dark-green">+{aed(r.p.amount)}</span>
                    </Link>
                  </li>
                ) : (
                  <li key={r.o.id}>
                    <Link href={`/admin/payouts/${r.o.id}`} className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-seedrix-darkest/[0.02]">
                      <span className="w-20 shrink-0 text-seedrix-black/55">{fmtDate(r.o.paid_on)}</span>
                      <span className="min-w-0 flex-1 truncate">
                        {PAYOUT_LABEL[r.o.type]} · {r.o.payee}
                      </span>
                      <BankPill state={bankState(r.o, "payout", matches)} />
                      <span className="w-24 shrink-0 text-right font-mono">−{aed(r.o.amount)}</span>
                    </Link>
                  </li>
                ),
              )}
            </ul>
          ) : (
            <div className="px-4 py-8 text-center text-sm text-seedrix-black/60">
              <div className="mb-1 font-bold text-seedrix-darkest">No entries yet</div>
              Record the first client payment with “Record payment”.
            </div>
          )}
        </Card>
      </section>
    </>
  );
}
