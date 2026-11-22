"use client";

import { createBrowserClient } from "@supabase/ssr";
import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Landing page for Supabase invite links that put the session in the URL
 * #hash (the default invite email template). Stores the session in cookies
 * and sends the new staff member to set a password.
 */
export default function AuthCallbackPage() {
  const [msg, setMsg] = useState("Signing you in…");

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      setMsg("The portal is not configured yet.");
      return;
    }
    const search = new URLSearchParams(window.location.search);
    if (search.get("code") || search.get("token_hash")) {
      window.location.replace(`/admin/auth/confirm${window.location.search}`);
      return;
    }
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const access_token = hash.get("access_token");
    const refresh_token = hash.get("refresh_token");
    const type = hash.get("type");
    if (hash.get("error_description")) {
      setMsg(hash.get("error_description") ?? "The link is not valid.");
      return;
    }
    if (!access_token || !refresh_token) {
      setMsg("This link is missing its sign-in details. Ask the owner to send a new invite.");
      return;
    }
    const supabase = createBrowserClient(url, key);
    supabase.auth.setSession({ access_token, refresh_token }).then(({ error }) => {
      if (error) {
        setMsg("This link has expired. Ask the owner to send a new invite.");
        return;
      }
      window.location.replace(type === "invite" || type === "recovery" ? "/admin/account?welcome=1" : "/admin");
    });
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm items-center justify-center px-4 text-center text-sm text-seedrix-black/70">
      <p>
        {msg}{" "}
        {msg !== "Signing you in…" ? (
          <Link className="font-bold text-seedrix-green underline" href="/admin/login">
            Go to sign in
          </Link>
        ) : null}
      </p>
    </main>
  );
}
