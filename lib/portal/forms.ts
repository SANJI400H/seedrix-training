import { z } from "zod";
import type { ActionState } from "./action-state";

/** FormData -> plain object of trimmed strings (empty -> undefined). */
export function formObject(fd: FormData): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v !== "string") continue;
    const t = v.trim();
    out[k] = t === "" ? undefined : t;
  }
  return out;
}

export const optText = z
  .string()
  .max(5000)
  .optional()
  .transform((v) => (v && v.length ? v : null));

export const reqText = (label: string) => z.string({ required_error: `${label} is required` }).min(1, `${label} is required`).max(500);

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");
export const optDate = isoDate.optional().transform((v) => v ?? null);
export const optUuid = z.string().uuid().optional().transform((v) => v ?? null);

export const money = (label: string) =>
  z.coerce
    .number({ invalid_type_error: `${label} must be a number` })
    .finite()
    .min(0, `${label} cannot be negative`)
    .max(10_000_000)
    .transform((v) => Math.round(v * 100) / 100);

export const optMoney = z
  .union([z.literal(""), z.undefined(), z.coerce.number().finite().min(0)])
  .transform((v) => (v === "" || v === undefined ? null : Math.round(v * 100) / 100));

export function zodErrors(err: z.ZodError): ActionState {
  const fieldErrors: Record<string, string> = {};
  for (const i of err.issues) {
    const k = String(i.path[0] ?? "form");
    if (!fieldErrors[k]) fieldErrors[k] = i.message;
  }
  const first = err.issues[0];
  return { error: first ? `${first.message}` : "Check the form", fieldErrors };
}

/** Turn a Postgres/PostgREST error into something a person can act on. */
export function dbError(e: { message?: string; code?: string } | null | undefined, fallback = "Couldn't save. Try again."): ActionState {
  if (!e) return { error: fallback };
  if (e.code === "42501" || /row-level security/i.test(e.message ?? "")) {
    return { error: "You don't have permission to do that." };
  }
  if (e.code === "23505") return { error: "That already exists." };
  if (e.code === "P0001" && e.message) return { error: e.message };
  if (e.code === "23514") return { error: "Some values are not allowed (check amounts and required reasons)." };
  return { error: e.message ? `${fallback} (${e.message})` : fallback };
}

export const confirmed = (fd: FormData) => fd.get("confirm") === "1";
