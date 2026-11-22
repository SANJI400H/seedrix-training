import Link from "next/link";
import { notFound } from "next/navigation";
import { addLeadNote, convertLead, updateLead } from "@/app/admin/actions/leads";
import { ActionForm } from "@/components/portal/action-form";
import { ContactLinks, StagePill } from "@/components/portal/bits";
import { LeadFields } from "@/components/portal/lead-fields";
import { Card, Field, Grid, Notice, PageHeader, Pill, SectionTitle, inputCls, textareaCls } from "@/components/portal/ui";
import { fmtDateTime } from "@/lib/ledger/dates";
import { isManager, requireStaff } from "@/lib/portal/auth";
import { loadClients, loadStaff, loadTeachers, staffByUser } from "@/lib/portal/data";
import {
  CURRICULA,
  CURRICULUM_LABEL,
  DELIVERY_LABEL,
  DELIVERY_MODES,
  SOURCE_LABEL,
  type Lead,
  type LeadNote,
} from "@/lib/portal/types";

export const dynamic = "force-dynamic";

export default async function LeadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lost?: string; convert?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, me } = await requireStaff();
  const manager = isManager(me.role);
  const [{ data: lead }, { data: notes }, { data: students }, staff, teachers, clients] = await Promise.all([
    supabase.from("leads").select("*").eq("id", id).maybeSingle(),
    supabase.from("lead_notes").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
    supabase.from("students").select("id, name").eq("lead_id", id),
    loadStaff(supabase),
    loadTeachers(supabase),
    loadClients(supabase),
  ]);
  if (!lead) notFound();
  const l = lead as Lead;
  // first time the assigned rep (or a manager, for unassigned leads) opens it, it stops being "New"
  if (!l.viewed_at && (l.assigned_rep_id === me.staff.id || (manager && !l.assigned_rep_id))) {
    await supabase.from("leads").update({ viewed_at: new Date().toISOString() }).eq("id", id);
  }
  const who = staffByUser(staff);
  const repName = l.assigned_rep_id ? staff.find((s) => s.id === l.assigned_rep_id)?.full_name : null;
  const attribution = [
    ["Campaign", l.campaign],
    ["Ad set", l.ad_set],
    ["Ad", l.ad_name],
    ["Form", l.form_name],
    ["UTM source / medium", [l.utm_source, l.utm_medium].filter(Boolean).join(" / ")],
    ["UTM campaign", l.utm_campaign],
    ["UTM content / term", [l.utm_content, l.utm_term].filter(Boolean).join(" / ")],
    ["Landing page", l.landing_page],
    ["Referrer", l.referrer],
  ].filter(([, v]) => v) as Array<[string, string]>;
  const sameFamily = clients.filter((c) => c.phone && l.phone && c.phone === l.phone);

  return (
    <>
      <PageHeader
        title={l.name}
        sub={
          <span className="flex flex-wrap items-center gap-2">
            <StagePill stage={l.stage} />
            <span>{SOURCE_LABEL[l.source] ?? l.source}</span>
            {l.campaign ? <span>· {l.campaign}</span> : null}
            <span>· received {fmtDateTime(l.received_at)}</span>
            {manager ? <Pill tone={repName ? "muted" : "warn"}>{repName ?? "Unassigned"}</Pill> : null}
            {l.inquiry_id ? <Pill tone="info">Website enquiry</Pill> : null}
          </span>
        }
      >
        <ContactLinks phone={l.phone} />
      </PageHeader>
      {sp.lost ? <Notice tone="warn">To mark this lead as lost, choose “Lost” below and say why.</Notice> : null}
      {sp.convert ? <Notice tone="info">To enrol this lead, fill in “Convert to student” below.</Notice> : null}
      {students?.length ? (
        <Notice tone="good">
          Student record:{" "}
          {students.map((s, i) => (
            <span key={s.id}>
              {i ? ", " : ""}
              <Link href={`/admin/students/${s.id}`} className="font-bold underline">
                {s.name}
              </Link>
            </span>
          ))}
        </Notice>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <SectionTitle className="mb-3">Add a note</SectionTitle>
            <ActionForm action={addLeadNote.bind(null, id)} submitLabel="Add note" resetOnSuccess>
              <Field label="Note">
                <textarea className={textareaCls} name="body" required placeholder="Called, no answer. Sent prices on WhatsApp…" />
              </Field>
              <Field label="Next follow-up (optional)">
                <input className={inputCls} type="date" name="next_follow_up" />
              </Field>
            </ActionForm>
          </Card>
          <Card>
            <SectionTitle className="mb-2">Timeline</SectionTitle>
            <ol className="flex flex-col gap-3">
              {((notes ?? []) as LeadNote[]).map((n) => (
                <li key={n.id} className="border-s-2 border-seedrix-green/30 ps-3 text-sm">
                  <div className="text-xs text-seedrix-black/50">
                    {fmtDateTime(n.created_at)} · {n.created_by ? (who.get(n.created_by) ?? "Staff") : "System / import"}
                    {n.kind !== "note" ? <span className="ms-1">· {n.kind}</span> : null}
                  </div>
                  <div className="whitespace-pre-wrap break-words">{n.body}</div>
                </li>
              ))}
              <li className="border-s-2 border-seedrix-darkest/10 ps-3 text-xs text-seedrix-black/50">Lead created {fmtDateTime(l.created_at)}</li>
            </ol>
          </Card>
          {attribution.length ? (
            <Card>
              <SectionTitle className="mb-2">Where this lead came from</SectionTitle>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                {attribution.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-seedrix-black/55">{k}</dt>
                    <dd className="min-w-0 break-words">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <SectionTitle className="mb-3">Details</SectionTitle>
            <ActionForm action={updateLead.bind(null, id)} submitLabel="Save changes">
              <LeadFields lead={l} staff={staff} canAssign={manager} />
            </ActionForm>
          </Card>
          <Card>
            <details open={l.stage === "trial_done" || !!sp.convert}>
              <summary className="cursor-pointer text-base font-bold text-seedrix-darkest">Convert to student</summary>
              <p className="mt-1 text-sm text-seedrix-black/60">
                Creates the client (parent / payer) and the student with the agreed fee, and marks the lead enrolled. For a second child,
                choose the existing client.
              </p>
              <div className="mt-3">
                <ActionForm action={convertLead.bind(null, id)} submitLabel="Create student">
                  <fieldset className="flex flex-col gap-2 rounded-[8px] border border-seedrix-darkest/10 p-3">
                    <legend className="px-1 text-xs font-bold">Client (parent / payer)</legend>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="radio" name="client_mode" value="new" defaultChecked={!sameFamily.length} /> New client
                    </label>
                    <Grid>
                      <Field label="Client name">
                        <input className={inputCls} name="client_name" defaultValue={l.name} />
                      </Field>
                      <Field label="Phone / WhatsApp">
                        <input className={inputCls} name="client_phone" defaultValue={l.phone ?? ""} />
                      </Field>
                      <Field label="Email">
                        <input className={inputCls} name="client_email" type="email" defaultValue={l.email ?? ""} />
                      </Field>
                    </Grid>
                    {clients.length ? (
                      <>
                        <label className="flex items-center gap-2 text-sm">
                          <input type="radio" name="client_mode" value="existing" defaultChecked={!!sameFamily.length} /> Existing client
                        </label>
                        <select className={inputCls} name="client_id" defaultValue={sameFamily[0]?.id ?? ""} aria-label="Existing client">
                          <option value="">Choose…</option>
                          {clients.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                              {c.phone ? ` · ${c.phone}` : ""}
                            </option>
                          ))}
                        </select>
                      </>
                    ) : null}
                  </fieldset>
                  <Grid>
                    <Field label="Student (child) name">
                      <input className={inputCls} name="name" required defaultValue={l.name} />
                    </Field>
                    <Field label="Grade">
                      <input className={inputCls} name="grade" defaultValue={l.child_grades ?? ""} />
                    </Field>
                    <Field label="School">
                      <input className={inputCls} name="school" />
                    </Field>
                    <Field label="Curriculum">
                      <select className={inputCls} name="curriculum" defaultValue="">
                        <option value="">—</option>
                        {CURRICULA.map((c) => (
                          <option key={c} value={c}>
                            {CURRICULUM_LABEL[c]}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Subjects">
                      <input className={inputCls} name="subjects" defaultValue={l.interest ?? ""} />
                    </Field>
                    <Field label="Delivery">
                      <select className={inputCls} name="delivery_mode" defaultValue="">
                        <option value="">—</option>
                        {DELIVERY_MODES.map((m) => (
                          <option key={m} value={m}>
                            {DELIVERY_LABEL[m]}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Course">
                      <input className={inputCls} name="course" defaultValue={l.interest ?? ""} />
                    </Field>
                    <Field label="Agreed total fee (AED)">
                      <input className={inputCls} name="agreed_fee" type="number" step="0.01" min="0" required inputMode="decimal" />
                    </Field>
                    {manager ? (
                      <Field label="Sales rep">
                        <select className={inputCls} name="rep_id" defaultValue={l.assigned_rep_id ?? ""}>
                          <option value="">—</option>
                          {staff.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.full_name}
                            </option>
                          ))}
                        </select>
                      </Field>
                    ) : null}
                    <Field label="Teacher" hint={<Link href="/admin/teachers" className="underline">Find a teacher by subject / area</Link>}>
                      <select className={inputCls} name="teacher_id" defaultValue="">
                        <option value="">Not decided</option>
                        {teachers
                          .filter((t) => t.active)
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                              {t.emirate ? ` (${t.emirate})` : ""}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <Field label="Schedule">
                      <input className={inputCls} name="schedule" placeholder="Sun – Tue – Thu 4pm" />
                    </Field>
                    <Field label="Start date">
                      <input className={inputCls} name="start_date" type="date" />
                    </Field>
                    <Field label="Next payment due">
                      <input className={inputCls} name="next_payment_date" type="date" />
                    </Field>
                  </Grid>
                  <Field label="Notes">
                    <textarea className={textareaCls} name="notes" />
                  </Field>
                </ActionForm>
              </div>
            </details>
          </Card>
        </div>
      </div>
    </>
  );
}
