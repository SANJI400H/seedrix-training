import { matchToBank, unmatch } from "@/app/admin/actions/bank";
import { ActionForm } from "@/components/portal/action-form";
import { BankPill } from "@/components/portal/bits";
import { Card, Field, Grid, SectionTitle, inputCls } from "@/components/portal/ui";
import type { BankState } from "@/lib/ledger/balances";
import { fmtDate, fmtDateTime } from "@/lib/ledger/dates";
import { aed } from "@/lib/ledger/money";
import type { BankLine, BankMatch } from "@/lib/portal/types";

/** Bank match status for one payment/payout, with match/unmatch controls for managers. */
export function BankMatchPanel({
  kind,
  entry,
  state,
  match,
  matchLine,
  candidates,
  canMatch,
  matchedByName,
  history,
}: {
  kind: "payment" | "payout";
  entry: { id: string; amount: number; paid_on: string; bank_ref?: string | null; void: boolean };
  state: BankState;
  match: BankMatch | undefined;
  matchLine: BankLine | undefined;
  candidates: BankLine[];
  canMatch: boolean;
  matchedByName?: string;
  history: BankMatch[];
}) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <SectionTitle>Bank statement</SectionTitle>
        <BankPill state={state} isVoid={entry.void} />
      </div>
      {match ? (
        <div className="mt-2 text-sm">
          <p>
            Confirmed for <b className="font-mono">AED {aed(match.matched_amount)}</b>
            {matchLine
              ? ` — Wio ${fmtDate(matchLine.booked_on)}, ref ${matchLine.ref}, “${matchLine.description ?? ""}” (AED ${aed(matchLine.amount)})`
              : ` — entered by hand: ${fmtDate(match.manual_date)}, AED ${aed(match.manual_amount)}${match.manual_ref ? `, ref ${match.manual_ref}` : ""}`}
            . {matchedByName ? `By ${matchedByName}, ` : ""}
            {fmtDateTime(match.matched_at)}.
          </p>
          {state === "changed" ? (
            <p className="mt-1 font-bold text-red-700">
              The recorded amount is now AED {aed(entry.amount)}. It was changed after the bank confirmation.
            </p>
          ) : null}
          {canMatch ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-bold text-seedrix-green">Remove this match</summary>
              <div className="mt-2">
                <ActionForm action={unmatch.bind(null, match.id)} submitLabel="Remove match" submitVariant="outline">
                  <Field label="Why?">
                    <input className={inputCls} name="unmatch_reason" required placeholder="Matched the wrong line" />
                  </Field>
                </ActionForm>
              </div>
            </details>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-sm text-seedrix-black/60">Not yet matched to the Wio statement.</p>
      )}
      {!match && canMatch && !entry.void ? (
        <div className="mt-3">
          <ActionForm action={matchToBank} submitLabel="Confirm match">
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="entry_id" value={entry.id} />
            <Field label="Statement line" hint="Imported Wio lines within 14 days, closest amount first.">
              <select className={inputCls} name="bank_line_id" defaultValue={candidates[0]?.id ?? ""}>
                <option value="">— Enter by hand below —</option>
                {candidates.map((l) => (
                  <option key={l.id} value={l.id}>
                    {fmtDate(l.booked_on)} · {aed(l.amount)} · {l.description} · ref {l.ref}
                  </option>
                ))}
              </select>
            </Field>
            <details>
              <summary className="cursor-pointer text-xs font-bold text-seedrix-black/60">No imported line? Enter it by hand</summary>
              <Grid cols={3} className="mt-2">
                <Field label="Date on statement">
                  <input className={inputCls} type="date" name="manual_date" defaultValue={entry.paid_on} />
                </Field>
                <Field label="Amount (AED)">
                  <input className={inputCls} type="number" step="0.01" name="manual_amount" defaultValue={entry.amount} />
                </Field>
                <Field label="Bank ref">
                  <input className={inputCls} name="manual_ref" defaultValue={entry.bank_ref ?? ""} />
                </Field>
              </Grid>
            </details>
          </ActionForm>
        </div>
      ) : null}
      {history.length ? (
        <div className="mt-3 border-t border-seedrix-darkest/10 pt-2 text-xs text-seedrix-black/55">
          Earlier matches removed:
          <ul className="list-disc ps-5">
            {history.map((h) => (
              <li key={h.id}>
                AED {aed(h.matched_amount)} matched {fmtDateTime(h.matched_at)}, removed {fmtDateTime(h.unmatched_at)} — {h.unmatch_reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
