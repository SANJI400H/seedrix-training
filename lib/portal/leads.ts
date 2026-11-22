import type { Lead } from "./types";

/** A lead nobody has opened yet. */
export function isNewLead(l: Pick<Lead, "stage" | "viewed_at">) {
  return l.stage === "new" && !l.viewed_at;
}
