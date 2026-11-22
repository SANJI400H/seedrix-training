import Link from "next/link";
import { BalancePill, ContactLinks } from "@/components/portal/bits";
import { Empty, Money, PageHeader, Pill, Table, Td, Th, inputCls, linkBtnOutline, linkBtnPrimary } from "@/components/portal/ui";
import { paidByStudent, studentBalance } from "@/lib/ledger/balances";
import { fmtDate, todayDubai } from "@/lib/ledger/dates";
import { requireStaff } from "@/lib/portal/auth";
import { loadPayments, loadStaff, loadStudents, loadTeachers } from "@/lib/portal/data";
import { cn } from "@/lib/utils";

export const metadata = { title: "Students" };
export const dynamic = "force-dynamic";

type SP = { q?: string; filter?: string; rep?: string; status?: string };

export default async function StudentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { supabase } = await requireStaff();
  const sp = await searchParams;
  const [students, payments, staff, teachers] = await Promise.all([
    loadStudents(supabase),
    loadPayments(supabase),
    loadStaff(supabase),
    loadTeachers(supabase),
  ]);
  const repName = new Map(staff.map((s) => [s.id, s.full_name]));
  const teacherName = new Map(teachers.map((t) => [t.id, t.name]));
  const today = todayDubai();
  const q = (sp.q ?? "").toLowerCase();
  const status = sp.status ?? "current";

  const rows = students
    .map((s) => ({ s, paid: paidByStudent(s.id, payments), balance: studentBalance(s, payments) }))
    .filter(
      ({ s, balance }) =>
        (status === "all" || (status === "current" ? s.status !== "archived" && s.status !== "cancelled" : s.status === status)) &&
        (!sp.rep || s.rep_id === sp.rep) &&
        (!q || [s.name, s.phone, s.payer_name, s.course].join(" ").toLowerCase().includes(q)) &&
        (!sp.filter ||
          (sp.filter === "owes" && balance > 0.004) ||
          (sp.filter === "over" && balance < -0.004) ||
          (sp.filter === "overdue" && balance > 0.004 && !!s.next_payment_date && s.next_payment_date < today)),
    );

  const totalOwed = rows.reduce((a, r) => a + Math.max(0, r.balance), 0);

  return (
    <>
      <PageHeader title="Students" sub={`${rows.length} shown · clients in this view still owe AED ${totalOwed.toFixed(2)}`}>
        <Link href="/admin/students/new" className={linkBtnPrimary}>
          Add student
        </Link>
      </PageHeader>
      <form className="flex flex-wrap gap-2" method="get">
        <input name="q" defaultValue={sp.q} placeholder="Search name, phone, payer" className={cn(inputCls, "flex-[2_1_200px]")} />
        <select name="filter" defaultValue={sp.filter ?? ""} className={cn(inputCls, "flex-[1_1_140px]")}>
          <option value="">Any balance</option>
          <option value="owes">Still owes</option>
          <option value="overdue">Overdue</option>
          <option value="over">Paid more than fee</option>
        </select>
        <select name="rep" defaultValue={sp.rep ?? ""} className={cn(inputCls, "flex-[1_1_140px]")}>
          <option value="">All reps</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={status} className={cn(inputCls, "flex-[1_1_140px]")}>
          <option value="current">Current</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="finished">Finished</option>
          <option value="cancelled">Cancelled</option>
          <option value="archived">Archived</option>
          <option value="all">All</option>
        </select>
        <button className={linkBtnOutline} type="submit">
          Filter
        </button>
      </form>
      <Table>
        <thead>
          <tr>
            <Th>Student</Th>
            <Th>Course</Th>
            <Th>Rep</Th>
            <Th>Teacher</Th>
            <Th num>Agreed fee</Th>
            <Th num>Paid</Th>
            <Th>Balance</Th>
            <Th>Next payment</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map(({ s, paid }) => (
              <tr key={s.id} className={cn(s.status === "archived" && "opacity-60")}>
                <Td>
                  <Link href={`/admin/students/${s.id}`} className="font-bold hover:underline">
                    {s.name}
                  </Link>
                  {s.status !== "active" ? <Pill className="ms-1">{s.status}</Pill> : null}
                  <div className="mt-1">
                    <ContactLinks phone={s.phone} />
                  </div>
                </Td>
                <Td className="max-w-[14rem]">
                  <span className="line-clamp-2">{s.course}</span>
                </Td>
                <Td>{s.rep_id ? repName.get(s.rep_id) : "—"}</Td>
                <Td>{s.teacher_id ? teacherName.get(s.teacher_id) : "—"}</Td>
                <Td num>
                  <Money value={s.agreed_fee} />
                </Td>
                <Td num>
                  <Money value={paid} />
                </Td>
                <Td>
                  <BalancePill fee={s.agreed_fee} paid={paid} />
                </Td>
                <Td className={cn("whitespace-nowrap", s.next_payment_date && s.next_payment_date < today && "text-red-700")}>
                  {fmtDate(s.next_payment_date)}
                </Td>
              </tr>
            ))
          ) : (
            <tr>
              <Td colSpan={8}>
                <Empty title={students.length ? "No students match" : "No students yet"}>
                  {students.length ? "Try other filters." : "Convert a lead, or add a student with their agreed fee."}
                </Empty>
              </Td>
            </tr>
          )}
        </tbody>
      </Table>
    </>
  );
}
