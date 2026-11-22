import { z } from "zod";
import { toE164 } from "./phone";
import { normaliseSource, sourceFromAttribution, type LeadSource } from "./source";

const t = (max: number) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim().slice(0, max))
    .optional();

/** Body of POST /api/leads/ingest (what n8n / Make / Zapier send). */
export const ingestSchema = z.object({
  name: t(200),
  phone: t(40),
  email: z.string().trim().email().max(200).optional().or(z.literal("").transform(() => undefined)),
  source: t(40),
  campaign: t(300),
  ad_set: t(300),
  ad: t(300),
  form: t(300),
  emirate: t(100),
  interest: t(500),
  notes: t(4000),
  utm_source: t(300),
  utm_medium: t(300),
  utm_campaign: t(300),
  utm_content: t(300),
  utm_term: t(300),
  landing_page: t(500),
  referrer: t(500),
  gclid: t(300),
  fbclid: t(300),
  ttclid: t(300),
  external_id: t(200),
  received_at: z.string().datetime({ offset: true }).optional(),
  raw: z.record(z.unknown()).optional(),
});
export type IngestInput = z.input<typeof ingestSchema>;
export type IngestParsed = z.output<typeof ingestSchema>;

/** Normalised lead row (without assignment / ids). Pure so it can be tested. */
export function buildLeadRow(v: IngestParsed) {
  const phone = toE164(v.phone) ?? (v.phone || null);
  const source: LeadSource =
    normaliseSource(v.source) ??
    sourceFromAttribution(
      { utm_source: v.utm_source, utm_medium: v.utm_medium, referrer: v.referrer, gclid: v.gclid, fbclid: v.fbclid, ttclid: v.ttclid },
      "other",
    );
  const name = v.name || (phone ? `Lead ${phone}` : v.email || "New lead");
  return {
    name,
    phone,
    phoneValid: !!toE164(v.phone),
    email: v.email ?? null,
    source,
    emirate: v.emirate || null,
    interest: v.interest || null,
    campaign: v.campaign || v.utm_campaign || null,
    ad_set: v.ad_set || null,
    ad_name: v.ad || null,
    form_name: v.form || null,
    utm_source: v.utm_source || null,
    utm_medium: v.utm_medium || null,
    utm_campaign: v.utm_campaign || null,
    utm_content: v.utm_content || null,
    utm_term: v.utm_term || null,
    landing_page: v.landing_page || null,
    referrer: v.referrer || null,
    external_id: v.external_id || null,
    received_at: v.received_at ?? new Date().toISOString(),
    raw_payload: v.raw ?? null,
    notes: v.notes || null,
  };
}
