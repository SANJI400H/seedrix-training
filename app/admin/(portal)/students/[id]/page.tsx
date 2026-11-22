import Link from "next/link";
import { notFound } from "next/navigation";
import { issueBill, updateStudent } from "@/app/admin/actions/students";
import { ActionForm } from "@/components/portal/action-form";
import { BalancePill, BankPill, ContactLinks, InvoiceStatusPill, MethodLabel } from "@/components/portal/bits";
import { StudentFields } from "@/components/portal/student-fields";
import { Card, Field, Grid, Kpi, Money, PageHeader, SectionTitle, Table, Td, Th, inputCls, linkBtnOutline, linkBtnPrimary } from "@/components/portal/ui";
import { bankState, paidByStudent, studentBalance } from "@/lib/ledger/balances";
import { fmtDate } from "@/lib/ledger/dates";
import { isManager, requireStaff } from "@/lib/portal/auth";
import { loadClients, loadMatches, loadStaff, loadTeachers } from "@/lib/portal/data";
import { CURRICULUM_LABEL, DELIVERY_LABEL, PAYOUT_LABEL, type ClientPayment, type Invoice, type Payout, type Student } from "@/lib/portal/types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, me } = await requireStaff();
  const manager = isManager(me.role);
  const [{ data: st }, { data: pays }, { data: invs }, staff, teachers, matches, clients] = await Promise.all([
    supabase.from("students").select("*").eq("id", id).maybeSingle(),
    supabase.from("client_payments").select("*").eq("student_id", id).order("paid_on", { ascending: false }),
    supabase.from("invoices").select("*").eq("student_id", id).order("created_at", { ascending: false }),
    loadStaff(supabase),
    loadTeachers(supabase),
    loadMatches(supabase),
    loadClients(supabase),
  ]);
  if (!st) notFound();
  const student = { ...(st as Student), agreed_fee: Number(st.agreed_fee) };
  const payments = ((pays ?? []) as ClientPayment[]).map((p) => ({
    ...p,
    amount: Number(p.amount),
    teacher_share: Number(p.teacher_share),
    commission: Number(p.commission),
    academy: Number(p.academy),
  }));
  const invoices = (invs ?? []) as Invoice[];
  const payIds = payments.map((p) => p.id);
  const { data: outs } =
    manager && payIds.length
      ? await supabase.from("payouts").select("*").in("client_payment_id", payIds).order("paid_on", { ascending: false })
      : { data: [] };
  const payouts = ((outs ?? []) as Payout[]).map((o) => ({ ...o, amount: Number(o.amount) }));
  const paid = paidByStudent(id, payments);
  const balance = studentBalance(student, payments);
  const repName = new Map(staff.map((s) => [s.id, s.full_name]));
  const teacher = teachers.find((t) => t.id === student.teacher_id);
  const client = clients.find((c) => c.id === student.client_id);

  return (
    <>
      <PageHeader
        title={student.name}
        sub={
          <span className="flex flex-wrap items-center gap-2">
            <BalancePill fee={student.agreed_fee} paid={paid} />
            {client ? (
              <span>
                Client:{" "}
                <Link href={`/admin/clients/${client.id}`} className="font-bold text-seedrix-green underline">
                  {client.name}
                </Link>
              </span>
            ) : null}
            {student.lead_id ? (
              <Link href={`/admin/leads/${student.lead_id}`} className="font-bold text-seedrix-green underline">
                Lead history
              </Link>
            ) : null}
          </span>
        }
      >
        <ContactLinks phone={client?.whatsapp ?? client?.phone ?? student.phone} />
        <Link href={`/admin/payments/new?student=${id}`} className={linkBtnPrimary}>
          Record payment
        </Link>
      </PageHeader>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Kpi label="Agreed fee" value={student.agreed_fee} />
        <Kpi label="Paid" value={paid} note={`${payments.filter((p) => !p.void).length} payment(s)`} />
        <Kpi
          label={balance < 0 ? "Paid over fee" : "Still owes"}
          value={Math.abs(balance)}
          tone={balance < 0 ? "bad" : balance > 0 ? "warn" : undefined}
          note={student.next_payment_date ? `Next due ${fmtDate(student.next_payment_date)}` : undefined}
        />
      </div>

      <Card>
        <SectionTitle className="mb-2">Learning</SectionTitle>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr_auto_1fr]">
          {(
            [
              ["Grade", student.grade],
              ["School", student.school],
              ["Curriculum", student.curriculum ? CURRICULUM_LABEL[student.curriculum] : null],
              ["Subjects", student.subjects],
              ["Course", student.course],
              ["Delivery", student.delivery_mode ? DELIVERY_LABEL[student.delivery_mode] : null],
              ["Teacher", teacher ? teacher.name : null],
              ["Schedule", student.schedule],
              ["Start date", fmtDate(student.start_date)],
              ["Sales rep", student.rep_id ? repName.get(student.rep_id) : null],
            ] as Array<[string, string | null | undefined]>
          ).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-seedrix-black/55">{k}</dt>
              <dd className="min-w-0 break-words">
                {k === "Teacher" && teacher ? (
                  <Link className="font-bold text-seedrix-green underline" href={`/admin/teachers/${teacher.id}`}>
                    {teacher.name}
                  </Link>
                ) : (
                  v || "—"
                )}
              </dd>
            </div>
          ))}
        </dl>
        {student.notes ? <p className="mt-2 whitespace-pre-wrap text-sm text-seedrix-black/70">{student.notes}</p> : null}
      </Card>

      <section className="flex flex-col gap-2">
        <SectionTitle>Payments</SectionTitle>
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th num>Amount</Th>
              <Th>How</Th>
              <Th>Rep</Th>
              {manager ? (
                <>
                  <Th num>Teacher</Th>
                  <Th num>Commission</Th>
                  <Th num>Academy</Th>
                </>
              ) : (
                <Th num>Your commission</Th>
              )}
              <Th>Bank</Th>
            </tr>
          </thead>
          <tbody>
            {payments.length ? (
              payments.map((p) => (
                <tr key={p.id} className={cn(p.void && "text-seedrix-black/40 line-through")}>
                  <Td>
                    <Link href={`/admin/payments/${p.id}`} className="font-bold hover:underline">
                      {fmtDate(p.paid_on)}
                    </Link>
                  </Td>
                  <Td num>
                    <Money value={p.amount} />
                  </Td>
                  <Td>
                    <MethodLabel method={p.method} />
                  </Td>
                  <Td>{p.rep_id ? repName.get(p.rep_id) : "—"}</Td>
                  {manager ? (
                    <>
                      <Td num>
                        <Money value={p.teacher_share} />
                      </Td>
                      <Td num>
                        <Money value={p.commission} />
                      </Td>
                      <Td num>
                        <Money value={p.academy} />
                      </Td>
                    </>
                  ) : (
                    <Td num>{p.rep_id === me.staff.id ? <Money value={p.commission} /> : "—"}</Td>
                  )}
                  <Td>
                    <BankPill state={bankState(p, "payment", matches)} isVoid={p.void} />
                  </Td>
                </tr>
              ))
            ) : (
              <tr>
                <Td colSpan={8} className="text-center text-seedrix-black/55">
                  No payments yet.
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
      </section>

      <section className="flex flex-col gap-2">
        <SectionTitle>Invoices</SectionTitle>
        <Table>
          <thead>
            <tr>
              <Th>Number</Th>
              <Th>Date</Th>
              <Th>Type</Th>
              <Th num>Total</Th>
              <Th num>Paid</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {invoices.length ? (
              invoices.map((i) => (
                <tr key={i.id}>
                  <Td>
                    <Link href={`/admin/invoices/${i.id}`} className="font-mono text-xs font-bold hover:underline">
                      {i.invoice_number}
                    </Link>
                  </Td>
                  <Td>{fmtDate(i.created_at.slice(0, 10))}</Td>
                  <Td>{i.kind === "bill" ? "Invoice (to pay)" : "Payment receipt"}</Td>
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
              ))
            ) : (
              <tr>
                <Td colSpan={6} className="text-center text-seedrix-black/55">
                  No invoices yet. Every recorded payment gets one automatically.
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
        <Card>
          <details>
            <summary className="cursor-pointer text-sm font-bold text-seedrix-darkest">Issue an invoice for a balance or new course fee</summary>
            <div className="mt-3">
              <ActionForm action={issueBill.bind(null, id)} submitLabel="Create invoice">
                <Grid cols={3}>
                  <Field label="Amount due (AED)">
                    <input
                      className={inputCls}
                      name="amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      inputMode="decimal"
                      required
                      defaultValue={balance > 0 ? balance.toFixed(2) : ""}
                    />
                  </Field>
                  <Field label="Due date">
                    <input className={inputCls} name="due_date" type="date" />
                  </Field>
                  <Field label="Description">
                    <input className={inputCls} name="description" placeholder="Balance for October / new 12-class course" />
                  </Field>
                </Grid>
              </ActionForm>
            </div>
          </details>
        </Card>
      </section>

      {manager ? (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <SectionTitle>Payouts for this student</SectionTitle>
            <Link href="/admin/payouts/new" className={linkBtnOutline}>
              Record payout
            </Link>
          </div>
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Type</Th>
                <Th>Paid to</Th>
                <Th num>Amount</Th>
                <Th>Bank</Th>
              </tr>
            </thead>
            <tbody>
              {payouts.length ? (
                payouts.map((o) => (
                  <tr key={o.id} className={cn(o.void && "text-seedrix-black/40 line-through")}>
                    <Td>
                      <Link href={`/admin/payouts/${o.id}`} className="font-bold hover:underline">
                        {fmtDate(o.paid_on)}
                      </Link>
                    </Td>
                    <Td>{PAYOUT_LABEL[o.type]}</Td>
                    <Td>{o.payee}</Td>
                    <Td num>
                      <Money value={o.amount} />
                    </Td>
                    <Td>
                      <BankPill state={bankState(o, "payout", matches)} isVoid={o.void} />
                    </Td>
                  </tr>
                ))
              ) : (
                <tr>
                  <Td colSpan={5} className="text-center text-seedrix-black/55">
                    No payouts linked to this student&apos;s payments.
                  </Td>
                </tr>
              )}
            </tbody>
          </Table>
        </section>
      ) : null}

      <Card>
        <details>
          <summary className="cursor-pointer text-base font-bold text-seedrix-darkest">Edit student</summary>
          <div className="mt-3">
            <ActionForm action={updateStudent.bind(null, id)} submitLabel="Save changes">
              <StudentFields student={student} staff={staff} teachers={teachers} clients={clients} canAssign={manager} />
            </ActionForm>
          </div>
        </details>
      </Card>
    </>
  );
}
