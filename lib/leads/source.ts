/** Lead sources and attribution rules. Keep in sync with public.lead_source_from() in 003. */

export const LEAD_SOURCES = [
  "website",
  "meta_facebook",
  "meta_instagram",
  "snapchat",
  "tiktok",
  "google",
  "whatsapp",
  "referral",
  "walk_in",
  "iEnglish",
  "social",
  "other",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const SOURCE_LABEL: Record<LeadSource, string> = {
  website: "Website",
  meta_facebook: "Facebook (Meta)",
  meta_instagram: "Instagram (Meta)",
  snapchat: "Snapchat",
  tiktok: "TikTok",
  google: "Google",
  whatsapp: "WhatsApp",
  referral: "Referral",
  walk_in: "Walk-in",
  iEnglish: "iEnglish",
  social: "Social (unspecified)",
  other: "Other",
};

/** Sources that can be auto-assigned round-robin when they arrive. */
export const INBOUND_SOURCES: LeadSource[] = ["website", "meta_facebook", "meta_instagram", "snapchat", "tiktok", "google", "whatsapp"];

export type Attribution = {
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  referrer?: string | null;
  landing_page?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  ttclid?: string | null;
  sccid?: string | null;
};

export const ATTRIBUTION_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "gclid",
  "fbclid",
  "ttclid",
  "sccid",
] as const;

/** Free-text source names from forms / n8n -> our source values. */
export function normaliseSource(v: string | null | undefined): LeadSource | null {
  const s = (v ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!s) return null;
  if ((LEAD_SOURCES as readonly string[]).includes(s)) return s as LeadSource;
  if (s === "ienglish") return "iEnglish";
  if (["facebook", "fb", "meta", "facebook_ads", "meta_ads"].includes(s)) return "meta_facebook";
  if (["instagram", "ig", "insta"].includes(s)) return "meta_instagram";
  if (s.startsWith("tiktok")) return "tiktok";
  if (s.startsWith("snap")) return "snapchat";
  if (s.startsWith("google") || s === "adwords" || s === "gads") return "google";
  if (s === "wa") return "whatsapp";
  if (s === "walkin") return "walk_in";
  return null;
}

/** Decide the lead source from UTMs, click ids and the referrer. */
export function sourceFromAttribution(a: Attribution, fallback: LeadSource = "website"): LeadSource {
  const s = (a.utm_source ?? "").trim().toLowerCase();
  const r = (a.referrer ?? "").toLowerCase();
  if (["facebook", "fb", "meta", "facebook_ads", "fb_ads"].includes(s) || s.startsWith("facebook")) return "meta_facebook";
  if (["instagram", "ig", "insta"].includes(s) || s.startsWith("instagram")) return "meta_instagram";
  if (s.startsWith("tiktok") || s === "tt") return "tiktok";
  if (s.startsWith("snap") || s === "sc") return "snapchat";
  if (["google", "adwords", "gads", "google_ads", "googleads"].includes(s) || s.startsWith("google")) return "google";
  if (s === "whatsapp" || s === "wa") return "whatsapp";
  if (a.gclid) return "google";
  if (a.ttclid) return "tiktok";
  if (a.sccid) return "snapchat";
  if (a.fbclid) return r.includes("instagram") ? "meta_instagram" : "meta_facebook";
  if (r.includes("instagram.")) return "meta_instagram";
  if (r.includes("facebook.") || r.includes("fb.")) return "meta_facebook";
  if (r.includes("tiktok.")) return "tiktok";
  if (r.includes("snapchat.")) return "snapchat";
  return fallback;
}

/** Read attribution from a landing URL's query string (used by the website cookie). */
export function attributionFromUrl(url: string, referrer?: string | null): Attribution | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const out: Attribution = {};
  let any = false;
  for (const k of ATTRIBUTION_KEYS) {
    const v = u.searchParams.get(k) ?? (k === "sccid" ? u.searchParams.get("ScCid") : null);
    if (v) {
      out[k] = v.slice(0, 300);
      any = true;
    }
  }
  const ref = referrer && !referrer.startsWith(u.origin) ? referrer.slice(0, 500) : null;
  if (ref) {
    out.referrer = ref;
    any = true;
  }
  if (!any) return null;
  out.landing_page = (u.origin + u.pathname).slice(0, 500);
  return out;
}
