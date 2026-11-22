import { saveTeacher } from "@/app/admin/actions/teachers";
import { ActionForm } from "@/components/portal/action-form";
import { TeacherFields } from "@/components/portal/teacher-fields";
import { Card, PageHeader } from "@/components/portal/ui";
import { requireManager } from "@/lib/portal/auth";

export const metadata = { title: "Add teacher" };

export default async function NewTeacherPage() {
  await requireManager();
  return (
    <>
      <PageHeader title="Add a teacher" />
      <Card>
        <ActionForm action={saveTeacher.bind(null, null)} submitLabel="Add teacher">
          <TeacherFields />
        </ActionForm>
      </Card>
    </>
  );
}
