import { savePayment } from "@/app/admin/actions/payments";
import { PaymentForm } from "@/components/portal/payment-form";
import { Card, PageHeader } from "@/components/portal/ui";
import { paidByStudent } from "@/lib/ledger/balances";
import { todayDubai } from "@/lib/ledger/dates";
import { requireStaff } from "@/lib/portal/auth";
import { loadPayments, loadSettings, loadStaff, loadStudents } from "@/lib/portal/data";

export const metadata = { title: "Record payment" };
export const dynamic = "force-dynamic";

export default async function NewPaymentPage({ searchParams }: { searchParams: Promise<{ student?: string }> }) {
  const { supabase, me } = await requireStaff();
  const sp = await searchParams;
  const [students, payments, staff, settings] = await Promise.all([
    loadStudents(supabase),
    loadPayments(supabase),
    loadStaff(supabase),
    loadSettings(supabase),
  ]);
  const options = students
    .filter((s) => s.status !== "archived")
    .map((s) => ({
      id: s.id,
      name: s.name,
      agreed_fee: s.agreed_fee,
      paid: paidByStudent(s.id, payments),
      rep_id: s.rep_id,
      payer_name: s.payer_name,
    }));
  return (
    <>
      <PageHeader title="Record a payment" sub="Record it now, when the money arrives. Your name is saved with the entry." />
      <Card>
        <PaymentForm
          action={savePayment.bind(null, null)}
          students={options}
          staff={staff.filter((s) => s.active).map((s) => ({ id: s.id, full_name: s.full_name }))}
          salesPct={settings.sales_pct}
          defaultStudentId={sp.student}
          defaultRepId={me.staff.id}
          today={todayDubai()}
        />
      </Card>
    </>
  );
}
