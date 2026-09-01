"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";
import {
  DELIVERY_VALUES,
  EMIRATE_VALUES,
  SERVICE_VALUES,
  inquiryFormSchema,
  type InquiryInput,
} from "@/lib/validation";

const COUNTRY_CODES = [
  { code: "+971", label: "+971" },
  { code: "+966", label: "+966" },
  { code: "+974", label: "+974" },
  { code: "+973", label: "+973" },
  { code: "+968", label: "+968" },
  { code: "+965", label: "+965" },
];

type Props = {
  defaultService?: string;
  condensed?: boolean;
  id?: string;
};

export function InquiryForm({
  defaultService,
  condensed = false,
  id = "register",
}: Props) {
  const t = useTranslations("form");
  const locale = useLocale();
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const schema = useMemo(() => inquiryFormSchema, []);

  const form = useForm<InquiryInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: "",
      countryCode: "+971",
      nationalNumber: "",
      email: "",
      service: SERVICE_VALUES.includes(defaultService as InquiryInput["service"])
        ? (defaultService as InquiryInput["service"])
        : undefined,
      emirate: undefined,
      deliveryMode: undefined,
      locale: locale === "ar" ? "ar" : "en",
    },
  });

  async function onSubmit(values: InquiryInput) {
    setServerError(null);
    const res = await fetch("/api/inquiries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, locale }),
    });
    if (!res.ok) {
      setServerError(t("error"));
      return;
    }
    router.push("/thank-you");
  }

  const fieldError = (name: keyof InquiryInput) => {
    const err = form.formState.errors[name];
    if (!err) return null;
    if (err.message === "invalidMobile") return t("invalidMobile");
    if (name === "email") return t("invalidEmail");
    return t("required");
  };

  return (
    <section id={id} className="scroll-mt-28 bg-seedrix-darkest py-20 sm:py-28">
      <div className="mx-auto max-w-xl px-4 sm:px-6">
        <h2 className="text-3xl font-bold text-seedrix-white sm:text-4xl">
          {t("title")}
        </h2>
        {!condensed ? (
          <p className="mt-4 font-bold text-seedrix-mint">{t("subtitle")}</p>
        ) : null}

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="mt-8 space-y-5 rounded-[12px] border border-seedrix-white/10 bg-seedrix-white/[0.06] p-5 backdrop-blur-sm sm:p-7"
          noValidate
        >
          <Field label={t("fullName")} error={fieldError("fullName")}>
            <Input
              autoComplete="name"
              {...form.register("fullName")}
              aria-invalid={!!form.formState.errors.fullName}
            />
          </Field>

          <div>
            <Label htmlFor="nationalNumber" className="text-seedrix-white">
              {t("mobile")}
            </Label>
            <div className="mt-2 flex gap-2">
              <select
                aria-label={t("countryCode")}
                className="h-12 rounded-[8px] border border-seedrix-white/20 bg-seedrix-white px-2 text-sm"
                {...form.register("countryCode")}
              >
                {COUNTRY_CODES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
              <Input
                id="nationalNumber"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="50 123 4567"
                className="flex-1"
                {...form.register("nationalNumber")}
                aria-invalid={!!form.formState.errors.nationalNumber}
              />
            </div>
            {fieldError("nationalNumber") ? (
              <p className="mt-1 text-sm text-danger" role="alert">
                {fieldError("nationalNumber")}
              </p>
            ) : null}
          </div>

          <Field label={t("email")} error={fieldError("email")}>
            <Input
              type="email"
              autoComplete="email"
              {...form.register("email")}
              aria-invalid={!!form.formState.errors.email}
            />
          </Field>

          <Field label={t("service")} error={fieldError("service")}>
            <select
              className="flex h-12 w-full rounded-[8px] border border-seedrix-darkest/15 bg-seedrix-white px-3 text-base"
              {...form.register("service")}
            >
              <option value="">{t("selectPlaceholder")}</option>
              {SERVICE_VALUES.map((value) => (
                <option key={value} value={value}>
                  {t(`services.${value}`)}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t("emirate")} error={fieldError("emirate")}>
            <select
              className="flex h-12 w-full rounded-[8px] border border-seedrix-darkest/15 bg-seedrix-white px-3 text-base"
              {...form.register("emirate")}
            >
              <option value="">{t("selectPlaceholder")}</option>
              {EMIRATE_VALUES.map((value) => (
                <option key={value} value={value}>
                  {t(`emirates.${value}`)}
                </option>
              ))}
            </select>
          </Field>

          <fieldset>
            <legend className="text-sm font-bold text-seedrix-white">
              {t("delivery")}
            </legend>
            <div className="mt-3 flex flex-wrap gap-3">
              {DELIVERY_VALUES.map((value) => (
                <label
                  key={value}
                  className="inline-flex items-center gap-2 rounded-[8px] bg-seedrix-white px-3 py-2 text-sm font-bold text-seedrix-darkest"
                >
                  <input
                    type="radio"
                    value={value}
                    className="accent-seedrix-green"
                    {...form.register("deliveryMode")}
                  />
                  {t(value)}
                </label>
              ))}
            </div>
            {fieldError("deliveryMode") ? (
              <p className="mt-1 text-sm text-danger" role="alert">
                {fieldError("deliveryMode")}
              </p>
            ) : null}
          </fieldset>

          {serverError ? (
            <p className="text-sm text-danger" role="alert">
              {serverError}
            </p>
          ) : null}

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? t("submitting") : t("submit")}
          </Button>

          <p className="text-xs leading-relaxed text-seedrix-white/70">
            {t("privacyNote")}{" "}
            <Link href="/privacy" className="underline hover:text-seedrix-mint">
              {t("privacyLink")}
            </Link>
          </p>
        </form>
      </div>
    </section>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="text-seedrix-white">{label}</Label>
      <div className="mt-2">{children}</div>
      {error ? (
        <p className="mt-1 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
