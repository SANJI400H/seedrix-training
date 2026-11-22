import { redirect } from "next/navigation";
import { Logo } from "@/components/marketing/logo";
import { ActionForm } from "@/components/portal/action-form";
import { Field, inputCls, Notice } from "@/components/portal/ui";
import { getMe } from "@/lib/portal/auth";
import { portalEnv } from "@/lib/portal/supabase-server";
import { sendMagicLink, sendPasswordReset, signInWithPassword } from "./actions";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const next = sp.next?.startsWith("/admin") ? sp.next : "/admin";
  const configured = !!portalEnv();
  if (configured) {
    const { me } = await getMe();
    if (me?.staff) redirect(next);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-5 px-4 py-10">
      <div className="flex items-center gap-3 rounded-[12px] bg-seedrix-darkest px-4 py-3">
        <Logo variant="white" priority className="h-8 sm:h-8" />
        <span className="text-sm font-bold text-seedrix-mint">Staff portal</span>
      </div>
      {!configured || sp.error === "not_configured" ? (
        <Notice tone="bad">
          Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see
          docs/STAFF_PORTAL.md).
        </Notice>
      ) : null}
      {sp.error === "link" ? <Notice tone="bad">That sign-in link has expired or was already used. Request a new one.</Notice> : null}

      <section className="rounded-[12px] border border-seedrix-darkest/10 bg-seedrix-white p-4">
        <h1 className="mb-3 text-lg font-bold text-seedrix-darkest">Sign in</h1>
        <ActionForm action={signInWithPassword} submitLabel="Sign in">
          <input type="hidden" name="next" value={next} />
          <Field label="Email">
            <input className={inputCls} name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Password">
            <input className={inputCls} name="password" type="password" autoComplete="current-password" required />
          </Field>
        </ActionForm>
      </section>

      <details className="rounded-[12px] border border-seedrix-darkest/10 bg-seedrix-white p-4">
        <summary className="cursor-pointer text-sm font-bold text-seedrix-darkest">Email me a sign-in link instead</summary>
        <div className="mt-3">
          <ActionForm action={sendMagicLink} submitLabel="Send link" submitVariant="outline">
            <input type="hidden" name="next" value={next} />
            <Field label="Email">
              <input className={inputCls} name="email" type="email" autoComplete="email" required />
            </Field>
          </ActionForm>
        </div>
      </details>

      <details className="rounded-[12px] border border-seedrix-darkest/10 bg-seedrix-white p-4">
        <summary className="cursor-pointer text-sm font-bold text-seedrix-darkest">Forgot password</summary>
        <div className="mt-3">
          <ActionForm action={sendPasswordReset} submitLabel="Send reset link" submitVariant="outline">
            <Field label="Email">
              <input className={inputCls} name="email" type="email" autoComplete="email" required />
            </Field>
          </ActionForm>
        </div>
      </details>
    </main>
  );
}
