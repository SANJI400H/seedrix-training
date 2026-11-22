import Link from "next/link";
import { notFound } from "next/navigation";
import { saveClient } from "@/app/admin/actions/students";
import { ActionForm } from "@/components/portal/action-form";
import { BalancePill, ContactLinks, InvoiceStatusPill, MethodLabel, StagePill } from "@/components/portal/bits";
import { ClientFields } from "@/components/portal/client-fields";
import { Card, Kpi, Money, PageHeader, SectionTitle, Table, Td, Th, linkBtnOutline } from "@/components/portal/ui";
import { paidByStudent } from "@/lib/ledger/balances";
import { fmtDate, fmtDateTime } from "@/lib/ledger/dates";
import { isManager, requireStaff } from "@/lib/portal/auth";
import { loadStaff, loadTeachers, staffByUser } from "@/lib/portal/data";
import {
  CURRICULUM_LABEL,
  DELIVERY_LABEL,
  SOURCE_LABEL,
  type Client,
  type ClientPayment,
  type Invoice,
  type Lead,
  type LeadNote,
  type LeadSource,
  type Student,
} from "@/lib/portal/types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, me } = await requireStaff();
  const manager = isManager(me.role);
  const [{ data: c }, { data: kids }, staff, teachers] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).maybeSingle(),
    supabase.from("students").select("*").eq("client_id", id).order("name"),
    loadStaff(supabase),
    loadTeachers(supabase),
  ]);
  if (!c) notFound();
  const client = c as Client;
  const students = ((kids ?? []) as Student[]).map((s) => ({ ...s, agreed_fee: Number(s.agreed_fee) }));
  const ids = students.map((s) => s.id);
  const [{ data: pays }, { data: invs }, { data: lead }, { data: notes }] = await Promise.all([
    ids.length ? supabase.from("client_payments").select("*").in("student_id", ids).order("paid_on", { ascending: false }) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("invoices").select("*").in("student_id", ids).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    client.lead_id ? supabase.from("leads").select("*").eq("id", client.lead_id).maybeSingle() : Promise.resolve({ data: null }),
    client.lead_id
      ? supabase.from("lead_notes").select("*").eq("lead_id", client.lead_id).order("created_at", { ascending: false }).limit(5)
      : Promise.resolve({ data: [] }),
  ]);
  const payments = ((pays ?? []) as ClientPayment[]).map((p) => ({ ...p, amount: Number(p.amount) }));
  const invoices = (invs ?? []) as Invoice[];
  const fee = students.reduce((a, s) => a + s.agreed_fee, 0);
  const paid = students.reduce((a, s) => a + paidByStudent(s.id, payments), 0);
  const teacherName = new Map(teachers.map((t) => [t.id, t.name]));
  const studentName = new Map(students.map((s) => [s.id, s.name]));
  const who = staffByUser(staff);
  const l = lead as Lead | null;

  return (
    <>
      <PageHeader
        title={client.name}
        sub={
          [
            client.source ? `Found us via ${SOURCE_LABEL[client.source as LeadSource] ?? client.source}` : null,
            client.preferred_language ? `prefers ${client.preferred_language}` : null,
            manager && client.rep_id ? `rep ${staff.find((s) => s.id === client.rep_id)?.full_name ?? ""}` : null,
            `${students.length} child${students.length === 1 ? "" : "ren"}`,
          ]
            .filter(Boolean)
            .join(" · ")
        }
      >
        <ContactLinks phone={client.whatsapp ?? client.phone} />
        <Link href={`/admin/students/new?client=${id}`} className={linkBtnOutline}>
          Add child
        </Link>
      </PageHeader>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Kpi label="Agreed fees (all children)" value={fee} />
        <Kpi label="Paid" value={paid} />
        <Kpi label="Balance" value={Math.max(0, fee - paid)} tone={fee - paid > 0.004 ? "warn" : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle className="mb-2">Contact</SectionTitle>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {(
              [
                ["Phone", client.phone],
                ["WhatsApp", client.whatsapp],
                ["Second phone", client.phone2],
                ["Email", client.email],
                ["Emirate / area", [client.emirate, client.area].filter(Boolean).join(", ")],
                ["Address", client.address],
              ] as Array<[string, string | null]>
            ).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-seedrix-black/55">{k}</dt>
                <dd className="min-w-0 break-words">{v || "—"}</dd>
              </div>
            ))}
          </dl>
          {client.notes ? <p className="mt-2 whitespace-pre-wrap text-sm text-seedrix-black/70">{client.notes}</p> : null}
        </Card>
        <Card>
          <SectionTitle className="mb-2">Lead history</SectionTitle>
          {l ? (
            <>
              <p className="text-sm">
                <Link href={`/admin/leads/${l.id}`} className="font-bold text-seedrix-green underline">
                  {l.name}
                </Link>{" "}
                <StagePill stage={l.stage} /> · first contact {fmtDate(l.first_contact_on ?? l.created_at.slice(0, 10))}
              </p>
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {((notes ?? []) as LeadNote[]).map((n) => (
                  <li key={n.id} className="border-s-2 border-seedrix-green/30 ps-2">
                    <span className="text-xs text-seedrix-black/50">
                      {fmtDateTime(n.created_at)} · {n.created_by ? (who.get(n.created_by) ?? "Staff") : "Import"}
                    </span>
                    <div className="line-clamp-3 whitespace-pre-wrap">{n.body}</div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-seedrix-black/55">No linked lead.</p>
          )}
        </Card>
      </div>

      <section className="flex flex-col gap-2">
        <SectionTitle>Children / students</SectionTitle>
        <div className="grid gap-2 md:grid-cols-2">
          {students.map((s) => (
            <Card key={s.id} className="text-sm">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/admin/students/${s.id}`} className="font-bold hover:underline">
                  {s.name}
                </Link>
                <BalancePill fee={s.agreed_fee} paid={paidByStudent(s.id, payments)} />
              </div>
              <div className="mt-1 text-seedrix-black/70">
                {[
                  s.grade,
                  s.school,
                  s.curriculum ? CURRICULUM_LABEL[s.curriculum] : null,
                  s.subjects,
                  s.delivery_mode ? DELIVERY_LABEL[s.delivery_mode] : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "No learning details yet"}
              </div>
              <div className="mt-1 text-xs text-seedrix-black/55">
                Teacher: {s.teacher_id ? teacherName.get(s.teacher_id) : "—"} · {s.schedule ?? "no schedule"} · fee{" "}
                <Money value={s.agreed_fee} />
              </div>
            </Card>
          ))}
          {!students.length ? <p className="text-sm text-seedrix-black/55">No children added yet.</p> : null}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <SectionTitle>Payments</SectionTitle>
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Child</Th>
              <Th num>Amount</Th>
              <Th>How</Th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className={cn(p.void && "text-seedrix-black/40 line-through")}>
                <Td>
                  <Link href={`/admin/payments/${p.id}`} className="font-bold hover:underline">
                    {fmtDate(p.paid_on)}
                  </Link>
                </Td>
                <Td>{studentName.get(p.student_id)}</Td>
                <Td num>
                  <Money value={p.amount} />
                </Td>
                <Td>
                  <MethodLabel method={p.method} />
                </Td>
              </tr>
            ))}
            {!payments.length ? (
              <tr>
                <Td colSpan={4} className="text-center text-seedrix-black/55">
                  No payments yet.
                </Td>
              </tr>
            ) : null}
          </tbody>
        </Table>
      </section>

      <section className="flex flex-col gap-2">
        <SectionTitle>Invoices</SectionTitle>
        <Table>
          <thead>
            <tr>
              <Th>Number</Th>
              <Th>Child</Th>
              <Th num>Total</Th>
              <Th num>Paid</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((i) => (
              <tr key={i.id}>
                <Td>
                  <Link href={`/admin/invoices/${i.id}`} className="font-mono text-xs font-bold hover:underline">
                    {i.invoice_number}
                  </Link>
                </Td>
                <Td>{i.student_id ? studentName.get(i.student_id) : ""}</Td>
                <Td num>
                  <Money value={Number(i.total_aed)} />
                </Td>
                <Td num>
                  <Money value={Number(i.amount_paid)} />
                </Td>
                <Td>
                  <InvoiceStatusPill status={i.status} />
                </Td>
              </tr>
            ))}
            {!invoices.length ? (
              <tr>
                <Td colSpan={5} className="text-center text-seedrix-black/55">
                  No invoices yet.
                </Td>
              </tr>
            ) : null}
          </tbody>
        </Table>
      </section>

      <Card>
        <details>
          <summary className="cursor-pointer text-base font-bold text-seedrix-darkest">Edit client</summary>
          <div className="mt-3">
            <ActionForm action={saveClient.bind(null, id)} submitLabel="Save changes">
              <ClientFields client={client} staff={staff} canAssign={manager} />
            </ActionForm>
          </div>
        </details>
      </Card>
    </>
  );
}
