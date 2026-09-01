import localFont from "next/font/local";
import { Noto_Sans_Arabic } from "next/font/google";

export const sansation = localFont({
  src: [
    {
      path: "../public/fonts/Sansation-Regular.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/Sansation-Bold.ttf",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-sansation",
  display: "swap",
  fallback: ["Jost", "Questrial", "sans-serif"],
});

export const notoSansArabic = Noto_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "700"],
  variable: "--font-arabic",
  display: "swap",
  adjustFontFallback: false,
});
