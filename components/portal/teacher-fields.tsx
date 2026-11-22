import { Field, Grid, inputCls, textareaCls } from "@/components/portal/ui";
import type { Teacher } from "@/lib/portal/types";

export function TeacherFields({ t }: { t?: Teacher }) {
  return (
    <>
      <p className="text-xs font-bold uppercase tracking-wider text-seedrix-black/50">Profile (visible to all staff)</p>
      <Grid cols={3}>
        <Field label="Name">
          <input className={inputCls} name="name" required defaultValue={t?.name ?? ""} />
        </Field>
        <Field label="Nationality">
          <input className={inputCls} name="nationality" defaultValue={t?.nationality ?? ""} />
        </Field>
        <Field label="Languages">
          <input className={inputCls} name="languages" defaultValue={t?.languages ?? ""} placeholder="Arabic, English" />
        </Field>
        <Field label="Subjects">
          <input className={inputCls} name="subjects" defaultValue={t?.subjects ?? ""} />
        </Field>
        <Field label="Curricula">
          <input className={inputCls} name="curricula" defaultValue={t?.curricula ?? ""} placeholder="American, British, Ministry" />
        </Field>
        <Field label="Grades">
          <input className={inputCls} name="grade_range" defaultValue={t?.grade_range ?? ""} placeholder="KG – Grade 6" />
        </Field>
        <Field label="Emirate">
          <input className={inputCls} name="emirate" defaultValue={t?.emirate ?? ""} />
        </Field>
        <Field label="Areas covered">
          <input className={inputCls} name="areas" defaultValue={t?.areas ?? ""} placeholder="Al Nahda, Muwaileh" />
        </Field>
        <Field label="Delivery">
          <input className={inputCls} name="delivery_modes" defaultValue={t?.delivery_modes ?? ""} placeholder="home, online, centre" />
        </Field>
        <Field label="Status">
          <select className={inputCls} name="status" defaultValue={t?.status ?? "active"}>
            <option value="active">Active</option>
            <option value="onboarding">Onboarding</option>
            <option value="inactive">Inactive</option>
          </select>
        </Field>
      </Grid>
      <Field label="Availability (weekly)">
        <input className={inputCls} name="availability" defaultValue={t?.availability ?? ""} placeholder="Sun–Thu 3–8pm; Sat mornings" />
      </Field>
      <Field label="Bio">
        <textarea className={textareaCls} name="bio" defaultValue={t?.bio ?? ""} />
      </Field>
      <p className="mt-2 text-xs font-bold uppercase tracking-wider text-red-700">Private (owner / admin only)</p>
      <Grid cols={3}>
        <Field label="Phone">
          <input className={inputCls} name="phone" defaultValue={t?.phone ?? ""} />
        </Field>
        <Field label="Email">
          <input className={inputCls} name="email" type="email" defaultValue={t?.email ?? ""} />
        </Field>
        <Field label="Rating (0–5)">
          <input className={inputCls} name="rating" type="number" step="0.5" min="0" max="5" defaultValue={t?.rating ?? ""} />
        </Field>
        <Field label="Pay rate (AED)">
          <input className={inputCls} name="rate_aed" type="number" step="0.01" min="0" defaultValue={t?.rate_aed ?? ""} />
        </Field>
        <Field label="Per">
          <select className={inputCls} name="pay_unit" defaultValue={t?.pay_unit ?? ""}>
            <option value="">—</option>
            <option value="hour">Hour</option>
            <option value="class">Class</option>
            <option value="course">Course</option>
          </select>
        </Field>
        <Field label="Rate note">
          <input className={inputCls} name="rate_note" defaultValue={t?.rate_note ?? ""} />
        </Field>
        <Field label="Bank">
          <input className={inputCls} name="bank_name" defaultValue={t?.bank_name ?? ""} />
        </Field>
        <Field label="IBAN" className="sm:col-span-2">
          <input className={inputCls} name="iban" defaultValue={t?.iban ?? ""} />
        </Field>
      </Grid>
      <Field label="Private notes">
        <textarea className={textareaCls} name="notes" defaultValue={t?.notes ?? ""} />
      </Field>
    </>
  );
}
