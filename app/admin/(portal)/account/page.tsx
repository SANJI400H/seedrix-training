import { updatePassword } from "@/app/admin/actions/settings";
import { ActionForm } from "@/components/portal/action-form";
import { Card, Field, Notice, PageHeader, inputCls } from "@/components/portal/ui";
import { requireStaff } from "@/lib/portal/auth";

export const metadata = { title: "Your account" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { me } = await requireStaff();
  const sp = await searchParams;
  return (
    <>
      <PageHeader title="Your account" sub={`${me.staff.full_name} · ${me.email ?? ""} · ${me.role}`} />
      {sp.welcome ? <Notice tone="good">Welcome! Set a password so you can sign in on your phone next time.</Notice> : null}
      <Card className="max-w-md">
        <ActionForm action={updatePassword} submitLabel="Save password" resetOnSuccess>
          <Field label="New password" hint="At least 10 characters.">
            <input className={inputCls} name="password" type="password" autoComplete="new-password" required minLength={10} />
          </Field>
          <Field label="Repeat password">
            <input className={inputCls} name="password2" type="password" autoComplete="new-password" required />
          </Field>
        </ActionForm>
      </Card>
    </>
  );
}
