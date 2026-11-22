import Link from "next/link";
import { notFound } from "next/navigation";
import { updateStudent } from "@/app/admin/actions/students";
import { ActionForm } from "@/components/portal/action-form";
import { BalancePill, BankPill, ContactLinks, MethodLabel } from "@/components/portal/bits";
import { Card, Kpi, Money, PageHeader, SectionTitle, Table, Td, Th, linkBtnOutline, linkBtnPrimary } from "@/components/portal/ui";
import { StudentFields } from "@/components/portal/student-fields";
import { bankState, paidByStudent, studentBalance } from "@/lib/ledger/balances";
import { fmtDate } from "@/lib/ledger/dates";
import { requireStaff } from "@/lib/portal/auth";
import { loadMatches, loadStaff, loadTeachers } from "@/lib/portal/data";
import { PAYOUT_LABEL, type ClientPayment, type Payout, type Student } from "@/lib/portal/types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireStaff();
  const [{ data: st }, { data: pays }, staff, teachers, matches] = await Promise.all([
    supabase.from("students").select("*").eq("id", id).maybeSingle(),
    supabase.from("client_payments").select("*").eq("student_id", id).order("paid_on", { ascending: false }),
    loadStaff(supabase),
    loadTeachers(supabase),
    loadMatches(supabase),
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
  const payIds = payments.map((p) => p.id);
  const { data: outs } = payIds.length
    ? await supabase.from("payouts").select("*").in("client_payment_id", payIds).order("paid_on", { ascending: false })
    : { data: [] };
  const payouts = ((outs ?? []) as Payout[]).map((o) => ({ ...o, amount: Number(o.amount) }));
  const paid = paidByStudent(id, payments);
  const balance = studentBalance(student, payments);
  const repName = new Map(staff.map((s) => [s.id, s.full_name]));

  return (
    <>
      <PageHeader
        title={student.name}
        sub={
          <span className="flex flex-wrap items-center gap-2">
            <BalancePill fee={student.agreed_fee} paid={paid} />
            {student.course ? <span>{student.course}</span> : null}
            {student.lead_id ? (
              <Link href={`/admin/leads/${student.lead_id}`} className="font-bold text-seedrix-green underline">
                Lead history
              </Link>
            ) : null}
          </span>
        }
      >
        <ContactLinks phone={student.phone} />
        <Link href={`/admin/payments/new?student=${id}`} className={linkBtnPrimary}>
          Record payment
        </Link>
      </PageHeader>

      <div className="grid grid-cols-3 gap-2">
        <Kpi label="Agreed fee" value={student.agreed_fee} />
        <Kpi label="Paid" value={paid} note={`${payments.filter((p) => !p.void).length} payment(s)`} />
        <Kpi label={balance < 0 ? "Paid over fee" : "Still owes"} value={Math.abs(balance)} tone={balance < 0 ? "bad" : balance > 0 ? "warn" : undefined} note={student.next_payment_date ? `Next due ${fmtDate(student.next_payment_date)}` : undefined} />
      </div>

      <section className="flex flex-col gap-2">
        <SectionTitle>Payments</SectionTitle>
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th num>Amount</Th>
              <Th>How</Th>
              <Th>Rep</Th>
              <Th num>Teacher</Th>
              <Th num>Commission</Th>
              <Th num>Academy</Th>
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
                  <Td num>
                    <Money value={p.teacher_share} />
                  </Td>
                  <Td num>
                    <Money value={p.commission} />
                  </Td>
                  <Td num>
                    <Money value={p.academy} />
                  </Td>
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

      <Card>
        <details>
          <summary className="cursor-pointer text-base font-bold text-seedrix-darkest">Edit student</summary>
          <div className="mt-3">
            <ActionForm action={updateStudent.bind(null, id)} submitLabel="Save changes">
              <StudentFields student={student} staff={staff} teachers={teachers} />
            </ActionForm>
          </div>
        </details>
      </Card>
    </>
  );
}
