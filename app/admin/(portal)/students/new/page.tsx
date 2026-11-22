import { createStudent } from "@/app/admin/actions/students";
import { ActionForm } from "@/components/portal/action-form";
import { StudentFields } from "@/components/portal/student-fields";
import { Card, PageHeader } from "@/components/portal/ui";
import { requireStaff } from "@/lib/portal/auth";
import { loadStaff, loadTeachers } from "@/lib/portal/data";

export const metadata = { title: "Add student" };

export default async function NewStudentPage() {
  const { supabase } = await requireStaff();
  const [staff, teachers] = await Promise.all([loadStaff(supabase), loadTeachers(supabase)]);
  return (
    <>
      <PageHeader title="Add a student" sub="Prefer “Convert to student” from a lead so the history stays linked." />
      <Card>
        <ActionForm action={createStudent} submitLabel="Add student">
          <StudentFields staff={staff} teachers={teachers} />
        </ActionForm>
      </Card>
    </>
  );
}
