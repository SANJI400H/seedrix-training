import Link from "next/link";
import { redirect } from "next/navigation";
import {
  addStaffWithoutLogin,
  inviteStaff,
  saveCompany,
  saveLeadRouting,
  saveSplit,
  sendTestLead,
  updateStaff,
} from "@/app/admin/actions/settings";
import { ActionForm } from "@/components/portal/action-form";
import { CopyLink } from "@/components/portal/copy-link";
import { Card, Field, Grid, Notice, PageHeader, Pill, SectionTitle, Table, Td, Th, inputCls, linkBtnOutline, textareaCls } from "@/components/portal/ui";
import { fmtDateTime } from "@/lib/ledger/dates";
import { isManager, requireStaff } from "@/lib/portal/auth";
import { loadLeads, loadSettings, loadStaff, loadTeachers } from "@/lib/portal/data";
import { INBOUND_SOURCES, SOURCE_LABEL } from "@/lib/leads/source";
import { cn } from "@/lib/utils";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

const TABS = [
  ["company", "Company & invoice"],
  ["split", "Split % & VAT"],
  ["staff", "Staff"],
  ["teachers", "Teachers"],
  ["sources", "Lead sources & integrations"],
] as const;
type Tab = (typeof TABS)[number][0];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { supabase, me } = await requireStaff();
  if (!isManager(me.role)) redirect("/admin/account");
  const owner = me.role === "owner";
  const sp = await searchParams;
  const tab: Tab = (TABS.find(([k]) => k === sp.tab)?.[0] ?? "company") as Tab;
  const settings = await loadSettings(supabase);

  return (
    <>
      <PageHeader title="Settings" sub={owner ? "Only you (the owner) can change company details, the split and staff roles." : "Read only — the owner changes these."} />
      <nav aria-label="Settings sections" className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none]">
        {TABS.map(([k, label]) => (
          <Link
            key={k}
            href={`/admin/settings?tab=${k}`}
            aria-current={tab === k ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-bold",
              tab === k ? "border-seedrix-green bg-seedrix-green text-seedrix-white" : "border-seedrix-darkest/15 bg-seedrix-white text-seedrix-darkest",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>

      {tab === "company" ? (
        <Card>
          <SectionTitle className="mb-1">Company and invoice details</SectionTitle>
          <p className="mb-3 text-sm text-seedrix-black/60">Printed on every client invoice.</p>
          <fieldset disabled={!owner} className="contents">
            <ActionForm action={saveCompany} submitLabel="Save details">
              <Grid>
                <Field label="Company (legal name)">
                  <input className={inputCls} name="company_name" required defaultValue={settings.company_name} />
                </Field>
                <Field label="Trading as">
                  <input className={inputCls} name="trade_name" required defaultValue={settings.trade_name} />
                </Field>
                <Field label="Licence no.">
                  <input className={inputCls} name="license_no" defaultValue={settings.license_no} />
                </Field>
                <Field label="TRN (blank if not VAT registered)">
                  <input className={inputCls} name="trn" defaultValue={settings.trn} />
                </Field>
                <Field label="Phone on invoices">
                  <input className={inputCls} name="company_phone" defaultValue={settings.company_phone} />
                </Field>
                <Field label="Email on invoices">
                  <input className={inputCls} name="company_email" defaultValue={settings.company_email} />
                </Field>
                <Field label="Bank">
                  <input className={inputCls} name="bank_name" defaultValue={settings.bank_name} />
                </Field>
                <Field label="IBAN (for paying balances)">
                  <input className={inputCls} name="iban" defaultValue={settings.iban} />
                </Field>
              </Grid>
              <Field label="Address">
                <input className={inputCls} name="address" required defaultValue={settings.address} />
              </Field>
              <Field label="Invoice footer note">
                <textarea className={textareaCls} name="invoice_footer" defaultValue={settings.invoice_footer} />
              </Field>
            </ActionForm>
          </fieldset>
        </Card>
      ) : null}

      {tab === "split" ? (
        <Card>
          <SectionTitle className="mb-1">Commission split and VAT</SectionTitle>
          <p className="mb-3 text-sm text-seedrix-black/60">
            Sales commission is a % of what is left after the teacher&apos;s share; the academy keeps the rest. Each payment keeps the % it was
            saved with. VAT is shown on invoices only when it is on <b>and</b> a TRN is set; amounts are treated as VAT-inclusive.
          </p>
          <fieldset disabled={!owner} className="contents">
            <ActionForm action={saveSplit} submitLabel="Save">
              <Grid cols={3}>
                <Field label="Sales commission %" hint={`Academy gets ${100 - settings.sales_pct}% today`}>
                  <input className={inputCls} name="sales_pct" type="number" min="0" max="100" step="0.01" required defaultValue={settings.sales_pct} />
                </Field>
                <Field label="VAT on invoices">
                  <select className={inputCls} name="vat_enabled" defaultValue={settings.vat_enabled ? "true" : "false"}>
                    <option value="false">Off (not VAT registered)</option>
                    <option value="true">On</option>
                  </select>
                </Field>
                <Field label="VAT rate %">
                  <input className={inputCls} name="vat_rate" type="number" min="0" max="100" step="0.01" defaultValue={settings.vat_rate} />
                </Field>
              </Grid>
              {settings.vat_enabled && !settings.trn ? <Notice tone="warn">VAT is on but no TRN is set, so invoices will not show VAT.</Notice> : null}
            </ActionForm>
          </fieldset>
        </Card>
      ) : null}

      {tab === "staff" ? <StaffTab owner={owner} /> : null}
      {tab === "teachers" ? <TeachersTab /> : null}
      {tab === "sources" ? <SourcesTab owner={owner} /> : null}
    </>
  );
}

async function StaffTab({ owner }: { owner: boolean }) {
  const { supabase } = await requireStaff();
  const staff = await loadStaff(supabase);
  return (
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
              <span className="break-all text-seedrix-black/55">{s.email}</span>
            </div>
            {owner ? (
              <details className="mt-1">
                <summary className="cursor-pointer text-xs font-bold text-seedrix-green">Edit</summary>
                <div className="mt-2 flex flex-col gap-3">
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
                    <ActionForm action={inviteStaff} submitLabel="Send invite" submitVariant="outline">
                      <input type="hidden" name="staff_id" value={s.id} />
                      <input type="hidden" name="full_name" value={s.full_name} />
                      <input type="hidden" name="role" value={s.role} />
                      <Field label={`Invite ${s.full_name} by email`}>
                        <input className={inputCls} name="email" type="email" required defaultValue={s.email ?? ""} />
                      </Field>
                    </ActionForm>
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
  );
}

async function TeachersTab() {
  const { supabase } = await requireStaff();
  const teachers = await loadTeachers(supabase);
  const by = (s: string) => teachers.filter((t) => t.status === s).length;
  return (
    <Card>
      <SectionTitle className="mb-2">Teachers</SectionTitle>
      <p className="text-sm text-seedrix-black/70">
        {by("active")} active · {by("onboarding")} onboarding · {by("inactive")} inactive. Profiles, pay rates, bank details and photos are
        managed in the teacher directory.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href="/admin/teachers" className={linkBtnOutline}>
          Open the teacher directory
        </Link>
        <Link href="/admin/teachers/new" className={linkBtnOutline}>
          Add a teacher
        </Link>
      </div>
    </Card>
  );
}

async function SourcesTab({ owner }: { owner: boolean }) {
  const { supabase } = await requireStaff();
  const [settings, staff, leads] = await Promise.all([loadSettings(supabase), loadStaff(supabase), loadLeads(supabase)]);
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const env: Array<[string, boolean, string]> = [
    ["LEAD_INGEST_SECRET", !!process.env.LEAD_INGEST_SECRET, "n8n / Make / Zapier webhook (TikTok, Snapchat, Google)"],
    ["META_VERIFY_TOKEN", !!process.env.META_VERIFY_TOKEN, "Meta webhook verification"],
    ["META_APP_SECRET", !!process.env.META_APP_SECRET, "Meta signature check"],
    ["META_PAGE_ACCESS_TOKEN", !!process.env.META_PAGE_ACCESS_TOKEN, "Fetch lead details from the Graph API"],
    ["RESEND_API_KEY", !!process.env.RESEND_API_KEY, "New-lead and invoice emails"],
    ["SEEDRIX_TEAM_EMAIL", !!process.env.SEEDRIX_TEAM_EMAIL, "Who gets new-lead emails"],
  ];
  const lastBySource = new Map<string, string>();
  for (const l of leads) {
    const prev = lastBySource.get(l.source);
    if (!prev || l.received_at > prev) lastBySource.set(l.source, l.received_at);
  }
  const rotation = new Set(settings.round_robin_staff_ids);
  return (
    <>
      <Card>
        <SectionTitle className="mb-2">Webhook URLs</SectionTitle>
        <div className="flex flex-col gap-3 text-sm">
          <div>
            <div className="mb-1 font-bold">Generic lead ingest (n8n, Make, Zapier) — POST JSON with header x-lead-secret</div>
            <CopyLink url={`${base}/api/leads/ingest`} />
          </div>
          <div>
            <div className="mb-1 font-bold">Meta Lead Ads (Facebook / Instagram) — callback URL for the Page &quot;leadgen&quot; webhook</div>
            <CopyLink url={`${base}/api/leads/meta`} />
          </div>
          <p className="text-seedrix-black/60">
            Website enquiries need no setup: UTM tags and ad click ids on the landing URL are saved with the enquiry. Step-by-step setup is in
            docs/STAFF_PORTAL.md.
          </p>
        </div>
      </Card>
      <Card>
        <SectionTitle className="mb-2">Environment variables</SectionTitle>
        <ul className="flex flex-col gap-1 text-sm">
          {env.map(([k, set, why]) => (
            <li key={k} className="flex flex-wrap items-center gap-2">
              <Pill tone={set ? "good" : "warn"}>{set ? "set" : "missing"}</Pill>
              <code className="text-xs">{k}</code>
              <span className="text-seedrix-black/55">{why}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3">
          <ActionForm action={sendTestLead} submitLabel="Send test lead" submitVariant="outline">
            <p className="text-sm text-seedrix-black/60">Posts a sample lead to the ingest endpoint, the same way n8n would.</p>
          </ActionForm>
        </div>
      </Card>
      <Card>
        <SectionTitle className="mb-2">Last lead received per source</SectionTitle>
        <Table>
          <thead>
            <tr>
              <Th>Source</Th>
              <Th>Last received</Th>
            </tr>
          </thead>
          <tbody>
            {[...lastBySource.entries()]
              .sort((a, b) => b[1].localeCompare(a[1]))
              .map(([src, at]) => (
                <tr key={src}>
                  <Td>{SOURCE_LABEL[src as keyof typeof SOURCE_LABEL] ?? src}</Td>
                  <Td>{fmtDateTime(at)}</Td>
                </tr>
              ))}
          </tbody>
        </Table>
      </Card>
      <Card>
        <SectionTitle className="mb-1">New lead routing</SectionTitle>
        <p className="mb-3 text-sm text-seedrix-black/60">
          Off by default: new website and ad leads ({INBOUND_SOURCES.map((s) => SOURCE_LABEL[s]).join(", ")}) go to the Unassigned queue. With
          round-robin on, each new one goes to the next rep in the rotation, who also gets an email.
        </p>
        <fieldset disabled={!owner} className="contents">
          <ActionForm action={saveLeadRouting} submitLabel="Save routing">
            <Grid>
              <Field label="Round-robin">
                <select className={inputCls} name="round_robin_enabled" defaultValue={settings.round_robin_enabled ? "true" : "false"}>
                  <option value="false">Off — owner/admin assign</option>
                  <option value="true">On</option>
                </select>
              </Field>
              <Field label="Email the team about new leads">
                <select className={inputCls} name="notify_new_leads" defaultValue={settings.notify_new_leads ? "true" : "false"}>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </Field>
            </Grid>
            <fieldset className="flex flex-wrap gap-3 rounded-[8px] border border-seedrix-darkest/10 p-3 text-sm">
              <legend className="px-1 text-xs font-bold">Reps in the rotation</legend>
              {staff
                .filter((s) => s.active)
                .map((s) => (
                  <label key={s.id} className="flex items-center gap-2">
                    <input type="checkbox" name="round_robin_staff_ids" value={s.id} defaultChecked={rotation.has(s.id)} className="h-4 w-4" />
                    {s.full_name} <span className="text-xs text-seedrix-black/50">({s.role})</span>
                  </label>
                ))}
            </fieldset>
          </ActionForm>
        </fieldset>
      </Card>
    </>
  );
}
