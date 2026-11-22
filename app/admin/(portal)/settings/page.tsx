import { addStaffWithoutLogin, inviteStaff, saveSettings, saveTeacher, updateStaff } from "@/app/admin/actions/settings";
import { ActionForm } from "@/components/portal/action-form";
import { Card, Field, Grid, Notice, PageHeader, Pill, SectionTitle, inputCls, textareaCls } from "@/components/portal/ui";
import { isManager, requireStaff } from "@/lib/portal/auth";
import { loadSettings, loadStaff, loadTeachers } from "@/lib/portal/data";
import type { Teacher } from "@/lib/portal/types";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

function TeacherFields({ t }: { t?: Teacher }) {
  return (
    <>
      <Grid cols={3}>
        <Field label="Name">
          <input className={inputCls} name="name" required defaultValue={t?.name ?? ""} />
        </Field>
        <Field label="Phone">
          <input className={inputCls} name="phone" defaultValue={t?.phone ?? ""} />
        </Field>
        <Field label="Nationality">
          <input className={inputCls} name="nationality" defaultValue={t?.nationality ?? ""} />
        </Field>
        <Field label="Emirate / online">
          <input className={inputCls} name="emirate" defaultValue={t?.emirate ?? ""} />
        </Field>
        <Field label="Rate (AED)">
          <input className={inputCls} name="rate_aed" type="number" step="0.01" min="0" defaultValue={t?.rate_aed ?? ""} />
        </Field>
        <Field label="Rate note">
          <input className={inputCls} name="rate_note" defaultValue={t?.rate_note ?? ""} placeholder="per hour / per class" />
        </Field>
      </Grid>
      <Field label="Subjects">
        <input className={inputCls} name="subjects" defaultValue={t?.subjects ?? ""} />
      </Field>
      <Grid>
        <Field label="Notes">
          <input className={inputCls} name="notes" defaultValue={t?.notes ?? ""} />
        </Field>
        <Field label="Status">
          <select className={inputCls} name="active" defaultValue={t?.active === false ? "false" : "true"}>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </Field>
      </Grid>
    </>
  );
}

export default async function SettingsPage() {
  const { supabase, me } = await requireStaff();
  const owner = me.role === "owner";
  const manager = isManager(me.role);
  const [settings, staff, teachers] = await Promise.all([loadSettings(supabase), loadStaff(supabase), loadTeachers(supabase)]);

  return (
    <>
      <PageHeader title="Settings" sub={owner ? "Split rule, invoice details, staff and teachers." : "Only the owner can change the split and invoice details."} />

      <Card>
        <SectionTitle className="mb-1">Commission split and invoice details</SectionTitle>
        <p className="mb-3 text-sm text-seedrix-black/60">
          Sales commission is applied to what is left after the teacher&apos;s share; the academy keeps the rest. Changing it only affects
          payments recorded afterwards — each payment keeps the % it was saved with.
        </p>
        {owner ? (
          <ActionForm action={saveSettings} submitLabel="Save settings">
            <Grid>
              <Field label="Sales commission %" hint={`Academy gets ${100 - settings.sales_pct}% today`}>
                <input className={inputCls} name="sales_pct" type="number" min="0" max="100" step="0.01" required defaultValue={settings.sales_pct} />
              </Field>
              <Field label="TRN (blank if not VAT registered)">
                <input className={inputCls} name="trn" defaultValue={settings.trn} />
              </Field>
              <Field label="Company">
                <input className={inputCls} name="company_name" required defaultValue={settings.company_name} />
              </Field>
              <Field label="Trading as">
                <input className={inputCls} name="trade_name" required defaultValue={settings.trade_name} />
              </Field>
              <Field label="Licence no.">
                <input className={inputCls} name="license_no" defaultValue={settings.license_no} />
              </Field>
              <Field label="Bank">
                <input className={inputCls} name="bank_name" defaultValue={settings.bank_name} />
              </Field>
            </Grid>
            <Field label="Address">
              <input className={inputCls} name="address" required defaultValue={settings.address} />
            </Field>
            <Field label="IBAN (printed on invoices)">
              <input className={inputCls} name="iban" defaultValue={settings.iban} />
            </Field>
            <Field label="Invoice footer note">
              <textarea className={textareaCls} name="invoice_footer" defaultValue={settings.invoice_footer} />
            </Field>
          </ActionForm>
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-seedrix-black/55">Split</dt>
            <dd>
              {settings.sales_pct}% sales / {100 - settings.sales_pct}% academy (after teacher share)
            </dd>
            <dt className="text-seedrix-black/55">Company</dt>
            <dd>
              {settings.company_name} ({settings.trade_name})
            </dd>
          </dl>
        )}
      </Card>

      <Card>
        <SectionTitle className="mb-3">Staff</SectionTitle>
        <ul className="flex flex-col divide-y divide-seedrix-darkest/10">
          {staff.map((s) => (
            <li key={s.id} className="py-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <b>{s.full_name}</b>
                <Pill tone={s.role === "owner" ? "good" : s.role === "admin" ? "info" : "muted"}>{s.role}</Pill>
                {!s.active ? <Pill tone="bad">inactive</Pill> : null}
                {!s.user_id ? <Pill tone="warn">no login yet</Pill> : null}
                <span className="text-seedrix-black/55">{s.email}</span>
              </div>
              {owner ? (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs font-bold text-seedrix-green">Edit</summary>
                  <div className="mt-2">
                    <ActionForm action={updateStaff.bind(null, s.id)} submitLabel="Save" submitVariant="outline">
                      <Grid cols={3}>
                        <Field label="Name">
                          <input className={inputCls} name="full_name" defaultValue={s.full_name} required />
                        </Field>
                        <Field label="Role">
                          <select className={inputCls} name="role" defaultValue={s.role}>
                            <option value="sales">Sales</option>
                            <option value="admin">Admin (manager)</option>
                            <option value="owner">Owner</option>
                          </select>
                        </Field>
                        <Field label="Access">
                          <select className={inputCls} name="active" defaultValue={s.active ? "true" : "false"}>
                            <option value="true">Active</option>
                            <option value="false">Deactivated</option>
                          </select>
                        </Field>
                      </Grid>
                    </ActionForm>
                    {!s.user_id ? (
                      <div className="mt-3">
                        <ActionForm action={inviteStaff} submitLabel="Send invite" submitVariant="outline">
                          <input type="hidden" name="staff_id" value={s.id} />
                          <input type="hidden" name="full_name" value={s.full_name} />
                          <input type="hidden" name="role" value={s.role} />
                          <Field label={`Invite ${s.full_name} by email`}>
                            <input className={inputCls} name="email" type="email" required defaultValue={s.email ?? ""} />
                          </Field>
                        </ActionForm>
                      </div>
                    ) : null}
                  </div>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
        {owner ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <SectionTitle className="mb-2 text-sm">Invite by email</SectionTitle>
              <ActionForm action={inviteStaff} submitLabel="Send invite" resetOnSuccess>
                <Field label="Name">
                  <input className={inputCls} name="full_name" required />
                </Field>
                <Field label="Email">
                  <input className={inputCls} name="email" type="email" required />
                </Field>
                <Field label="Role">
                  <select className={inputCls} name="role" defaultValue="sales">
                    <option value="sales">Sales</option>
                    <option value="admin">Admin (manager)</option>
                    <option value="owner">Owner</option>
                  </select>
                </Field>
              </ActionForm>
            </div>
            <div>
              <SectionTitle className="mb-2 text-sm">Add a rep without a login</SectionTitle>
              <p className="mb-2 text-xs text-seedrix-black/55">For people you need in the rep lists (e.g. imported history) who don&apos;t sign in yet.</p>
              <ActionForm action={addStaffWithoutLogin} submitLabel="Add" submitVariant="outline" resetOnSuccess>
                <Field label="Name">
                  <input className={inputCls} name="full_name" required />
                </Field>
              </ActionForm>
            </div>
          </div>
        ) : (
          <Notice tone="info">Only the owner can invite staff or change roles.</Notice>
        )}
      </Card>

      <Card>
        <SectionTitle className="mb-3">Teachers ({teachers.filter((t) => t.active).length} active)</SectionTitle>
        <ul className="flex flex-col divide-y divide-seedrix-darkest/10">
          {teachers.map((t) => (
            <li key={t.id} className="py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <b>{t.name}</b>
                {!t.active ? <Pill tone="muted">inactive</Pill> : null}
                <span className="text-seedrix-black/55">{[t.emirate, t.subjects, t.rate_aed ? `AED ${t.rate_aed} ${t.rate_note ?? ""}` : t.rate_note].filter(Boolean).join(" · ")}</span>
              </div>
              {manager ? (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs font-bold text-seedrix-green">Edit</summary>
                  <div className="mt-2">
                    <ActionForm action={saveTeacher.bind(null, t.id)} submitLabel="Save" submitVariant="outline">
                      <TeacherFields t={t} />
                    </ActionForm>
                  </div>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
        {manager ? (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-bold text-seedrix-green">Add a teacher</summary>
            <div className="mt-2">
              <ActionForm action={saveTeacher.bind(null, null)} submitLabel="Add teacher" resetOnSuccess>
                <TeacherFields />
              </ActionForm>
            </div>
          </details>
        ) : null}
      </Card>
    </>
  );
}
