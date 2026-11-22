import Link from "next/link";
import { BankPill } from "@/components/portal/bits";
import { Card, Kpi, Notice, PageHeader, Pill, SectionTitle, linkBtnOutline, linkBtnPrimary } from "@/components/portal/ui";
import { unmatchedBankLines } from "@/lib/ledger/bank";
import { bankState, overdueBalances, payoutsOverDue, totals } from "@/lib/ledger/balances";
import { fmtDate, monthStartDubai, todayDubai } from "@/lib/ledger/dates";
import { aed, toCents } from "@/lib/ledger/money";
import { isManager, requireStaff } from "@/lib/portal/auth";
import { byId, loadBankLines, loadLeads, loadLedger } from "@/lib/portal/data";
import { isNewLead } from "@/lib/portal/leads";
import { StagePill } from "@/components/portal/bits";
import { METHOD_LABEL, OUTSIDE_ACCOUNT, PAYOUT_LABEL } from "@/lib/portal/types";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

type Item = { tone: "bad" | "warn"; text: string; href?: string };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const { supabase, me } = await requireStaff();
  const sp = await searchParams;
  const manager = isManager(me.role);
  if (!manager) return <SalesDashboard denied={!!sp.denied} />;
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
  const newLeads = leads.filter(isNewLead);
  const unassigned = leads.filter((l) => !l.assigned_rep_id && l.stage !== "lost" && l.stage !== "enrolled");
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
  if (unassigned.length)
    items.push({ tone: "warn", text: `${unassigned.length} open lead${unassigned.length > 1 ? "s are" : " is"} not assigned to a rep (${newLeads.length} new).`, href: "/admin/leads?queue=unassigned&view=table" });
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

/** Sales dashboard: only their own follow-ups, new leads, students with balances and commission. */
async function SalesDashboard({ denied }: { denied: boolean }) {
  const { supabase, me } = await requireStaff();
  const [ledger, leads] = await Promise.all([loadLedger(supabase), loadLeads(supabase)]);
  const today = todayDubai();
  const followUps = leads
    .filter((l) => l.next_follow_up && l.next_follow_up <= today && l.stage !== "enrolled" && l.stage !== "lost")
    .sort((a, b) => (a.next_follow_up ?? "").localeCompare(b.next_follow_up ?? ""));
  const fresh = leads.filter(isNewLead);
  const owing = ledger.students
    .filter((s) => s.status !== "archived" && s.status !== "cancelled")
    .map((s) => ({ s, balance: s.agreed_fee - ledger.payments.filter((p) => !p.void && p.student_id === s.id).reduce((a, p) => a + p.amount, 0) }))
    .filter((x) => x.balance > 0.004)
    .sort((a, b) => (a.s.next_payment_date ?? "9999").localeCompare(b.s.next_payment_date ?? "9999"));
  const myPays = ledger.payments.filter((p) => !p.void && p.rep_id === me.staff.id);
  const earned = myPays.reduce((a, p) => a + toCents(p.commission), 0) / 100;
  const paid = ledger.payouts.filter((o) => !o.void && o.type === "commission" && o.staff_id === me.staff.id).reduce((a, o) => a + toCents(o.amount), 0) / 100;
  const monthStart = monthStartDubai();
  const monthIn = ledger.payments.filter((p) => !p.void && p.paid_on >= monthStart).reduce((a, p) => a + toCents(p.amount), 0) / 100;

  return (
    <>
      <PageHeader title={`Hello ${me.staff.full_name}`} sub="Your leads, your students and your commission.">
        <Link href="/admin/leads/new" className={linkBtnOutline}>
          Add lead
        </Link>
        <Link href="/admin/payments/new" className={linkBtnPrimary}>
          Record payment
        </Link>
      </PageHeader>
      {denied ? <Notice tone="bad">That page is for the owner or an admin.</Notice> : null}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Link href="/admin/leads?due=1" className="block">
          <div className="h-full rounded-[12px] border border-seedrix-darkest/10 bg-seedrix-white p-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-seedrix-black/55">Follow-ups due</div>
            <div className={`mt-1 font-mono text-lg font-bold md:text-xl ${followUps.length ? "text-amber-700" : ""}`}>{followUps.length}</div>
            <div className="mt-0.5 text-xs text-seedrix-black/55">{fresh.length} new lead(s) not opened</div>
          </div>
        </Link>
        <Kpi label="Your students still owe" value={owing.reduce((a, x) => a + x.balance, 0)} note={`${owing.length} student(s)`} href="/admin/students?filter=owes" />
        <Kpi label="Paid in this month" value={monthIn} note="From your students" href="/admin/payments" />
        <Kpi hero label="Commission still owed to you" value={Math.round((earned - paid) * 100) / 100} note={`Earned ${aed(earned)} · paid ${aed(paid)}`} href="/admin/payouts" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle>Follow-ups due today</SectionTitle>
          <ul className="mt-2 divide-y divide-seedrix-darkest/10">
            {followUps.slice(0, 12).map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <Link href={`/admin/leads/${l.id}`} className="min-w-0 truncate font-bold hover:underline">
                  {l.name}
                </Link>
                <span className={l.next_follow_up! < today ? "shrink-0 text-red-700" : "shrink-0 text-seedrix-black/60"}>{fmtDate(l.next_follow_up)}</span>
              </li>
            ))}
            {!followUps.length ? <li className="py-2 text-sm text-seedrix-black/55">Nothing due. Nice.</li> : null}
          </ul>
        </Card>
        <Card>
          <SectionTitle>New leads for you</SectionTitle>
          <ul className="mt-2 divide-y divide-seedrix-darkest/10">
            {fresh.slice(0, 12).map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <Link href={`/admin/leads/${l.id}`} className="min-w-0 truncate font-bold hover:underline">
                  {l.name}
                </Link>
                <StagePill stage={l.stage} />
              </li>
            ))}
            {!fresh.length ? <li className="py-2 text-sm text-seedrix-black/55">No new leads waiting.</li> : null}
          </ul>
        </Card>
      </div>
      <Card>
        <SectionTitle>Your students with a balance due</SectionTitle>
        <ul className="mt-2 divide-y divide-seedrix-darkest/10">
          {owing.slice(0, 15).map(({ s, balance }) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <Link href={`/admin/students/${s.id}`} className="min-w-0 truncate font-bold hover:underline">
                {s.name}
              </Link>
              <span className="flex items-center gap-2">
                <span className={s.next_payment_date && s.next_payment_date < today ? "text-red-700" : "text-seedrix-black/60"}>
                  {s.next_payment_date ? `due ${fmtDate(s.next_payment_date)}` : ""}
                </span>
                <Pill tone="warn">AED {aed(balance)}</Pill>
              </span>
            </li>
          ))}
          {!owing.length ? <li className="py-2 text-sm text-seedrix-black/55">All your students are paid up.</li> : null}
        </ul>
      </Card>
    </>
  );
}
