import { Field, Grid, inputCls, textareaCls } from "@/components/portal/ui";
import { LEAD_SOURCES, SOURCE_LABEL, type Client, type Staff } from "@/lib/portal/types";

export function ClientFields({ client, staff, canAssign }: { client?: Client; staff: Staff[]; canAssign: boolean }) {
  return (
    <>
      <Grid>
        <Field label="Parent / payer name">
          <input className={inputCls} name="name" required defaultValue={client?.name ?? ""} />
        </Field>
        <Field label="Phone">
          <input className={inputCls} name="phone" inputMode="tel" defaultValue={client?.phone ?? ""} />
        </Field>
        <Field label="WhatsApp (if different)">
          <input className={inputCls} name="whatsapp" inputMode="tel" defaultValue={client?.whatsapp ?? ""} />
        </Field>
        <Field label="Second phone">
          <input className={inputCls} name="phone2" inputMode="tel" defaultValue={client?.phone2 ?? ""} />
        </Field>
        <Field label="Email">
          <input className={inputCls} name="email" type="email" defaultValue={client?.email ?? ""} />
        </Field>
        <Field label="Preferred language">
          <select className={inputCls} name="preferred_language" defaultValue={client?.preferred_language ?? ""}>
            <option value="">—</option>
            <option value="Arabic">Arabic</option>
            <option value="English">English</option>
            <option value="Other">Other</option>
          </select>
        </Field>
        <Field label="Emirate">
          <input className={inputCls} name="emirate" defaultValue={client?.emirate ?? ""} />
        </Field>
        <Field label="Area">
          <input className={inputCls} name="area" defaultValue={client?.area ?? ""} />
        </Field>
        <Field label="How they found us">
          <select className={inputCls} name="source" defaultValue={client?.source ?? ""}>
            <option value="">—</option>
            {LEAD_SOURCES.map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        {canAssign ? (
          <Field label="Sales rep">
            <select className={inputCls} name="rep_id" defaultValue={client?.rep_id ?? ""}>
              <option value="">—</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
      </Grid>
      <Field label="Address">
        <input className={inputCls} name="address" defaultValue={client?.address ?? ""} />
      </Field>
      <Field label="Notes and documents" hint="Agreements, special requests, links to documents.">
        <textarea className={textareaCls} name="notes" defaultValue={client?.notes ?? ""} />
      </Field>
    </>
  );
}
