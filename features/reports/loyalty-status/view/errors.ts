/**
 * Loyalty Status refusals. Every report route needs View on menu 79: without
 * it the server answers 403 `LST_RIGHT_VIEW`, which the screen shows as a
 * plain "no access" state rather than an error popup. Anything else goes to
 * the message popup in plain words (`toast.apiError`).
 */
import { apiRefusalOf } from "@/lib/api/error-text";
import { LST_CODE } from "../wire/types";

export const NO_ACCESS_MESSAGE = "You do not have access to Loyalty Status.";

/** The view right is missing — not a print / export / edit refusal (those stay messages). */
export function isNoAccessError(error: unknown): boolean {
  const refusal = apiRefusalOf(error);
  if (refusal.code === LST_CODE.RIGHT_VIEW) return true;
  if (refusal.status === 403 && !refusal.code) return true;
  try {
    return JSON.stringify(error ?? null).includes(LST_CODE.RIGHT_VIEW);
  } catch {
    return false;
  }
}
