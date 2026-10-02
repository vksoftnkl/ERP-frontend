/**
 * GST registration rules shared by the Company and Branch masters.
 *
 * The client mirror of the server's `settings/shared/gst-registration.ts`
 * (notes 72 C3 / C7) and of the Qt forms' `extraValidate` in
 * `company_entry.cpp` / `branch_entry.cpp`, so a GSTIN the server would refuse
 * is refused here first, with the same words the desktop client uses.
 *
 * Pure: no React, no network. `gst-registration.test.ts` pins the rules.
 */
import type { ERPDynamicSelectOption } from "@/components/design-system/ui/dynamic-modal-form";
import { hasValidGstinChecksum } from "@/utils/validation";

/**
 * A company's or branch's OWN registration — ck_comp_gst_reg_type and
 * ck_br_gst_reg_type hold exactly these four. Customer / supplier / ledger keep
 * their own three-value lists: their servers do not accept SEZ.
 */
export const GST_REG_TYPES = ["REGULAR", "COMPOSITION", "UNREGISTERED", "SEZ"] as const;
export type GstRegType = (typeof GST_REG_TYPES)[number];

export const GST_REG_TYPE_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "REGULAR", label: "Regular" },
  { value: "COMPOSITION", label: "Composition" },
  { value: "UNREGISTERED", label: "Unregistered" },
  { value: "SEZ", label: "SEZ" },
];

export function isGstRegType(value: string): value is GstRegType {
  return (GST_REG_TYPES as readonly string[]).includes(value);
}

/** "Regular" for REGULAR; the raw value when it is none of the four. */
export function gstRegTypeLabel(value: string): string {
  const normalized = value.trim().toUpperCase();
  return GST_REG_TYPE_OPTIONS.find((option) => option.value === normalized)?.label ?? value.trim();
}

/** 2-digit state code, 10-character PAN, entity number (1-9, A-Z), 'Z', check character. */
export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function normalizeGstin(raw: string): string {
  return raw.trim().toUpperCase();
}

/** Format AND mod-36 checksum, as the Qt client's TaxValidator::isValidGstin. */
export function isValidGstin(raw: string): boolean {
  const gstin = normalizeGstin(raw);
  return GSTIN_PATTERN.test(gstin) && hasValidGstinChecksum(gstin);
}

/** GSTIN characters 1-2: the state the registration was issued in. */
export function stateCodeOfGstin(gstin: string): string {
  return normalizeGstin(gstin).slice(0, 2);
}

/** GSTIN characters 3-12: the holder's PAN. */
export function panOfGstin(gstin: string): string {
  return normalizeGstin(gstin).slice(2, 12);
}

// ---------------------------------------------------------------------------
// Messages — the Qt forms' words, so the two clients read the same.

export const GSTIN_INVALID_MESSAGE =
  "The GSTIN is not valid. It must be 15 characters in the form 22AAAAA0000A1ZC.";

export function gstinRequiredMessage(regType: string): string {
  const normalized = regType.trim();
  if (!normalized) {
    return "A GSTIN is required. Choose 'Unregistered' as the GST Reg Type to save without one.";
  }
  return (
    `A GSTIN is required for '${gstRegTypeLabel(normalized)}' registration. ` +
    "Select 'Unregistered' to save without one."
  );
}

export function gstinStateMismatchMessage(gstin: string, stateCode: string): string {
  return (
    `The GSTIN ${gstin} belongs to state code ${stateCodeOfGstin(gstin)}, ` +
    `but the State chosen is ${stateCode}.`
  );
}

export function gstinPanMismatchMessage(gstin: string, typedPan: string): string {
  return `The PAN in the GSTIN is ${panOfGstin(gstin)}, but PAN No is ${typedPan}.`;
}

// ---------------------------------------------------------------------------
// Field validators for the dynamic modal form.

export type GstinFieldNames = {
  /** The GSTIN text field. */
  gstin: string;
  /** The GST Reg Type select (REGULAR / COMPOSITION / UNREGISTERED / SEZ). */
  regType: string;
  /** The PAN text field. */
  pan: string;
};

/** `comp` → compGstinNo / compGstRegType / compPanNo; `br` → brGstinNo … */
export function gstinFieldNames(prefix: string): GstinFieldNames {
  return {
    gstin: `${prefix}GstinNo`,
    regType: `${prefix}GstRegType`,
    pan: `${prefix}PanNo`,
  };
}

export type GstinFieldValidatorOptions = {
  fields: GstinFieldNames;
  /**
   * The 2-digit code of the State the form has picked, read from the live
   * values — the forms store the state NAME, so the caller resolves it (and
   * answers "" while no state is chosen, which skips the check).
   */
  stateCodeOf: (values: Record<string, string>) => string;
};

/** A `validation.custom` for the GSTIN field. */
export function validateGstinField(
  value: string,
  values: Record<string, string>,
  options: GstinFieldValidatorOptions,
): string | null {
  const gstin = normalizeGstin(value);
  const regType = (values[options.fields.regType] ?? "").trim().toUpperCase();
  if (!gstin) {
    // Unregistered: no GSTIN needed. Anything else must carry one.
    return regType === "UNREGISTERED" ? null : gstinRequiredMessage(regType);
  }
  if (!isValidGstin(gstin)) {
    return GSTIN_INVALID_MESSAGE;
  }
  // A GSTIN starts with the state code it was issued in, so it has to agree
  // with the State picked on the form (place of supply is read from it).
  const stateCode = options.stateCodeOf(values).trim().toUpperCase();
  if (stateCode && !gstin.startsWith(stateCode)) {
    return gstinStateMismatchMessage(gstin, stateCode);
  }
  return null;
}

/** A `validation.custom` for the PAN field: it must be the GSTIN's PAN. */
export function validatePanField(
  value: string,
  values: Record<string, string>,
  options: GstinFieldValidatorOptions,
): string | null {
  const typed = value.trim().toUpperCase();
  if (!typed) {
    // A blank PAN is filled from the GSTIN (here on change, and by the server).
    return null;
  }
  const gstin = normalizeGstin(values[options.fields.gstin] ?? "");
  if (!isValidGstin(gstin)) {
    return null;
  }
  return typed === panOfGstin(gstin) ? null : gstinPanMismatchMessage(gstin, typed);
}

/**
 * What a GSTIN field's `onValueChange` writes back: the upper-cased GSTIN
 * (when the user typed lower-case) and, for a well-formed GSTIN, the PAN it
 * carries into a blank PAN field. Empty when there is nothing to change.
 */
export function buildGstinValueChangePatch(
  value: string,
  values: Record<string, string>,
  fields: GstinFieldNames,
): Record<string, string> {
  const patch: Record<string, string> = {};
  const gstin = normalizeGstin(value);
  if (gstin !== value) {
    patch[fields.gstin] = gstin;
  }
  if (isValidGstin(gstin) && !(values[fields.pan] ?? "").trim()) {
    patch[fields.pan] = panOfGstin(gstin);
  }
  return patch;
}

export type GstinFieldValidators = {
  gstin: (value: string, values: Record<string, string>) => string | null;
  pan: (value: string, values: Record<string, string>) => string | null;
  valueChangePatch: (value: string, values: Record<string, string>) => Record<string, string>;
};

/** The three bound to one form's field names, ready to wire. */
export function buildGstinFieldValidators(options: GstinFieldValidatorOptions): GstinFieldValidators {
  return {
    gstin: (value, values) => validateGstinField(value, values, options),
    pan: (value, values) => validatePanField(value, values, options),
    valueChangePatch: (value, values) => buildGstinValueChangePatch(value, values, options.fields),
  };
}
