import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getPortalClient } from "@/lib/portal/supabase-server";

/**
 * Handles links from Supabase emails:
 *   ?code=...                       (PKCE magic link / password reset)
 *   ?token_hash=...&type=invite     (recommended email templates, see docs)
 * Links that carry tokens in the #hash go to /admin/auth/callback instead.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const rawNext = url.searchParams.get("next") ?? "/admin";
  let next = rawNext.startsWith("/admin") && !rawNext.startsWith("//") ? rawNext : "/admin";
  if (type === "invite" || type === "recovery") next = "/admin/account?welcome=1";

  const supabase = await getPortalClient();
  if (!supabase) return NextResponse.redirect(new URL("/admin/login?error=not_configured", url));

  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  }
  return NextResponse.redirect(new URL(ok ? next : "/admin/login?error=link", url));
}
