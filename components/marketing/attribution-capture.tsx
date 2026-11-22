"use client";

import { useEffect } from "react";
import { attributionFromUrl } from "@/lib/leads/source";

const COOKIE = "srx_attr";

/**
 * Remembers where a visitor came from (UTM tags, ad click ids, referrer) in a
 * first-party cookie so it survives navigation until they send the enquiry form.
 * A new campaign visit (with UTMs / click ids) replaces an older one.
 */
export function AttributionCapture() {
  useEffect(() => {
    try {
      const a = attributionFromUrl(window.location.href, document.referrer);
      if (!a) return;
      const hasCampaign = !!(a.utm_source || a.gclid || a.fbclid || a.ttclid || a.sccid);
      const existing = document.cookie.split("; ").some((c) => c.startsWith(`${COOKIE}=`));
      if (existing && !hasCampaign) return;
      const value = encodeURIComponent(JSON.stringify(a)).slice(0, 3500);
      document.cookie = `${COOKIE}=${value}; Max-Age=${60 * 60 * 24 * 30}; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    } catch {
      /* attribution is best-effort */
    }
  }, []);
  return null;
}
