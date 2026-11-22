"use client";

import * as React from "react";
import { ActionForm, FieldError } from "@/components/portal/action-form";
import { Field, Grid, inputCls } from "@/components/portal/ui";
import { checkPayout } from "@/lib/ledger/balances";
import { aed } from "@/lib/ledger/money";
import type { PaymentLike, PayoutLike } from "@/lib/ledger/types";
import type { ActionState } from "@/lib/portal/action-state";
import { METHOD_LABEL, PAYMENT_METHODS, PAYOUT_LABEL, PAYOUT_TYPES, type Payout, type PayoutType } from "@/lib/portal/types";

export type PaymentOption = PaymentLike & { label: string; teacher_id: string | null; rep_id: string | null };

export function PayoutForm({
  action,
  payments,
  payouts,
  teachers,
  staff,
  payout,
  today,
  defaultPaymentId,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  payments: PaymentOption[];
  payouts: PayoutLike[];
  teachers: Array<{ id: string; name: string }>;
  staff: Array<{ id: string; full_name: string }>;
  payout?: Payout;
  today: string;
  defaultPaymentId?: string;
}) {
  const [type, setType] = React.useState<PayoutType>(payout?.type ?? "teacher");
  const [amount, setAmount] = React.useState(payout ? String(payout.amount) : "");
  const [paymentId, setPaymentId] = React.useState(payout?.client_payment_id ?? defaultPaymentId ?? "");
  const pay = payments.find((p) => p.id === paymentId);
  const [teacherId, setTeacherId] = React.useState(payout?.teacher_id ?? pay?.teacher_id ?? "");
  const [staffId, setStaffId] = React.useState(payout?.staff_id ?? pay?.rep_id ?? "");
  const check = checkPayout(pay, type, Number(amount || 0), payouts, payout?.id);

  function onPaymentChange(id: string) {
    setPaymentId(id);
    const p = payments.find((x) => x.id === id);
    if (!p) return;
    if (!payout) {
      if (p.teacher_id) setTeacherId(p.teacher_id);
      if (p.rep_id) setStaffId(p.rep_id);
      const c = checkPayout(p, type, 0, payouts, null);
      if (c.remainingBefore !== null && c.remainingBefore > 0 && !amount) setAmount(String(c.remainingBefore));
    }
  }

  return (
    <ActionForm action={action} submitLabel={payout ? "Save changes" : "Save payout"}>
      <Grid>
        <Field label="Date sent">
          <input className={inputCls} type="date" name="paid_on" required defaultValue={payout?.paid_on ?? today} max={today} />
        </Field>
        <Field label="Type">
          <select className={inputCls} name="type" value={type} onChange={(e) => setType(e.target.value as PayoutType)}>
            {PAYOUT_TYPES.map((t) => (
              <option key={t} value={t}>
                {PAYOUT_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
      </Grid>
      <Field label="For which client payment" hint="Link teacher pay and commission to the payment they come from.">
        <select className={inputCls} name="client_payment_id" value={paymentId} onChange={(e) => onPaymentChange(e.target.value)}>
          <option value="">Not linked</option>
          {payments.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </Field>
      {pay && check.due !== null ? (
        <div
          className={`rounded-[8px] px-3 py-2 text-sm ${check.overpay ? "border border-red-200 bg-red-50 text-red-800" : "bg-seedrix-darkest/[0.04]"}`}
        >
          {PAYOUT_LABEL[type]} on this payment: due <b className="font-mono">{aed(check.due)}</b>, already paid{" "}
          <b className="font-mono">{aed(check.alreadyPaid)}</b>.{" "}
          {check.overpay ? (
            <b>This would overpay by AED {aed(check.overBy)}. You will be asked to confirm.</b>
          ) : (
            <>
              Left after this: <b className="font-mono">{aed(check.remainingAfter)}</b>
            </>
          )}
        </div>
      ) : !pay && (type === "teacher" || type === "commission") ? (
        <div className="rounded-[8px] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Not linked: nobody will be able to check this was due. Link it if you can.
        </div>
      ) : null}
      <Grid>
        {type === "teacher" ? (
          <Field label="Teacher">
            <select className={inputCls} name="teacher_id" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
              <option value="">Choose…</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
        ) : type === "commission" ? (
          <Field label="Staff member">
            <select className={inputCls} name="staff_id" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
              <option value="">Choose…</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label={type === "teacher" || type === "commission" ? "Paid to (if different / not listed)" : "Paid to"}>
          <input
            className={inputCls}
            name="payee"
            defaultValue={payout?.payee ?? ""}
            required={type === "refund" || type === "other"}
            placeholder={type === "refund" ? "Parent's name" : ""}
          />
          <FieldError name="payee" />
        </Field>
        <Field label="Amount (AED)">
          <input
            className={inputCls}
            type="number"
            step="0.01"
            min="0.01"
            inputMode="decimal"
            name="amount"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <FieldError name="amount" />
        </Field>
        <Field label="How">
          <select className={inputCls} name="method" defaultValue={payout?.method ?? "bank_transfer"}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m === "bank_transfer" ? "Bank transfer from Wio" : METHOD_LABEL[m]}
              </option>
            ))}
          </select>
        </Field>
      </Grid>
      <Field label="Note">
        <input className={inputCls} name="note" defaultValue={payout?.note ?? ""} placeholder="e.g. paid via Karim for Ms Shadia" />
      </Field>
    </ActionForm>
  );
}
