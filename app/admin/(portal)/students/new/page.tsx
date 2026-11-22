import { createStudent } from "@/app/admin/actions/students";
import { ActionForm } from "@/components/portal/action-form";
import { StudentFields } from "@/components/portal/student-fields";
import { Card, PageHeader } from "@/components/portal/ui";
import { isManager, requireStaff } from "@/lib/portal/auth";
import { loadClients, loadStaff, loadTeachers } from "@/lib/portal/data";

export const metadata = { title: "Add student" };

export default async function NewStudentPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const { supabase, me } = await requireStaff();
  const sp = await searchParams;
  const [staff, teachers, clients] = await Promise.all([loadStaff(supabase), loadTeachers(supabase), loadClients(supabase)]);
  return (
    <>
      <PageHeader title="Add a student" sub="Prefer “Convert to student” from a lead so the history stays linked." />
      <Card>
        <ActionForm action={createStudent} submitLabel="Add student">
          <StudentFields staff={staff} teachers={teachers} clients={clients} canAssign={isManager(me.role)} defaultClientId={sp.client} />
        </ActionForm>
      </Card>
    </>
  );
}
