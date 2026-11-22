/** Money helpers. All amounts are AED with 2 decimals. Work in cents internally. */

export const EPS = 0.005;

export function toCents(v: number | string | null | undefined): number {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function fromCents(c: number): number {
  return c / 100;
}

/** Round half away from zero to 2 decimals (matches Postgres round(numeric, 2)). */
export function round2(v: number): number {
  const sign = v < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(v) * 100 + 1e-9)) / 100;
}

export function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function sum(values: Array<number | string | null | undefined>): number {
  return fromCents(values.reduce<number>((a, v) => a + toCents(v as number), 0));
}

export function aed(v: number | string | null | undefined): string {
  return num(v).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function sameAmount(a: number, b: number): boolean {
  return toCents(a) === toCents(b);
}
