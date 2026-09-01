"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";

export function PaymentPanel({
  locale,
  price10,
  price20,
  paidInvoiceId,
}: {
  locale: string;
  price10: number | null;
  price20: number | null;
  paidInvoiceId?: string;
}) {
  const t = useTranslations("paymentPage");
  const ratesReady = price10 != null && price20 != null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-bold text-seedrix-green sm:text-4xl">
        {t("title")}
      </h1>
      <p className="mt-4 max-w-3xl leading-relaxed">{t("intro")}</p>
      {paidInvoiceId ? (
        <div className="mt-6 rounded-[12px] border border-seedrix-green bg-seedrix-mint/20 p-5">
          <h2 className="text-lg font-bold text-seedrix-darkest">
            {t("successTitle")}
          </h2>
          <p className="mt-2 text-sm">{t("successBody")}</p>
          <a
            href={`/api/payments/invoice-pdf?id=${paidInvoiceId}`}
            className="mt-3 inline-block text-sm font-bold text-seedrix-green"
          >
            {t("downloadInvoice")}
          </a>
        </div>
      ) : null}
      <p className="mt-4 rounded-[8px] bg-seedrix-mint/20 px-4 py-3 text-sm font-bold text-seedrix-darkest">
        {t("noCash")}
      </p>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <section className="rounded-[12px] border border-seedrix-darkest/10 p-6">
          <h2 className="text-xl font-bold text-seedrix-dark-green">
            {t("pathATitle")}
          </h2>
          <p className="mt-2 text-sm leading-relaxed">{t("pathABody")}</p>
          {ratesReady ? (
            <CheckoutForm locale={locale} price10={price10!} price20={price20!} />
          ) : (
            <p className="mt-6 text-sm leading-relaxed">{t("ratesPending")}</p>
          )}
        </section>
        <section className="rounded-[12px] border border-seedrix-darkest/10 p-6">
          <h2 className="text-xl font-bold text-seedrix-dark-green">
            {t("pathBTitle")}
          </h2>
          <p className="mt-2 text-sm leading-relaxed">{t("pathBBody")}</p>
          <LookupForm />
        </section>
      </div>
    </div>
  );
}

function CheckoutForm({
  locale,
  price10,
  price20,
}: {
  locale: string;
  price10: number;
  price20: number;
}) {
  const t = useTranslations("paymentPage");
  const tf = useTranslations("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/payments/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        packageCode: form.get("packageCode"),
        method: form.get("method"),
        fullName: form.get("fullName"),
        email: form.get("email"),
        mobile: form.get("mobile"),
        locale,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.redirectUrl) {
      setError(tf("error"));
      setBusy(false);
      return;
    }
    window.location.href = json.redirectUrl;
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      <div>
        <Label>{t("selectPackage")}</Label>
        <select
          name="packageCode"
          required
          className="mt-2 flex h-11 w-full rounded-[8px] border border-seedrix-darkest/15 px-3"
        >
          <option value="online-10">
            {t("hours10")} — AED {price10}
          </option>
          <option value="online-20">
            {t("hours20")} — AED {price20}
          </option>
        </select>
      </div>
      <div>
        <Label>{tf("fullName")}</Label>
        <Input name="fullName" required className="mt-2" />
      </div>
      <div>
        <Label>{tf("email")}</Label>
        <Input name="email" type="email" required className="mt-2" />
      </div>
      <div>
        <Label>{tf("mobile")}</Label>
        <Input name="mobile" required className="mt-2" placeholder="+9715…" />
      </div>
      <fieldset>
        <legend className="text-sm font-bold">{t("payFull")}</legend>
        <div className="mt-2 flex flex-wrap gap-3">
          {(
            [
              ["card", t("card")],
              ["tabby", t("tabby")],
              ["tamara", t("tamara")],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="inline-flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="method"
                value={value}
                defaultChecked={value === "card"}
                className="accent-seedrix-green"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" disabled={busy} className="w-full">
        {t("payCta")}
      </Button>
    </form>
  );
}

function LookupForm() {
  const t = useTranslations("paymentPage");
  const [error, setError] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<{
    id: string;
    invoiceNumber: string;
    service: string;
    totalAed: number;
    status: string;
    recruitName: string | null;
  } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/payments/invoice-lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invoiceNumber: form.get("invoiceNumber"),
        mobile: form.get("mobile"),
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setInvoice(null);
      setError(t("notFound"));
      return;
    }
    setInvoice(json);
  }

  return (
    <div className="mt-6">
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <Label>{t("invoiceNumber")}</Label>
          <Input name="invoiceNumber" required className="mt-2" placeholder="SRX-2026-000001" />
        </div>
        <div>
          <Label>{t("mobileOnFile")}</Label>
          <Input name="mobile" required className="mt-2" />
        </div>
        <Button type="submit" variant="secondary" className="w-full">
          {t("lookupCta")}
        </Button>
      </form>
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      {invoice ? (
        <div className="mt-6 rounded-[12px] bg-seedrix-darkest/[0.04] p-4">
          <p className="font-bold">{invoice.invoiceNumber}</p>
          <p className="mt-1 text-sm">
            {t("invoiceService")}: {invoice.service}
          </p>
          <p className="text-sm">
            {t("invoiceAmount")}: AED {invoice.totalAed}
          </p>
          {invoice.recruitName ? (
            <p className="text-sm">
              {t("invoiceRecruit")}: {invoice.recruitName}
            </p>
          ) : null}
          {invoice.status === "paid" ? (
            <p className="mt-3 font-bold text-seedrix-green">{t("alreadyPaid")}</p>
          ) : (
            <Button asChild className="mt-4 w-full">
              <Link href={`/payment/invoice/${invoice.id}`}>{t("payInvoice")}</Link>
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
