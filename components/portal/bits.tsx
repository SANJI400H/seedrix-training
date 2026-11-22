import { STATUS_LABEL } from "@/lib/ledger/invoice";
import { aed } from "@/lib/ledger/money";
import type { BankState } from "@/lib/ledger/balances";
import { METHOD_LABEL, OUTSIDE_ACCOUNT, STAGE_LABEL, type LeadStage, type PaymentMethod } from "@/lib/portal/types";
import { Pill } from "./ui";

export function BankPill({ state, isVoid }: { state: BankState; isVoid?: boolean }) {
  if (isVoid) return <Pill tone="muted">Void</Pill>;
  if (state === "ok") return <Pill tone="good">Bank ✓</Pill>;
  if (state === "changed") return <Pill tone="bad">Changed after confirm</Pill>;
  return <Pill tone="muted">Not matched</Pill>;
}

export function MethodLabel({ method }: { method: PaymentMethod }) {
  const outside = OUTSIDE_ACCOUNT.includes(method);
  return outside ? <Pill tone="bad">{METHOD_LABEL[method]}</Pill> : <span>{METHOD_LABEL[method]}</span>;
}

export function BalancePill({ fee, paid }: { fee: number; paid: number }) {
  const b = Math.round((fee - paid) * 100);
  if (fee === 0) return paid > 0 ? <Pill tone="warn">No fee set</Pill> : <Pill tone="muted">No fee set</Pill>;
  if (b > 0) return <Pill tone="warn">Owes {aed(b / 100)}</Pill>;
  if (b < 0) return <Pill tone="bad">Over by {aed(-b / 100)}</Pill>;
  return <Pill tone="good">Paid</Pill>;
}

const stageTone: Record<LeadStage, "muted" | "info" | "warn" | "good" | "bad"> = {
  new: "info",
  contacted: "muted",
  trial_booked: "warn",
  trial_done: "warn",
  enrolled: "good",
  lost: "bad",
};

export function StagePill({ stage }: { stage: LeadStage }) {
  return <Pill tone={stageTone[stage]}>{STAGE_LABEL[stage]}</Pill>;
}

export function waLink(phone: string | null | undefined) {
  const d = (phone ?? "").replace(/\D/g, "");
  if (!d) return null;
  const intl = d.startsWith("00") ? d.slice(2) : d.startsWith("0") ? "971" + d.slice(1) : d.length === 9 ? "971" + d : d;
  return `https://wa.me/${intl}`;
}

export function telLink(phone: string | null | undefined) {
  const d = (phone ?? "").replace(/[^\d+]/g, "");
  return d ? `tel:${d}` : null;
}

export function ContactLinks({ phone }: { phone: string | null | undefined }) {
  const wa = waLink(phone);
  const tel = telLink(phone);
  if (!wa && !tel) return null;
  return (
    <span className="inline-flex gap-2">
      {wa ? (
        <a href={wa} target="_blank" rel="noopener noreferrer" className="rounded-[6px] bg-[#25D366]/15 px-2 py-1 text-xs font-bold text-[#0b7a3b]">
          WhatsApp
        </a>
      ) : null}
      {tel ? (
        <a href={tel} className="rounded-[6px] bg-seedrix-darkest/5 px-2 py-1 text-xs font-bold text-seedrix-darkest">
          Call
        </a>
      ) : null}
    </span>
  );
}

export function InvoiceStatusPill({ status }: { status: string }) {
  const tone = status === "paid" ? "good" : status === "partial" ? "warn" : status === "cancelled" ? "muted" : "bad";
  return <Pill tone={tone}>{STATUS_LABEL[status] ?? status}</Pill>;
}
