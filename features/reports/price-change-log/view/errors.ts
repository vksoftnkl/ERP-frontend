/**
 * The Price Change Log's refusals in words. Every route needs View on menu
 * 290: without it the server answers 403 `IPCL_RIGHT_VIEW`, which the screen
 * shows as a plain "no access" state rather than an error popup.
 */
import { apiRefusalOf } from "@/lib/api/error-text";
import { IPCL_CODE } from "../wire/types";

export const NO_ACCESS_MESSAGE = "You do not have access to the Price Change Log.";

/** A 403, or the server's `IPCL_RIGHT_VIEW` however it arrived. */
export function isNoAccessError(error: unknown): boolean {
  const refusal = apiRefusalOf(error);
  if (refusal.status === 403 || refusal.code === IPCL_CODE.RIGHT_VIEW) {
    return true;
  }
  try {
    return JSON.stringify(error ?? null).includes(IPCL_CODE.RIGHT_VIEW);
  } catch {
    return false;
  }
}
