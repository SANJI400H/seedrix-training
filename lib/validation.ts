import { z } from "zod";
import { parsePhoneNumberFromString } from "libphonenumber-js";

export const SERVICE_VALUES = [
  "languages",
  "school-support",
  "special-needs",
  "shadow-teacher",
  "test-prep",
  "online-tutoring",
  "not-sure",
] as const;

export const EMIRATE_VALUES = [
  "dubai",
  "abu-dhabi",
  "sharjah",
  "ajman",
  "umm-al-quwain",
  "ras-al-khaimah",
  "fujairah",
] as const;

export const DELIVERY_VALUES = ["home", "online", "either"] as const;

export const inquirySchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  countryCode: z.string().regex(/^\+\d{1,4}$/),
  nationalNumber: z.string().trim().min(7).max(15),
  email: z.string().trim().email().max(160),
  service: z.enum(SERVICE_VALUES),
  emirate: z.enum(EMIRATE_VALUES),
  deliveryMode: z.enum(DELIVERY_VALUES),
  locale: z.enum(["en", "ar"]),
});

export type InquiryInput = z.infer<typeof inquirySchema>;

export function composeMobile(countryCode: string, nationalNumber: string) {
  const digits = nationalNumber.replace(/\D/g, "");
  return `${countryCode}${digits}`;
}

export function isValidUaeMobile(countryCode: string, nationalNumber: string) {
  const composed = composeMobile(countryCode, nationalNumber);
  const parsed = parsePhoneNumberFromString(composed);
  if (!parsed || !parsed.isValid()) return false;
  if (countryCode === "+971") {
    return parsed.country === "AE";
  }
  return parsed.isValid();
}

export const inquiryFormSchema = inquirySchema.superRefine((data, ctx) => {
  if (!isValidUaeMobile(data.countryCode, data.nationalNumber)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["nationalNumber"],
      message: "invalidMobile",
    });
  }
});

export const invoiceLookupSchema = z.object({
  invoiceNumber: z.string().trim().min(4).max(32),
  mobile: z.string().trim().min(8).max(20),
});

export const checkoutSchema = z.object({
  packageCode: z.enum(["online-10", "online-20"]),
  method: z.enum(["card", "tabby", "tamara"]),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  mobile: z.string().trim().min(8).max(20),
  locale: z.enum(["en", "ar"]),
});
