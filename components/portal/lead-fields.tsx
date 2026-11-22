import { Field, Grid, inputCls, textareaCls } from "@/components/portal/ui";
import { LEAD_SOURCES, LEAD_STAGES, SOURCE_LABEL, STAGE_LABEL, type Lead, type Staff } from "@/lib/portal/types";

export function LeadFields({
  lead,
  staff,
  withNote,
  defaultRepId,
  canAssign = true,
}: {
  lead?: Lead;
  staff: Staff[];
  withNote?: boolean;
  defaultRepId?: string;
  canAssign?: boolean;
}) {
  return (
    <>
      <Grid>
        <Field label="Name">
          <input className={inputCls} name="name" required defaultValue={lead?.name ?? ""} placeholder="e.g. Umm Rashid" />
        </Field>
        <Field label="Phone / WhatsApp">
          <input className={inputCls} name="phone" inputMode="tel" defaultValue={lead?.phone ?? ""} placeholder="+971 5x xxx xxxx" />
        </Field>
        <Field label="Email">
          <input className={inputCls} name="email" type="email" defaultValue={lead?.email ?? ""} />
        </Field>
        <Field label="Emirate / area">
          <input className={inputCls} name="emirate" defaultValue={lead?.emirate ?? ""} placeholder="Sharjah, Ajman…" />
        </Field>
        <Field label="Source">
          <select className={inputCls} name="source" defaultValue={lead?.source ?? "referral"}>
            {LEAD_SOURCES.map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        {canAssign ? (
          <Field label="Assigned rep">
            <select className={inputCls} name="assigned_rep_id" defaultValue={lead?.assigned_rep_id ?? defaultRepId ?? ""}>
              <option value="">Unassigned</option>
              {staff
                .filter((s) => s.active || s.id === lead?.assigned_rep_id)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
            </select>
          </Field>
        ) : null}
        <Field label="Campaign / ad (if known)">
          <input className={inputCls} name="campaign" defaultValue={lead?.campaign ?? ""} />
        </Field>
        <Field label="Interest / course">
          <input className={inputCls} name="interest" defaultValue={lead?.interest ?? ""} placeholder="English, maths at home…" />
        </Field>
        <Field label="Child grades">
          <input className={inputCls} name="child_grades" defaultValue={lead?.child_grades ?? ""} placeholder="Boy G6, girl G4" />
        </Field>
        <Field label="Stage">
          <select className={inputCls} name="stage" defaultValue={lead?.stage ?? "new"}>
            {LEAD_STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Next follow-up">
          <input className={inputCls} type="date" name="next_follow_up" defaultValue={lead?.next_follow_up ?? ""} />
        </Field>
      </Grid>
      <Field label="Lost reason (if lost)">
        <input className={inputCls} name="lost_reason" defaultValue={lead?.lost_reason ?? ""} placeholder="Price, moved, chose another centre…" />
      </Field>
      {withNote ? (
        <Field label="First note">
          <textarea className={textareaCls} name="note" placeholder="What they want, when to call back…" />
        </Field>
      ) : null}
    </>
  );
}
