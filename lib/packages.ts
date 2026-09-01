export type PackageCode = "online-10" | "online-20";

export const PACKAGES: Record<
  PackageCode,
  { hours: number; service: string; descriptionEn: string; descriptionAr: string }
> = {
  "online-10": {
    hours: 10,
    service: "online-tutoring",
    descriptionEn: "Online Tutoring — 10-hour pack",
    descriptionAr: "دروس عبر الإنترنت — باقة 10 ساعات",
  },
  "online-20": {
    hours: 20,
    service: "online-tutoring",
    descriptionEn: "Online Tutoring — 20-hour pack",
    descriptionAr: "دروس عبر الإنترنت — باقة 20 ساعات",
  },
};

export function packagePriceAed(code: PackageCode): number | null {
  const raw =
    code === "online-10"
      ? process.env.ONLINE_10H_AED
      : process.env.ONLINE_20H_AED;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export const VAT_RATE = 0.05;

export function splitVat(grossOrNet: number, pricesIncludeVat = false) {
  if (pricesIncludeVat) {
    const net = Math.round((grossOrNet / (1 + VAT_RATE)) * 100) / 100;
    const vat = Math.round((grossOrNet - net) * 100) / 100;
    return { amountAed: net, vatAed: vat, totalAed: grossOrNet };
  }
  const vat = Math.round(grossOrNet * VAT_RATE * 100) / 100;
  return {
    amountAed: grossOrNet,
    vatAed: vat,
    totalAed: Math.round((grossOrNet + vat) * 100) / 100,
  };
}
