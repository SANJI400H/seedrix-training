import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

/** E.164 (+971 default) or null when it can't be a real number. */
export function toE164(raw: string | null | undefined, defaultCountry: CountryCode = "AE"): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const cleaned = s.replace(/[^\d+]/g, "").replace(/^00/, "+");
  const p = parsePhoneNumberFromString(cleaned, defaultCountry);
  if (p && p.isValid()) return p.number;
  // bare 9-digit UAE mobile without the leading 0 (e.g. 501234567)
  if (/^5\d{8}$/.test(cleaned)) return `+971${cleaned}`;
  return null;
}

/** Digits used to compare phones that may be stored in different formats. */
export function phoneKey(raw: string | null | undefined): string | null {
  const e = toE164(raw);
  if (e) return e;
  const d = (raw ?? "").replace(/\D/g, "");
  return d.length >= 7 ? d : null;
}

/** The existing lead (if any) for a phone number — the most recently active one. */
export function findDuplicateLead<T extends { phone: string | null; last_inbound_at?: string | null; created_at?: string }>(
  phone: string | null | undefined,
  leads: T[],
): T | null {
  const key = phoneKey(phone);
  if (!key) return null;
  const hits = leads.filter((l) => phoneKey(l.phone) === key);
  hits.sort((a, b) => (b.last_inbound_at ?? b.created_at ?? "").localeCompare(a.last_inbound_at ?? a.created_at ?? ""));
  return hits[0] ?? null;
}
