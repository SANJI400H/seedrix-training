import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://seedrixtraining.com",
  ),
  title: "Seedrix Training",
  description:
    "UAE tutoring. Vetted trainers matched to your child across every Emirate.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
