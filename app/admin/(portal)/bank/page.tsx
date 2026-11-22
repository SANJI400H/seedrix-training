import Link from "next/link";
import { confirmSuggestion, importBankCsv, setLineIgnored } from "@/app/admin/actions/bank";
import { ActionForm } from "@/components/portal/action-form";
import { BankPill } from "@/components/portal/bits";
import { Card, Field, Kpi, PageHeader, Pill, SectionTitle, Table, Td, Th } from "@/components/portal/ui";
import { suggestMatches, unmatchedBankLines, unmatchedEntries, type LedgerEntry } from "@/lib/ledger/bank";
import { bankState } from "@/lib/ledger/balances";
import { fmtDate } from "@/lib/ledger/dates";
import { aed, sum } from "@/lib/ledger/money";
import { requireManager } from "@/lib/portal/auth";
import { byId, loadBankLines, loadLedger } from "@/lib/portal/data";
import { OUTSIDE_ACCOUNT, PAYOUT_LABEL } from "@/lib/portal/types";
import { cn } from "@/lib/utils";

export const metadata = { title: "Bank" };
export const dynamic = "force-dynamic";

export default async function BankPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { supabase } = await requireManager();
  const sp = await searchParams;
  const [ledger, lines] = await Promise.all([loadLedger(supabase), loadBankLines(supabase)]);
  const { payments, payouts, students, matches } = ledger;
  const studentById = byId(students);
  const lineById = byId(lines);
  const nameOf = (sid: string) => studentById.get(sid);

  const entries: LedgerEntry[] = [
    ...payments.map((p) => ({
      kind: "payment" as const,
      entry: p,
      name: [p.payer_name, nameOf(p.student_id)?.name, nameOf(p.student_id)?.payer_name].filter(Boolean).join(" "),
    })),
    ...payouts.map((o) => ({ kind: "payout" as const, entry: o, name: o.payee })),
  ];
  const suggestions = suggestMatches(lines, entries, matches, 3);
  const openLines = unmatchedBankLines(lines, matches);
  const openEntries = unmatchedEntries(entries, matches).filter(
    (e) => !(e.kind === "payment" && (OUTSIDE_ACCOUNT as string[]).includes(e.entry.method)),
  );
  const outsideEntries = unmatchedEntries(entries, matches).filter(
    (e) => e.kind === "payment" && (OUTSIDE_ACCOUNT as string[]).includes(e.entry.method),
  );
  const entryById = new Map(entries.map((e) => [e.entry.id, e]));
  const lastBalance = [...lines].sort((a, b) => (a.booked_on + a.ref).localeCompare(b.booked_on + b.ref)).at(-1);
  const changed = [
    ...payments.filter((p) => !p.void && bankState(p, "payment", matches) === "changed"),
    ...payouts.filter((o) => !o.void && bankState(o, "payout", matches) === "changed"),
  ];
  const showIgnored = sp.show === "ignored";

  return (
    <>
      <PageHeader
        title="Bank"
        sub="Import the Wio statement, confirm matches, and see what is on the statement but not in the ledger (and the other way round)."
      />

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Kpi hero label="Statement balance" value={lastBalance?.balance ?? 0} note={lastBalance ? `as of ${fmtDate(lastBalance.booked_on)}` : "No statement imported"} />
        <Kpi label="Money in not recorded" value={sum(openLines.filter((l) => l.amount > 0).map((l) => l.amount))} tone="bad" note={`${openLines.filter((l) => l.amount > 0).length} bank line(s)`} />
        <Kpi label="Money out not recorded" value={-sum(openLines.filter((l) => l.amount < 0).map((l) => l.amount))} tone="warn" note={`${openLines.filter((l) => l.amount < 0).length} bank line(s)`} />
        <Kpi label="Ledger entries not on statement" value={sum(openEntries.map((e) => (e.kind === "payment" ? e.entry.amount : -e.entry.amount)))} note={`${openEntries.length} entr${openEntries.length === 1 ? "y" : "ies"} (net)`} />
      </div>

      <Card>
        <SectionTitle className="mb-2">Import Wio statement (CSV)</SectionTitle>
        <ActionForm action={importBankCsv} submitLabel="Import" resetOnSuccess>
          <Field label="CSV file" hint="Wio Business → Statements → export as CSV. Lines already imported (same Ref. number) are skipped.">
            <input type="file" name="file" accept=".csv,text/csv" required className="text-sm" />
          </Field>
        </ActionForm>
      </Card>

      {changed.length ? (
        <Card className="border-red-200">
          <SectionTitle className="text-red-700">Changed after confirm</SectionTitle>
          <ul className="mt-2 text-sm">
            {changed.map((e) => (
              <li key={e.id}>
                <Link className="font-bold underline" href={"student_id" in e ? `/admin/payments/${e.id}` : `/admin/payouts/${e.id}`}>
                  {fmtDate(e.paid_on)} · AED {aed(e.amount)}
                </Link>{" "}
                no longer matches the amount confirmed against the bank.
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <section className="flex flex-col gap-2">
        <SectionTitle>Suggested matches ({suggestions.length})</SectionTitle>
        <p className="text-sm text-seedrix-black/60">Same amount, dated within 3 days; best name match first. Check each before confirming.</p>
        <Table>
          <thead>
            <tr>
              <Th>Bank line</Th>
              <Th>Ledger entry</Th>
              <Th num>AED</Th>
              <Th>Fit</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {suggestions.length ? (
              suggestions.map((s) => {
                const l = lineById.get(s.bankLineId)!;
                const e = entryById.get(s.entryId)!;
                return (
                  <tr key={s.bankLineId}>
                    <Td>
                      {fmtDate(l.booked_on)} · {l.description}
                      <div className="text-xs text-seedrix-black/50">ref {l.ref}</div>
                    </Td>
                    <Td>
                      <Link className="hover:underline" href={e.kind === "payment" ? `/admin/payments/${e.entry.id}` : `/admin/payouts/${e.entry.id}`}>
                        {fmtDate(e.entry.paid_on)} ·{" "}
                        {e.kind === "payment" ? `${nameOf(e.entry.student_id)?.name ?? "Client"} paid` : `${PAYOUT_LABEL[e.entry.type]} → ${e.entry.payee}`}
                      </Link>
                    </Td>
                    <Td num>{aed(l.amount)}</Td>
                    <Td>
                      <Pill tone={s.nameScore >= 0.5 ? "good" : "warn"}>{s.nameScore >= 0.5 ? "Name matches" : "Amount only"}</Pill>
                      <span className="ms-1 text-xs text-seedrix-black/50">{s.days}d apart</span>
                    </Td>
                    <Td>
                      <form action={confirmSuggestion}>
                        <input type="hidden" name="kind" value={s.kind} />
                        <input type="hidden" name="entry_id" value={s.entryId} />
                        <input type="hidden" name="bank_line_id" value={s.bankLineId} />
                        <button type="submit" className="rounded-[6px] bg-seedrix-green px-3 py-1.5 text-xs font-bold text-seedrix-white">
                          Confirm
                        </button>
                      </form>
                    </Td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <Td colSpan={5} className="text-center text-seedrix-black/55">
                  No suggestions right now.
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center justify-between">
            <SectionTitle>On the statement, not in the ledger ({openLines.length})</SectionTitle>
            <Link href={showIgnored ? "/admin/bank" : "/admin/bank?show=ignored"} className="text-xs font-bold text-seedrix-green">
              {showIgnored ? "Hide ignored" : "Show ignored"}
            </Link>
          </div>
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Description</Th>
                <Th num>AED</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {(showIgnored ? lines.filter((l) => l.ignored) : openLines)
                .sort((a, b) => b.booked_on.localeCompare(a.booked_on))
                .map((l) => (
                  <tr key={l.id} className={cn(l.ignored && "text-seedrix-black/45")}>
                    <Td className="whitespace-nowrap">{fmtDate(l.booked_on)}</Td>
                    <Td>
                      {l.description}
                      <div className="text-xs text-seedrix-black/50">
                        {l.txn_type} · ref {l.ref}
                        {l.notes ? ` · ${l.notes}` : ""}
                        {l.ignored ? ` · ignored: ${l.ignored_reason}` : ""}
                      </div>
                    </Td>
                    <Td num className={l.amount > 0 ? "text-seedrix-dark-green" : ""}>
                      {aed(l.amount)}
                    </Td>
                    <Td>
                      <form action={setLineIgnored} className="flex flex-col gap-1">
                        <input type="hidden" name="id" value={l.id} />
                        <input type="hidden" name="ignored" value={l.ignored ? "0" : "1"} />
                        {!l.ignored ? (
                          <input name="reason" placeholder="Why (fee, personal…)" className="h-8 w-32 rounded-[6px] border border-seedrix-darkest/15 px-2 text-xs" />
                        ) : null}
                        <button type="submit" className="text-left text-xs font-bold text-seedrix-green">
                          {l.ignored ? "Un-ignore" : "Not ledger"}
                        </button>
                      </form>
                    </Td>
                  </tr>
                ))}
              {!(showIgnored ? lines.some((l) => l.ignored) : openLines.length) ? (
                <tr>
                  <Td colSpan={4} className="text-center text-seedrix-black/55">
                    {lines.length ? "Nothing here." : "Import a statement to start."}
                  </Td>
                </tr>
              ) : null}
            </tbody>
          </Table>
          <p className="text-xs text-seedrix-black/55">
            Match a line by opening the ledger entry and choosing it under “Bank statement”. Mark bank fees, card spending and personal
            transfers as “Not ledger” so they stop showing here.
          </p>
        </section>

        <section className="flex min-w-0 flex-col gap-2">
          <SectionTitle>In the ledger, not on the statement ({openEntries.length})</SectionTitle>
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Entry</Th>
                <Th num>AED</Th>
                <Th>Bank</Th>
              </tr>
            </thead>
            <tbody>
              {openEntries
                .sort((a, b) => b.entry.paid_on.localeCompare(a.entry.paid_on))
                .map((e) => (
                  <tr key={e.entry.id}>
                    <Td className="whitespace-nowrap">{fmtDate(e.entry.paid_on)}</Td>
                    <Td>
                      <Link className="font-bold hover:underline" href={e.kind === "payment" ? `/admin/payments/${e.entry.id}` : `/admin/payouts/${e.entry.id}`}>
                        {e.kind === "payment"
                          ? `${nameOf(e.entry.student_id)?.name ?? "Client"} paid`
                          : `${PAYOUT_LABEL[e.entry.type]} → ${e.entry.payee}`}
                      </Link>
                    </Td>
                    <Td num className={e.kind === "payment" ? "text-seedrix-dark-green" : ""}>
                      {e.kind === "payment" ? aed(e.entry.amount) : aed(-e.entry.amount)}
                    </Td>
                    <Td>
                      <BankPill state="none" />
                    </Td>
                  </tr>
                ))}
              {!openEntries.length ? (
                <tr>
                  <Td colSpan={4} className="text-center text-seedrix-black/55">
                    Everything recorded is matched.
                  </Td>
                </tr>
              ) : null}
            </tbody>
          </Table>
          {outsideEntries.length ? (
            <p className="text-sm text-red-700">
              Plus {outsideEntries.length} cash / paid-to-staff payment(s) (AED {aed(sum(outsideEntries.map((e) => e.entry.amount)))}) that
              never reached the account directly.{" "}
              <Link className="font-bold underline" href="/admin/payments?method=outside">
                See them
              </Link>
            </p>
          ) : null}
        </section>
      </div>
    </>
  );
}
