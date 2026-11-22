import { redirect } from "next/navigation";
import { Notice } from "@/components/portal/ui";
import { getMe } from "@/lib/portal/auth";
import { signOut } from "../login/actions";

export const metadata = { title: "No access" };

export default async function NoAccessPage() {
  const { me } = await getMe();
  if (!me) redirect("/admin/login");
  if (me.staff) redirect("/admin");
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4">
      <h1 className="text-xl font-bold text-seedrix-darkest">No staff access yet</h1>
      <Notice tone="warn">
        You are signed in as <b>{me.email}</b>, but this account is not on the staff list or has been deactivated.
        Ask the owner to invite you from Settings → Staff.
      </Notice>
      <form action={signOut}>
        <button className="text-sm font-bold text-seedrix-green underline" type="submit">
          Sign out
        </button>
      </form>
    </main>
  );
}
