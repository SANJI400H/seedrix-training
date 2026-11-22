"use client";

import * as React from "react";
import { ActionForm, FieldError } from "@/components/portal/action-form";
import { Field, Grid, inputCls } from "@/components/portal/ui";
import { aed } from "@/lib/ledger/money";
import { previewSplit } from "@/lib/ledger/split";
import type { ActionState } from "@/lib/portal/action-state";
import { METHOD_LABEL, OUTSIDE_ACCOUNT, PAYMENT_METHODS, type ClientPayment, type PaymentMethod } from "@/lib/portal/types";

export type StudentOption = {
  id: string;
  name: string;
  agreed_fee: number;
  paid: number;
  rep_id: string | null;
  payer_name: string | null;
};

export function PaymentForm({
  action,
  students,
  staff,
  salesPct,
  payment,
  defaultStudentId,
  defaultRepId,
  today,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  students: StudentOption[];
  staff: Array<{ id: string; full_name: string }>;
  salesPct: number;
  payment?: ClientPayment;
  defaultStudentId?: string;
  defaultRepId?: string;
  today: string;
}) {
  const [amount, setAmount] = React.useState(payment ? String(payment.amount) : "");
  const [teacher, setTeacher] = React.useState(payment ? String(payment.teacher_share) : "");
  const [studentId, setStudentId] = React.useState(payment?.student_id ?? defaultStudentId ?? "");
  const [method, setMethod] = React.useState<PaymentMethod>(payment?.method ?? "bank_transfer");
  const [repId, setRepId] = React.useState(payment?.rep_id ?? students.find((s) => s.id === defaultStudentId)?.rep_id ?? defaultRepId ?? "");
  const pct = payment ? payment.sales_pct : salesPct;
  const split = previewSplit(Number(amount || 0), Number(teacher || 0), pct);
  const student = students.find((s) => s.id === studentId);
  const paidBefore = student ? student.paid - (payment && payment.student_id === student.id && !payment.void ? payment.amount : 0) : 0;
  const after = paidBefore + Number(amount || 0);

  return (
    <ActionForm action={action} submitLabel={payment ? "Save changes" : "Save payment"}>
      <Grid>
        <Field label="Date received">
          <input className={inputCls} type="date" name="paid_on" required defaultValue={payment?.paid_on ?? today} max={today} />
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
      </Grid>
      <Field label="Student">
        <select
          className={inputCls}
          name="student_id"
          required
          value={studentId}
          onChange={(e) => {
            setStudentId(e.target.value);
            const s = students.find((x) => x.id === e.target.value);
            if (s?.rep_id && !payment) setRepId(s.rep_id);
          }}
        >
          <option value="">Choose a student…</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          {!payment ? <option value="__new">+ New student</option> : null}
        </select>
      </Field>
      {studentId === "__new" ? (
        <Grid>
          <Field label="New student name">
            <input className={inputCls} name="new_student_name" required />
            <FieldError name="new_student_name" />
          </Field>
          <Field label="Agreed course fee (AED)">
            <input className={inputCls} name="new_student_fee" type="number" step="0.01" min="0" inputMode="decimal" />
          </Field>
        </Grid>
      ) : null}
      {student ? (
        <div className="rounded-[8px] bg-seedrix-darkest/[0.04] px-3 py-2 text-sm">
          Agreed fee <b className="font-mono">{aed(student.agreed_fee)}</b> · paid before this{" "}
          <b className="font-mono">{aed(paidBefore)}</b> · after this{" "}
          <b className={`font-mono ${student.agreed_fee > 0 && after > student.agreed_fee + 0.004 ? "text-red-700" : ""}`}>{aed(after)}</b>
          {student.agreed_fee > 0 ? (
            <>
              {" "}
              · balance left <b className="font-mono">{aed(student.agreed_fee - after)}</b>
            </>
          ) : null}
        </div>
      ) : null}
      <Grid>
        <Field label="Paid by (name on the transfer)">
          <input className={inputCls} name="payer_name" defaultValue={payment?.payer_name ?? student?.payer_name ?? ""} key={studentId} />
        </Field>
        <Field label="How">
          <select className={inputCls} name="method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {METHOD_LABEL[m]}
              </option>
            ))}
          </select>
        </Field>
      </Grid>
      {OUTSIDE_ACCOUNT.includes(method) ? (
        <div className="rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          This money did not go into the company account. It will be flagged on the dashboard until it is deposited and
          matched.
        </div>
      ) : null}
      {method === "staff" ? (
        <Field label="Which staff member received it?">
          <select className={inputCls} name="received_by_staff_id" defaultValue={payment?.received_by_staff_id ?? ""} required>
            <option value="">Choose…</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>
          <FieldError name="received_by_staff_id" />
        </Field>
      ) : null}
      <Grid>
        <Field label="Sales rep">
          <select className={inputCls} name="rep_id" value={repId} onChange={(e) => setRepId(e.target.value)}>
            <option value="">—</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Bank reference (optional)">
          <input className={inputCls} name="bank_ref" defaultValue={payment?.bank_ref ?? ""} inputMode="numeric" />
        </Field>
      </Grid>
      <Field label="Teacher's share of this payment (AED)" hint="Commission and academy share are worked out from what is left.">
        <input
          className={inputCls}
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          name="teacher_share"
          required
          value={teacher}
          onChange={(e) => setTeacher(e.target.value)}
        />
        <FieldError name="teacher_share" />
      </Field>
      <div className="grid grid-cols-3 gap-2 rounded-[8px] bg-seedrix-darkest/[0.04] p-3 text-xs">
        {split.error === null ? (
          <>
            <div>
              Teacher
              <b className="block font-mono text-base">{aed(split.teacherShare)}</b>
            </div>
            <div>
              Commission {pct}%<b className="block font-mono text-base">{aed(split.commission)}</b>
            </div>
            <div>
              Academy {100 - pct}%<b className="block font-mono text-base">{aed(split.academy)}</b>
            </div>
          </>
        ) : (
          <div className="col-span-3 text-sm font-bold text-red-700">{amount ? split.error : "Enter the amount to see the split."}</div>
        )}
      </div>
      <Field label="Note">
        <input className={inputCls} name="note" defaultValue={payment?.note ?? ""} placeholder="e.g. 12 classes, renewal, 2 of 3 instalments" />
      </Field>
    </ActionForm>
  );
}
