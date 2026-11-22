import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { leadgenIds, mapMetaLead, verifyMetaSignature } from "./meta";
import { findDuplicateLead, phoneKey, toE164 } from "./phone";
import { buildLeadRow, ingestSchema } from "./schema";
import { attributionFromUrl, normaliseSource, sourceFromAttribution } from "./source";

describe("source from UTMs", () => {
  it.each([
    [{ utm_source: "facebook" }, "meta_facebook"],
    [{ utm_source: "fb" }, "meta_facebook"],
    [{ utm_source: "IG" }, "meta_instagram"],
    [{ utm_source: "instagram_stories" }, "meta_instagram"],
    [{ utm_source: "tiktok" }, "tiktok"],
    [{ utm_source: "snapchat" }, "snapchat"],
    [{ utm_source: "google", utm_medium: "cpc" }, "google"],
    [{ gclid: "abc" }, "google"],
    [{ fbclid: "x" }, "meta_facebook"],
    [{ fbclid: "x", referrer: "https://l.instagram.com/" }, "meta_instagram"],
    [{ ttclid: "x" }, "tiktok"],
    [{ sccid: "x" }, "snapchat"],
    [{ referrer: "https://www.tiktok.com/" }, "tiktok"],
    [{ referrer: "https://www.google.com/" }, "website"],
    [{}, "website"],
  ] as const)("%j -> %s", (a, expected) => {
    expect(sourceFromAttribution(a)).toBe(expected);
  });

  it("normalises free-text source names from n8n", () => {
    expect(normaliseSource("TikTok Lead Generation")).toBe("tiktok");
    expect(normaliseSource("Snapchat")).toBe("snapchat");
    expect(normaliseSource("google_ads")).toBe("google");
    expect(normaliseSource("walk-in")).toBe("walk_in");
    expect(normaliseSource("ienglish")).toBe("iEnglish");
    expect(normaliseSource("carrier pigeon")).toBeNull();
  });

  it("reads attribution from the landing URL and ignores same-site referrers", () => {
    const a = attributionFromUrl("https://seedrixtraining.com/en?utm_source=ig&utm_campaign=Sep%20promo&fbclid=1", "https://l.instagram.com/");
    expect(a).toMatchObject({ utm_source: "ig", utm_campaign: "Sep promo", fbclid: "1", referrer: "https://l.instagram.com/", landing_page: "https://seedrixtraining.com/en" });
    expect(attributionFromUrl("https://seedrixtraining.com/en", "https://seedrixtraining.com/ar")).toBeNull();
  });
});

describe("phones and de-duplication", () => {
  it("normalises to E.164 with +971 default", () => {
    expect(toE164("050 123 4567")).toBe("+971501234567");
    expect(toE164("501234567")).toBe("+971501234567");
    expect(toE164("00971501234567")).toBe("+971501234567");
    expect(toE164("+20 127 199 3475")).toBe("+201271993475");
    expect(toE164("12345")).toBeNull();
  });

  it("finds the same person regardless of format", () => {
    const leads = [
      { id: "a", phone: "+971501234567", created_at: "2026-09-01T00:00:00Z" },
      { id: "b", phone: "0509999999", created_at: "2026-09-02T00:00:00Z" },
    ];
    expect(findDuplicateLead("050 123 4567", leads)?.id).toBe("a");
    expect(findDuplicateLead("+971 50 999 9999", leads)?.id).toBe("b");
    expect(findDuplicateLead("+971 50 000 0000", leads)).toBeNull();
    expect(findDuplicateLead("", leads)).toBeNull();
    expect(phoneKey("0501234567")).toBe(phoneKey("+971501234567"));
  });

  it("builds a lead row from an n8n payload", () => {
    const v = ingestSchema.parse({ name: "Aisha", phone: "0501234567", source: "TikTok", campaign: "Back to school", utm_source: "tiktok" });
    expect(buildLeadRow(v)).toMatchObject({ name: "Aisha", phone: "+971501234567", source: "tiktok", campaign: "Back to school" });
    const w = ingestSchema.parse({ phone: "501234567", gclid: "x" });
    expect(buildLeadRow(w)).toMatchObject({ source: "google", name: "Lead +971501234567" });
    expect(ingestSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
  });
});

describe("Meta Lead Ads", () => {
  const secret = "test_app_secret";
  const body = JSON.stringify({
    object: "page",
    entry: [{ id: "1", time: 1, changes: [{ field: "leadgen", value: { leadgen_id: "444", form_id: "555", page_id: "1", ad_id: "9" } }] }],
  });
  const sig = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

  it("verifies X-Hub-Signature-256", () => {
    expect(verifyMetaSignature(body, sig, secret)).toBe(true);
    expect(verifyMetaSignature(body + " ", sig, secret)).toBe(false);
    expect(verifyMetaSignature(body, sig, "other")).toBe(false);
    expect(verifyMetaSignature(body, "sha1=abc", secret)).toBe(false);
    expect(verifyMetaSignature(body, null, secret)).toBe(false);
  });

  it("extracts leadgen ids", () => {
    expect(leadgenIds(JSON.parse(body))).toEqual([{ leadgenId: "444", formId: "555", adId: "9", pageId: "1" }]);
    expect(leadgenIds({ object: "user" })).toEqual([]);
  });

  it("maps Graph API field_data", () => {
    const m = mapMetaLead({
      id: "444",
      created_time: "2026-11-20T10:00:00+0000",
      platform: "ig",
      campaign_name: "Nov tutoring",
      adset_name: "Sharjah mums",
      ad_name: "Video 1",
      form_id: "555",
      field_data: [
        { name: "full_name", values: ["Umm Saif"] },
        { name: "phone_number", values: ["+971501234567"] },
        { name: "email", values: ["u@example.com"] },
        { name: "city", values: ["Sharjah"] },
        { name: "child's_grade", values: ["Grade 4"] },
      ],
    });
    expect(m).toMatchObject({
      name: "Umm Saif",
      phone: "+971501234567",
      email: "u@example.com",
      emirate: "Sharjah",
      source: "meta_instagram",
      campaign: "Nov tutoring",
      ad_set: "Sharjah mums",
      ad: "Video 1",
      external_id: "444",
    });
    expect(m.notes).toMatch(/grade: Grade 4/);
    expect(mapMetaLead({ id: "1", platform: "fb", field_data: [{ name: "first_name", values: ["A"] }, { name: "last_name", values: ["B"] }] })).toMatchObject({ name: "A B", source: "meta_facebook" });
  });
});
