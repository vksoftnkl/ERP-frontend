/**
 * The finite vocabularies of the gst_* tables, spelled exactly as the server's
 * `gst-config.constants.ts` (and the tables' CHECK constraints) spell them.
 * A value outside these is a 400 naming the field.
 */

export const GST_SERVICES = ["EINVOICE", "EWAYBILL", "GSTIN_VERIFY", "GSTR", "ASP_ADMIN"] as const;
export const GST_ENVIRONMENTS = ["SANDBOX", "PRODUCTION"] as const;
export const GST_AUTH_SCHEMES = ["NIC_SEK", "OAUTH2", "API_KEY", "BASIC", "BEARER_STATIC", "CUSTOM"] as const;
export const GST_PAYLOAD_ENCRYPTIONS = ["NONE", "AES_SEK", "RSA"] as const;
export const GST_HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export const GST_FIELD_DIRECTIONS = ["REQUEST", "RESPONSE"] as const;
export const GST_FIELD_DATA_TYPES = ["TEXT", "INT", "DECIMAL", "BOOL", "DATE", "DATETIME", "JSON"] as const;
export const GST_FIELD_TRANSFORMS = [
  "NONE",
  "TRIM",
  "UPPER",
  "LOWER",
  "DATE_DDMMYYYY",
  "DATETIME_NIC",
  "EPOCH_MS",
  "DATETIME_MASK",
  "BASE64_DECODE",
  "JWT_PAYLOAD",
  "JSON_PARSE",
] as const;
export const GST_TREAT_AS = ["ERROR", "SUCCESS", "WARNING"] as const;
export const GST_RECOVERY_ACTIONS = ["NONE", "REAUTH", "BACKOFF", "FETCH_BY_DOC", "FAILOVER", "MANUAL"] as const;
export const GST_SEVERITIES = ["INFO", "WARN", "ERROR"] as const;
export const GST_OUR_ERROR_CODES = [
  "DUPLICATE_IRN",
  "IRN_NOT_FOUND",
  "CANCEL_WINDOW_EXPIRED",
  "AUTH_FAILED",
  "TOKEN_EXPIRED",
  "IP_NOT_WHITELISTED",
  "INVALID_GSTIN",
  "GSTIN_INACTIVE",
  "VALIDATION",
  "DUPLICATE_EWB",
  "EWB_NOT_FOUND",
  "RATE_LIMITED",
  "UPSTREAM_DOWN",
  "TIMEOUT",
  "CREDIT_EXHAUSTED",
  "ENV_MISMATCH",
  "UNKNOWN",
] as const;
export const GST_ACTIONS = [
  "AUTH",
  "GENERATE_IRN",
  "CANCEL_IRN",
  "GET_IRN",
  "GET_IRN_BY_DOC",
  "GENERATE_EWB",
  "GENERATE_EWB_BY_IRN",
  "UPDATE_PART_B",
  "UPDATE_TRANSPORTER",
  "EXTEND_VALIDITY",
  "CANCEL_EWB",
  "REJECT_EWB",
  "CLOSE_EWB",
  "GET_EWB",
  "PRINT_EWB",
  "GET_EWB_BY_DATE",
  "GET_EWB_FOR_TRANSPORTER",
  "GET_EWB_OTHER_PARTY",
  "GET_EWB_REJECTED",
  "GENERATE_CONSOLIDATED_EWB",
  "REGENERATE_CONSOLIDATED_EWB",
  "GET_CONSOLIDATED_EWB",
  "PRINT_CONSOLIDATED_EWB",
  "INIT_MULTI_VEHICLE",
  "ADD_MULTI_VEHICLE",
  "CHANGE_MULTI_VEHICLE",
  "VERIFY_GSTIN",
  "SYNC_GSTIN",
  "GET_TRANSIN",
  "GET_HSN",
  "GSTR1_SAVE",
  "GSTR1_SUBMIT",
  "GSTR_STATUS",
  "GET_API_BALANCE",
  "GET_ERROR_LIST",
  "HEALTH",
] as const;

/** The `code` on a refusal the screens branch on (server `GST_CODES`). */
export const GST_SWITCHED_OFF = "GST_SWITCHED_OFF";

/**
 * NIC blocks a GSTIN after 5 sign-ins in 15 minutes; the server refuses the
 * 5th itself (GST_AUTH_RATE_LIMIT), and Verify greys for this long after a
 * press so a double click is not two of the four.
 */
export const VERIFY_COOLDOWN_MS = 60_000;

/**
 * The configured grids answer from a one-second cache keyed by URL, so a list
 * re-read straight after a write gets the rows from before it. Wait it out.
 */
export const GRID_CACHE_SETTLE_MS = 1100;

export type CodedOption = { value: string; label: string };

/** A vocabulary as select options; `allLabel` puts the "" (= NULL, every …) item first. */
export function coded(values: readonly string[], allLabel?: string): CodedOption[] {
  const options = values.map((value) => ({ value, label: value }));
  return allLabel ? [{ value: "", label: allLabel }, ...options] : options;
}
