import { createHmac, timingSafeEqual } from "node:crypto";
import type { IngestInput } from "./schema";

/** Verify Meta's X-Hub-Signature-256 header ("sha256=<hex>") over the raw request body. */
export function verifyMetaSignature(rawBody: string | Buffer, header: string | null | undefined, appSecret: string): boolean {
  if (!header || !appSecret) return false;
  const m = header.match(/^sha256=([0-9a-f]{64})$/i);
  if (!m) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  const given = Buffer.from(m[1], "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** leadgen ids from a Meta webhook POST body (object=page, field=leadgen). */
export function leadgenIds(body: unknown): Array<{ leadgenId: string; formId?: string; adId?: string; pageId?: string }> {
  const out: Array<{ leadgenId: string; formId?: string; adId?: string; pageId?: string }> = [];
  const b = body as { object?: string; entry?: Array<{ changes?: Array<{ field?: string; value?: Record<string, unknown> }> }> };
  if (!b || b.object !== "page" || !Array.isArray(b.entry)) return out;
  for (const e of b.entry) {
    for (const c of e.changes ?? []) {
      if (c.field !== "leadgen" || !c.value) continue;
      const v = c.value;
      if (v.leadgen_id) {
        out.push({
          leadgenId: String(v.leadgen_id),
          formId: v.form_id ? String(v.form_id) : undefined,
          adId: v.ad_id ? String(v.ad_id) : undefined,
          pageId: v.page_id ? String(v.page_id) : undefined,
        });
      }
    }
  }
  return out;
}

export type MetaGraphLead = {
  id: string;
  created_time?: string;
  field_data?: Array<{ name: string; values?: string[] }>;
  ad_name?: string;
  adset_name?: string;
  campaign_name?: string;
  form_id?: string;
  platform?: string; // "fb" | "ig"
};

const pick = (fields: Record<string, string>, ...names: string[]) => {
  for (const n of names) {
    const v = fields[n];
    if (v) return v;
  }
  return undefined;
};

/** Graph API lead -> ingest payload. Standard + common custom question names. */
export function mapMetaLead(lead: MetaGraphLead): IngestInput {
  const fields: Record<string, string> = {};
  for (const f of lead.field_data ?? []) {
    const key = f.name.toLowerCase().replace(/[\s-]+/g, "_");
    fields[key] = (f.values ?? []).join(", ");
  }
  const name =
    pick(fields, "full_name", "name") ??
    ([pick(fields, "first_name"), pick(fields, "last_name")].filter(Boolean).join(" ") || "Meta lead");
  const known = new Set(["full_name", "name", "first_name", "last_name", "phone_number", "phone", "email", "city", "emirate", "state"]);
  const extra = Object.entries(fields)
    .filter(([k]) => !known.has(k))
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
    .join("\n");
  const platform = (lead.platform ?? "").toLowerCase();
  return {
    name,
    phone: pick(fields, "phone_number", "phone"),
    email: pick(fields, "email"),
    emirate: pick(fields, "emirate", "city", "state"),
    source: platform === "ig" || platform === "instagram" ? "meta_instagram" : "meta_facebook",
    campaign: lead.campaign_name,
    ad_set: lead.adset_name,
    ad: lead.ad_name,
    form: lead.form_id,
    notes: extra || undefined,
    external_id: lead.id,
    received_at: lead.created_time ? new Date(lead.created_time).toISOString() : undefined,
    raw: lead as unknown as Record<string, unknown>,
  };
}
