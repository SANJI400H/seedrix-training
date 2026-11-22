import Link from "next/link";
import { notFound } from "next/navigation";
import { addLeadNote, convertLead, updateLead } from "@/app/admin/actions/leads";
import { ActionForm } from "@/components/portal/action-form";
import { ContactLinks, StagePill } from "@/components/portal/bits";
import { LeadFields } from "@/components/portal/lead-fields";
import { Card, Field, Grid, Notice, PageHeader, Pill, SectionTitle, inputCls, textareaCls } from "@/components/portal/ui";
import { fmtDate, fmtDateTime } from "@/lib/ledger/dates";
import { requireStaff } from "@/lib/portal/auth";
import { loadStaff, loadTeachers, staffByUser } from "@/lib/portal/data";
import { SOURCE_LABEL, type Lead, type LeadNote } from "@/lib/portal/types";

export const dynamic = "force-dynamic";

export default async function LeadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lost?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase } = await requireStaff();
  const [{ data: lead }, { data: notes }, { data: students }, staff, teachers] = await Promise.all([
    supabase.from("leads").select("*").eq("id", id).maybeSingle(),
    supabase.from("lead_notes").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
    supabase.from("students").select("id, name").eq("lead_id", id),
    loadStaff(supabase),
    loadTeachers(supabase),
  ]);
  if (!lead) notFound();
  const l = lead as Lead;
  const who = staffByUser(staff);

  return (
    <>
      <PageHeader
        title={l.name}
        sub={
          <span className="flex flex-wrap items-center gap-2">
            <StagePill stage={l.stage} />
            <span>{SOURCE_LABEL[l.source]}</span>
            {l.first_contact_on ? <span>· first contact {fmtDate(l.first_contact_on)}</span> : null}
            {l.inquiry_id ? <Pill tone="info">Website enquiry</Pill> : null}
          </span>
        }
      >
        <ContactLinks phone={l.phone} />
      </PageHeader>
      {sp.lost ? <Notice tone="warn">To mark this lead as lost, choose “Lost” below and say why.</Notice> : null}
      {students?.length ? (
        <Notice tone="good">
          Student record:{" "}
          {students.map((s) => (
            <Link key={s.id} href={`/admin/students/${s.id}`} className="font-bold underline">
              {s.name}
            </Link>
          ))}
        </Notice>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="flex flex-col gap-4">
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
                    {fmtDateTime(n.created_at)} · {n.created_by ? who.get(n.created_by) ?? "Staff" : "System / import"}
                    {n.kind !== "note" ? <span className="ms-1">· {n.kind}</span> : null}
                  </div>
                  <div className="whitespace-pre-wrap">{n.body}</div>
                </li>
              ))}
              <li className="border-s-2 border-seedrix-darkest/10 ps-3 text-xs text-seedrix-black/50">
                Lead created {fmtDateTime(l.created_at)}
              </li>
            </ol>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <SectionTitle className="mb-3">Details</SectionTitle>
            <ActionForm action={updateLead.bind(null, id)} submitLabel="Save changes">
              <LeadFields lead={l} staff={staff} />
            </ActionForm>
          </Card>
          <Card>
            <details open={l.stage === "trial_done"}>
              <summary className="cursor-pointer text-base font-bold text-seedrix-darkest">Convert to student</summary>
              <p className="mt-1 text-sm text-seedrix-black/60">Creates the student with the agreed fee and marks the lead enrolled.</p>
              <div className="mt-3">
                <ActionForm action={convertLead.bind(null, id)} submitLabel="Create student">
                  <Grid>
                    <Field label="Student name">
                      <input className={inputCls} name="name" required defaultValue={l.name} />
                    </Field>
                    <Field label="Phone">
                      <input className={inputCls} name="phone" defaultValue={l.phone ?? ""} />
                    </Field>
                    <Field label="Payer name (on the bank transfer)">
                      <input className={inputCls} name="payer_name" />
                    </Field>
                    <Field label="Course">
                      <input className={inputCls} name="course" defaultValue={l.interest ?? ""} />
                    </Field>
                    <Field label="Agreed total fee (AED)">
                      <input className={inputCls} name="agreed_fee" type="number" step="0.01" min="0" required inputMode="decimal" />
                    </Field>
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
                    <Field label="Teacher">
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
