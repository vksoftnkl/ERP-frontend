import type { AppSettingDataType, EffectiveSetting } from "../types";

/**
 * Values travel as TEXT in both directions, and that asymmetry with the typed
 * controls above them is the contract, not an oversight: `app_setting_value.asv_value`
 * is a `text` column, the catalog stores its own defaults as text beside it
 * (`'true'`, `'15000'`, `'PRINT'`), and the allowed-values trigger tests
 * `asd_allowed_values @> to_jsonb(NEW.asv_value)` — a jsonb array of STRINGS —
 * so any setting with an allowed list is refused outright unless a string arrives.
 *
 * So the draft a row holds is the text itself. A control reads it through the
 * parsers here and writes back through `toText`, which is the one place a value
 * is put into the shape the column and the trigger both expect.
 */

// Postgres' boolean input vocabulary, lower-cased — the same set the server
// accepts, so a value the DB would take is not refused by the control above it.
const BOOL_TRUE = new Set(["true", "t", "yes", "y", "on", "1"]);
const BOOL_FALSE = new Set(["false", "f", "no", "n", "off", "0"]);

const INT_PATTERN = /^[+-]?\d+$/;
const DECIMAL_PATTERN = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `1.500000` -> `1.5`, `2.000000` -> `2`. Never leaves a bare `-` or an empty string behind. */
function trimZeros(fixed: string): string {
  if (!fixed.includes(".")) {
    return fixed;
  }
  const trimmed = fixed.replace(/0+$/, "").replace(/\.$/, "");
  return trimmed === "" || trimmed === "-" ? "0" : trimmed;
}

/**
 * A DECIMAL as plain digits, whatever its magnitude.
 *
 * `1e-05` in a text column is a value every later reader has to guess at, so
 * exponent form never leaves here. `toFixed(6)` matches the `numeric(18,6)` the
 * bounds are stored in; above 1e21 it gives up and returns exponent form, and a
 * double that large is integral anyway, so BigInt finishes the job.
 */
function toPlainDecimal(value: number): string {
  if (!Number.isFinite(value)) {
    return "";
  }
  const normalized = Object.is(value, -0) ? 0 : value;
  const fixed = normalized.toFixed(6);
  if (!/[eE]/.test(fixed)) {
    return trimZeros(fixed);
  }
  return BigInt(normalized).toString();
}

/**
 * A control's value in the shape the column and the trigger expect.
 *
 * `null`/`undefined` become `''`, which the server reads as "explicitly
 * nothing" — so a blank is never saved by accident; `useAppSettings` refuses to
 * send an empty draft and asks the operator to reset the setting instead.
 */
export function toText(value: unknown, dataType: AppSettingDataType): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (dataType === "BOOL") {
    // Lower case, as the catalog seeds its own defaults.
    if (typeof value === "string") {
      return parseBool(value) ? "true" : "false";
    }
    return value ? "true" : "false";
  }
  if (dataType === "INT") {
    const numeric = Number(String(value).trim());
    // A number that will not cast is handed back as typed, so the server's
    // error names what the operator actually wrote instead of "NaN".
    return Number.isFinite(numeric) ? String(Math.round(numeric)) : String(value).trim();
  }
  if (dataType === "DECIMAL") {
    const numeric = Number(String(value).trim());
    return Number.isFinite(numeric) ? toPlainDecimal(numeric) : String(value).trim();
  }
  return String(value).trim();
}

/** A stored BOOL as a switch position. Anything unrecognised reads false, as `::boolean` would refuse. */
export function parseBool(text: string | null | undefined): boolean {
  return text !== null && text !== undefined && BOOL_TRUE.has(text.trim().toLowerCase());
}

/** Whether a stored BOOL is one of the literals Postgres would take at all. */
export function isBoolLiteral(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return BOOL_TRUE.has(normalized) || BOOL_FALSE.has(normalized);
}

/**
 * Does this text survive the cast `fn_app_settings` performs on every read?
 *
 * The resolver casts blindly for EVERY caller, so one uncastable value breaks
 * the settings object for everybody, not only for the row holding it. The
 * server refuses them at write time; this is the same check, one step earlier,
 * so the operator is told at the box rather than at the Save.
 */
export function isCastable(text: string, dataType: AppSettingDataType): boolean {
  const trimmed = text.trim();
  switch (dataType) {
    case "BOOL":
      return isBoolLiteral(trimmed);
    case "INT":
      return INT_PATTERN.test(trimmed);
    case "DECIMAL":
      return DECIMAL_PATTERN.test(trimmed) && Number.isFinite(Number(trimmed));
    case "UUID":
      return UUID_PATTERN.test(trimmed);
    case "DATE":
      return DATE_PATTERN.test(trimmed) && !Number.isNaN(Date.parse(trimmed));
    case "JSON":
      try {
        JSON.parse(text);
        return true;
      } catch {
        return false;
      }
    case "TEXT":
    default:
      return true;
  }
}

/**
 * Client-side validation MIRRORS the server; it does not replace it. The same
 * three checks the catalog imposes — castability, membership, range — reported
 * at the control so a page of boxes is not saved to learn which one was wrong.
 * The server re-checks all of it and is the authority.
 */
export function validateText(text: string, setting: EffectiveSetting): string | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return "Enter a value, or reset the setting to inherit it.";
  }
  if (!isCastable(trimmed, setting.asdDataType)) {
    return `Not a valid ${setting.asdDataType} value.`;
  }
  if (setting.asdAllowedValues && !setting.asdAllowedValues.includes(trimmed)) {
    return `Must be one of: ${setting.asdAllowedValues.join(", ")}.`;
  }
  if (setting.asdDataType === "INT" || setting.asdDataType === "DECIMAL") {
    const numeric = Number(trimmed);
    if (setting.asdMinValue !== null && numeric < setting.asdMinValue) {
      return `Must be ${setting.asdMinValue} or more.`;
    }
    if (setting.asdMaxValue !== null && numeric > setting.asdMaxValue) {
      return `Must be ${setting.asdMaxValue} or less.`;
    }
  }
  return null;
}

/**
 * Two texts meaning the same value.
 *
 * `1.50` and `1.5` are one DECIMAL, and `t` and `true` are one BOOL, so a row
 * retyped into its own value is not dirty and does not write an override that
 * changes nothing.
 */
export function isSameValue(
  left: string | null,
  right: string | null,
  dataType: AppSettingDataType,
): boolean {
  const a = left ?? "";
  const b = right ?? "";
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  if (!isCastable(a, dataType) || !isCastable(b, dataType)) {
    return a.trim() === b.trim();
  }
  return toText(a, dataType) === toText(b, dataType);
}

/** The value a control should open on: the effective text, blank when the setting resolves to nothing. */
export function currentText(setting: EffectiveSetting): string {
  return setting.value ?? "";
}
