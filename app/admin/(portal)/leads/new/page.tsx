import { createLead } from "@/app/admin/actions/leads";
import { ActionForm } from "@/components/portal/action-form";
import { LeadFields } from "@/components/portal/lead-fields";
import { Card, PageHeader } from "@/components/portal/ui";
import { isManager, requireStaff } from "@/lib/portal/auth";
import { loadStaff } from "@/lib/portal/data";

export const metadata = { title: "Add lead" };

export default async function NewLeadPage() {
  const { supabase, me } = await requireStaff();
  const staff = await loadStaff(supabase);
  return (
    <>
      <PageHeader title="Add a lead" sub="Anyone who asked about classes: social, referral, walk-in. Leads you add are assigned to you." />
      <Card>
        <ActionForm action={createLead} submitLabel="Save lead">
          <LeadFields staff={staff} withNote defaultRepId={isManager(me.role) ? undefined : me.staff.id} canAssign={isManager(me.role)} />
        </ActionForm>
      </Card>
    </>
  );
}
