"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function InvoicePay({
  invoiceId,
  locale,
}: {
  invoiceId: string;
  locale: string;
}) {
  const t = useTranslations("paymentPage");
  const [method, setMethod] = useState<"card" | "tabby" | "tamara">("card");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/payments/invoice-pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceId, method, locale }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.redirectUrl) {
      setError("Payment could not start.");
      setBusy(false);
      return;
    }
    window.location.href = json.redirectUrl;
  }

  return (
    <div className="mt-8 space-y-4">
      <div className="flex flex-wrap gap-3">
        {(
          [
            ["card", t("card")],
            ["tabby", t("tabby")],
            ["tamara", t("tamara")],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="inline-flex items-center gap-2 text-sm font-bold">
            <input
              type="radio"
              name="method"
              checked={method === value}
              onChange={() => setMethod(value)}
              className="accent-seedrix-green"
            />
            {label}
          </label>
        ))}
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="button" onClick={pay} disabled={busy} className="w-full">
        {t("payCta")}
      </Button>
    </div>
  );
}
