export const site = {
  name: "Seedrix Training",
  legalName: "Seedrix LLC",
  tradingName: "Seedrix for Training / Seedrix Language Learning Center",
  licenseNo: "2648158.01",
  licenseAuthority: "Shams Free Zone, Sharjah, UAE",
  phoneDisplay: process.env.NEXT_PUBLIC_PHONE ?? "+971 54 414 1077",
  phoneTel: process.env.NEXT_PUBLIC_PHONE_TEL ?? "+971544141077",
  whatsapp: process.env.NEXT_PUBLIC_WHATSAPP ?? "971544141077",
  email: process.env.NEXT_PUBLIC_EMAIL ?? "hello@seedrixtraining.com",
  instagram: process.env.NEXT_PUBLIC_INSTAGRAM ?? "",
  linkedin: process.env.NEXT_PUBLIC_LINKEDIN ?? "",
} as const;

export function whatsappUrl(text?: string) {
  const base = `https://wa.me/${site.whatsapp}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}
