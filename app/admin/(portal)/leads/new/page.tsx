import { createLead } from "@/app/admin/actions/leads";
import { ActionForm } from "@/components/portal/action-form";
import { LeadFields } from "@/components/portal/lead-fields";
import { Card, PageHeader } from "@/components/portal/ui";
import { requireStaff } from "@/lib/portal/auth";
import { loadStaff } from "@/lib/portal/data";

export const metadata = { title: "Add lead" };

export default async function NewLeadPage() {
  const { supabase, me } = await requireStaff();
  const staff = await loadStaff(supabase);
  return (
    <>
      <PageHeader title="Add a lead" sub="Anyone who asked about classes: social, referral, walk-in." />
      <Card>
        <ActionForm action={createLead} submitLabel="Save lead">
          <LeadFields staff={staff} withNote defaultRepId={me.staff.id} />
        </ActionForm>
      </Card>
    </>
  );
}
