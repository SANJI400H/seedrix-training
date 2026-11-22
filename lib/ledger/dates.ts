/** Asia/Dubai calendar helpers (UTC+4, no DST). */

export const TZ = "Asia/Dubai";

export function todayDubai(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function monthStartDubai(now: Date = new Date()): string {
  return todayDubai(now).slice(0, 8) + "01";
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "";
  const x = new Date(d.length === 10 ? d + "T00:00:00Z" : d);
  if (Number.isNaN(x.getTime())) return d;
  return x.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: d.length === 10 ? "UTC" : TZ,
  });
}

export function fmtDateTime(d: string | null | undefined): string {
  if (!d) return "";
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return d;
  return x.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  });
}

export function addDays(iso: string, days: number): string {
  const t = Date.parse(iso + "T00:00:00Z") + days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}
