import { getTranslations } from "next-intl/server";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { whatsappUrl } from "@/lib/site";

export async function Hero() {
  const t = await getTranslations("hero");
  const tn = await getTranslations("nav");

  return (
    <section className="relative isolate flex min-h-[min(92vh,52rem)] items-end overflow-hidden bg-seedrix-darkest">
      <video
        className="hero-video absolute inset-0 size-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        poster="/brand/hero-poster.jpg"
        aria-hidden="true"
      >
        <source src="/brand/hero.mp4" type="video/mp4" />
      </video>
      <Image
        src="/brand/hero-poster.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="hero-poster object-cover"
        aria-hidden="true"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(5,37,8,0.25)_0%,rgba(5,37,8,0.45)_42%,rgba(5,37,8,0.88)_100%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,#45d9a318_0%,transparent_42%,#052508cc_100%)]"
      />

      <div className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-16 pt-28 sm:px-6 sm:pb-20 lg:pb-24">
        <p className="mb-5 inline-flex items-center rounded-full border border-seedrix-mint/35 bg-seedrix-darkest/40 px-3.5 py-1.5 text-xs font-bold tracking-wide text-seedrix-mint backdrop-blur-sm sm:text-sm">
          {t("trust")}
        </p>
        <h1 className="max-w-3xl text-4xl font-bold text-seedrix-white sm:text-5xl lg:text-6xl">
          {t("headline")}
        </h1>
        <p className="mt-6 max-w-2xl text-base leading-relaxed text-seedrix-white/90 sm:text-lg">
          {t("subheadline")}
        </p>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button asChild size="lg" className="min-h-12 px-7 text-base shadow-[0_8px_24px_rgba(15,148,68,0.35)]">
            <Link href="/register">{t("cta")}</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="border-seedrix-white/35 bg-seedrix-darkest/30 text-seedrix-white backdrop-blur-sm hover:border-seedrix-mint hover:bg-seedrix-white/10 hover:text-seedrix-white"
          >
            <a href={whatsappUrl()} target="_blank" rel="noreferrer">
              {t("whatsappCta")}
            </a>
          </Button>
        </div>
        <p className="sr-only">{t("videoAria")}</p>
        <a href="#register" className="sr-only">
          {tn("register")}
        </a>
      </div>
    </section>
  );
}
