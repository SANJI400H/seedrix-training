import { savePayout } from "@/app/admin/actions/payouts";
import { PayoutForm } from "@/components/portal/payout-form";
import { Card, PageHeader } from "@/components/portal/ui";
import { todayDubai } from "@/lib/ledger/dates";
import { requireStaff } from "@/lib/portal/auth";
import { loadLedger } from "@/lib/portal/data";
import { paymentOptions, payoutLikes } from "@/lib/portal/payout-options";

export const metadata = { title: "Record payout" };
export const dynamic = "force-dynamic";

export default async function NewPayoutPage({ searchParams }: { searchParams: Promise<{ payment?: string }> }) {
  const { supabase } = await requireStaff();
  const sp = await searchParams;
  const ledger = await loadLedger(supabase);
  return (
    <>
      <PageHeader title="Record a payout" sub="Teacher pay, commission, refunds or other money sent out of the account." />
      <Card>
        <PayoutForm
          action={savePayout.bind(null, null)}
          payments={paymentOptions(ledger)}
          payouts={payoutLikes(ledger)}
          teachers={ledger.teachers.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name }))}
          staff={ledger.staff.filter((s) => s.active).map((s) => ({ id: s.id, full_name: s.full_name }))}
          today={todayDubai()}
          defaultPaymentId={sp.payment}
        />
      </Card>
    </>
  );
}
