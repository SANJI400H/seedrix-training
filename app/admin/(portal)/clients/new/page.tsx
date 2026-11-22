import { saveClient } from "@/app/admin/actions/students";
import { ActionForm } from "@/components/portal/action-form";
import { ClientFields } from "@/components/portal/client-fields";
import { Card, PageHeader } from "@/components/portal/ui";
import { isManager, requireStaff } from "@/lib/portal/auth";
import { loadStaff } from "@/lib/portal/data";

export const metadata = { title: "Add client" };

export default async function NewClientPage() {
  const { supabase, me } = await requireStaff();
  const staff = await loadStaff(supabase);
  return (
    <>
      <PageHeader title="Add a client" sub="The parent or payer. Add their children as students afterwards." />
      <Card>
        <ActionForm action={saveClient.bind(null, null)} submitLabel="Save client">
          <ClientFields staff={staff} canAssign={isManager(me.role)} />
        </ActionForm>
      </Card>
    </>
  );
}
