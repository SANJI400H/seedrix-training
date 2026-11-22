import type { Metadata, Viewport } from "next";
import { notoSansArabic, sansation } from "@/lib/fonts";

// Staff data is per user: never prerender or cache admin pages.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Staff portal", template: "%s · Seedrix staff" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#052508",
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" className={`${sansation.variable} ${notoSansArabic.variable}`}>
      <body className="min-h-screen bg-[#f4f6f5] text-seedrix-black antialiased">{children}</body>
    </html>
  );
}
