import { Field, Grid, inputCls, textareaCls } from "@/components/portal/ui";
import {
  CURRICULA,
  CURRICULUM_LABEL,
  DELIVERY_LABEL,
  DELIVERY_MODES,
  STUDENT_STATUSES,
  type Client,
  type Staff,
  type Student,
  type TeacherPublic,
} from "@/lib/portal/types";

export function StudentFields({
  student,
  staff,
  teachers,
  clients,
  canAssign = true,
  defaultClientId,
}: {
  student?: Student;
  staff: Staff[];
  teachers: TeacherPublic[];
  clients: Client[];
  canAssign?: boolean;
  defaultClientId?: string;
}) {
  return (
    <>
      <Grid>
        <Field label="Student / client name">
          <input className={inputCls} name="name" required defaultValue={student?.name ?? ""} />
        </Field>
        <Field label="Phone">
          <input className={inputCls} name="phone" inputMode="tel" defaultValue={student?.phone ?? ""} />
        </Field>
        <Field label="Payer name (as on the bank transfer)">
          <input className={inputCls} name="payer_name" defaultValue={student?.payer_name ?? ""} />
        </Field>
        <Field label="Client (parent / payer)">
          <select className={inputCls} name="client_id" defaultValue={student?.client_id ?? defaultClientId ?? ""}>
            <option value="">New client with the payer name below</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.phone ? ` · ${c.phone}` : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Grade">
          <input className={inputCls} name="grade" defaultValue={student?.grade ?? ""} />
        </Field>
        <Field label="School">
          <input className={inputCls} name="school" defaultValue={student?.school ?? ""} />
        </Field>
        <Field label="Curriculum">
          <select className={inputCls} name="curriculum" defaultValue={student?.curriculum ?? ""}>
            <option value="">—</option>
            {CURRICULA.map((c) => (
              <option key={c} value={c}>
                {CURRICULUM_LABEL[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Subjects">
          <input className={inputCls} name="subjects" defaultValue={student?.subjects ?? ""} />
        </Field>
        <Field label="Delivery">
          <select className={inputCls} name="delivery_mode" defaultValue={student?.delivery_mode ?? ""}>
            <option value="">—</option>
            {DELIVERY_MODES.map((m) => (
              <option key={m} value={m}>
                {DELIVERY_LABEL[m]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Course">
          <input className={inputCls} name="course" defaultValue={student?.course ?? ""} placeholder="English, 12 classes, at home" />
        </Field>
        <Field label="Agreed total fee (AED)" hint="Balance = this fee minus all payments that are not void.">
          <input className={inputCls} name="agreed_fee" type="number" step="0.01" min="0" inputMode="decimal" required defaultValue={student?.agreed_fee ?? ""} />
        </Field>
        <Field label="Status">
          <select className={inputCls} name="status" defaultValue={student?.status ?? "active"}>
            {STUDENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </Field>
        {canAssign ? (
          <Field label="Sales rep">
            <select className={inputCls} name="rep_id" defaultValue={student?.rep_id ?? ""}>
              <option value="">—</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label="Teacher">
          <select className={inputCls} name="teacher_id" defaultValue={student?.teacher_id ?? ""}>
            <option value="">Not decided</option>
            {teachers
              .filter((t) => t.active || t.id === student?.teacher_id)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.emirate ? ` (${t.emirate})` : ""}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Schedule">
          <input className={inputCls} name="schedule" defaultValue={student?.schedule ?? ""} />
        </Field>
        <Field label="Start date">
          <input className={inputCls} name="start_date" type="date" defaultValue={student?.start_date ?? ""} />
        </Field>
        <Field label="Next payment amount (AED)">
          <input className={inputCls} name="next_payment_amount" type="number" step="0.01" min="0" inputMode="decimal" defaultValue={student?.next_payment_amount ?? ""} />
        </Field>
        <Field label="Next payment date">
          <input className={inputCls} name="next_payment_date" type="date" defaultValue={student?.next_payment_date ?? ""} />
        </Field>
      </Grid>
      <Field label="Notes">
        <textarea className={textareaCls} name="notes" defaultValue={student?.notes ?? ""} />
      </Field>
    </>
  );
}
