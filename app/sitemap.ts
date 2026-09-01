import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://seedrixtraining.com";

const paths = [
  "",
  "/services",
  "/services/languages",
  "/services/school-support",
  "/services/special-needs",
  "/services/shadow-teacher",
  "/services/test-prep",
  "/services/online-home-tutoring",
  "/pricing",
  "/about",
  "/register",
  "/payment",
  "/contact",
  "/terms",
  "/privacy",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const locales = ["en", "ar"] as const;
  return paths.flatMap((path) =>
    locales.map((locale) => ({
      url: `${siteUrl}/${locale}${path}`,
      alternates: {
        languages: {
          en: `${siteUrl}/en${path}`,
          ar: `${siteUrl}/ar${path}`,
        },
      },
    })),
  );
}
