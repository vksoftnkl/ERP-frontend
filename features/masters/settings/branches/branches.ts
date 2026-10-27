import type { CSSProperties } from "react";
import type {
  ERPDynamicFieldValueChangeHandler,
  ERPDynamicModalField,
  ERPDynamicSelectOption,
} from "@/components/design-system/ui/dynamic-modal-form";
import type { LazyDropdownHandlers } from "@/features/masters/shared/use-lazy-configured-dropdown";
import {
  extractRows,
  getFirstDefinedValue,
  toDateInputValue,
  toDisplayValue,
  toNullableDate,
  toNullableInteger,
  toNullableNumber,
  toNullableString,
  toSelectBoolean,
  toUpper,
  toUpperNullable,
} from "@/features/masters/shared";
import {
  GST_REG_TYPE_OPTIONS,
  gstinFieldNames,
  type GstinFieldValidators,
} from "@/features/masters/shared/gst-registration";
import { prefixedGstinLookupFieldMap } from "@/features/masters/shared/gstin-lookup";
import {
  EDIT_MODE_FIELD,
  whenCreating,
  whenEditing,
} from "@/features/masters/shared/edit-mode-field";

export const BRANCH_STATE_KEYS = ["brState", "br_state"] as const;
export const BRANCH_ID_KEYS = ["brId", "br_id"] as const;
export const BRANCH_TYPE_OPTIONS: ERPDynamicSelectOption[] = [
  "HEAD OFFICE",
  "STORE",
  "WAREHOUSE",
  "BRANCH",
  "FACTORY",
  "SERVICE CENTER",
  "DEPOT",
].map((value) => ({ value, label: value }));
/**
 * The Qt form's vocabulary (decision D1). Informational on the server (notes 72
 * C4): stored, read by nothing yet. A row saved with the older "rounding off" /
 * "rounding up" words shows as no selection until it is saved again.
 */
export const ROUNDING_MODE_OPTIONS: ERPDynamicSelectOption[] = [
  "NORMAL",
  "ROUND UP",
  "ROUND DOWN",
  "NONE",
  "BANKERS",
].map((value) => ({ value, label: value }));
export const FSSAI_LICENSE_TYPE_OPTIONS: ERPDynamicSelectOption[] = [
  "Registration",
  "State License",
  "Central License",
].map((value) => ({ value, label: value }));
export const STATE_LOOKUP_ARRAY_KEYS = ["items", "data", "results", "rows", "list"] as const;
export const STATE_LOOKUP_NAME_KEYS = ["stateName", "state_name", "name", "label"] as const;
export const STATE_LOOKUP_CODE_KEYS = ["id", "value", "stateCode", "state_code", "code"] as const;
export const GST_LOOKUP_HELPER_TEXT =
  "Type a 15-character GSTIN to load the registered address automatically.";
export const GODOWN_HELPER_TEXT = "A new branch has no godowns yet; pick its default after it is saved.";
/** brGstinNo / brGstRegType / brPanNo — the three the GSTIN rules read. */
export const BRANCH_GSTIN_FIELDS = gstinFieldNames("br");
/**
 * Where a GSTIN lookup lands. The branch has no legal-name field; its NAME is
 * handled apart (see the lookup handler): branches in one state share the
 * company's GSTIN, so the trade name only fills a blank Branch Name.
 */
export const BRANCH_LOOKUP_FIELD_MAP = prefixedGstinLookupFieldMap("br", {
  name: undefined,
  legalName: undefined,
});
export const BRANCH_MODAL_PANEL_STYLE: CSSProperties = {
  width: "min(calc(92vw/var(--erp-ui-scale)), 70rem)",
  // Fixed height, sized to the tallest tab (Identity) rather than to whichever
  // tab is open, so the panel does not resize between tabs. The vh term keeps
  // it inside short viewports, where the body scrolls instead.
  height: "min(calc(88vh/var(--erp-ui-scale)), 800px)",
  maxHeight: "calc(88vh/var(--erp-ui-scale))",
};
export const PREFERENCE_CHECKBOX_FIELD_STYLE: CSSProperties = {
  marginBlock: "0.5rem",
};
export const BRANCH_STANDARD_FIELD_NAMES = [
  "brCompId",
  "brCode",
  "brName",
  "brMailingName",
  "brAlias",
  "brShort",
  "brType",
  "brAddr1",
  "brAddr2",
  "brAddr3",
  "brCity",
  "brDistrict",
  "brState",
  "brStateCode",
  "brPin",
  "brCountry",
  "brLandmark",
  "brRegionAddr1",
  "brRegionAddr2",
  "brRegionAddr3",
  "brRegionCity",
  "brRegionDistrict",
  "brRegionState",
  "brRegionCountry",
  "brRegionName",
  "brContactPerson",
  "brTel",
  "brPhone",
  "brMail",
  "brBillPrefix",
  "brInvoiceSeriesPrefix",
  "brBillGreeting",
  "brTerms",
  "brRoundingMode",
  "brRoundingValue",
  "brDefaultGodownId",
  "brPosType",
  "brBankId",
  "brFssaiNo",
  "brFssaiLicenseType",
  "brGstinNo",
  "brGstRegType",
  "brPanNo",
] as const;
export const BRANCH_DATE_FIELD_NAMES = ["brFssaiValidUpto"] as const;
export const BRANCH_BOOLEAN_FIELD_NAMES = [
  "brIsDefault",
  "brIsActive",
  "brAllowNegativeStock",
  "brSmsApplicable",
] as const;
/**
 * Create defaults: Qt's Rounding NORMAL / 0.50 and Country India; the column
 * defaults (decision D2) for Allow Negative Stock (true) and Send SMS (false).
 * Regional State / Country are regional-language text, so no English default.
 */
export const BRANCH_INITIAL_FORM_VALUES = {
  brCompId: "",
  brCode: "",
  brName: "",
  brMailingName: "",
  brAlias: "",
  brShort: "",
  brType: "",
  brIsDefault: "false",
  brIsActive: "true",
  brAddr1: "",
  brAddr2: "",
  brAddr3: "",
  brCity: "",
  brDistrict: "",
  brState: "",
  brStateCode: "",
  brPin: "",
  brCountry: "India",
  brLandmark: "",
  brRegionAddr1: "",
  brRegionAddr2: "",
  brRegionAddr3: "",
  brRegionCity: "",
  brRegionDistrict: "",
  brRegionState: "",
  brRegionCountry: "",
  brRegionName: "",
  brContactPerson: "",
  brTel: "",
  brPhone: "",
  brMail: "",
  brBillPrefix: "",
  brInvoiceSeriesPrefix: "",
  brBillGreeting: "",
  brTerms: "",
  brRoundingMode: "NORMAL",
  brRoundingValue: "0.50",
  brDefaultGodownId: "",
  brPosType: "",
  brAllowNegativeStock: "true",
  brSmsApplicable: "false",
  brBankId: "",
  brFssaiNo: "",
  brFssaiLicenseType: "",
  brFssaiValidUpto: "",
  brGstinNo: "",
  brGstRegType: "",
  brPanNo: "",
} as const;
export function buildStateCodeByName(payload: unknown): Record<string, string> {
  const codeByName = new Map<string, string>();
  const rows = extractRows(payload, STATE_LOOKUP_ARRAY_KEYS);
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const source = row as Record<string, unknown>;
    const stateName = toDisplayValue(
      getFirstDefinedValue(source, STATE_LOOKUP_NAME_KEYS),
    );
    const stateCode = toDisplayValue(
      getFirstDefinedValue(source, STATE_LOOKUP_CODE_KEYS),
    ).toUpperCase();
    if (!stateName || !stateCode || codeByName.has(stateName)) {
      continue;
    }
    codeByName.set(stateName, stateCode);
  }
  return Object.fromEntries(codeByName.entries());
}
export function buildStateNameByCode(payload: unknown): Record<string, string> {
  const nameByCode = new Map<string, string>();
  const rows = extractRows(payload, STATE_LOOKUP_ARRAY_KEYS);
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const source = row as Record<string, unknown>;
    const stateName = toDisplayValue(
      getFirstDefinedValue(source, STATE_LOOKUP_NAME_KEYS),
    );
    const stateCode = toDisplayValue(
      getFirstDefinedValue(source, STATE_LOOKUP_CODE_KEYS),
    ).toUpperCase();
    if (!stateName || !stateCode || nameByCode.has(stateCode)) {
      continue;
    }
    nameByCode.set(stateCode, stateName);
  }
  return Object.fromEntries(nameByCode.entries());
}
export function buildBranchFormFields({
  companyOptions,
  companyHandlers,
  stateOptions,
  stateHandlers,
  bankOptions,
  bankHandlers,
  godownOptions,
  godownHandlers,
  onBranchGstinValueChange,
  gstinValidators,
}: {
  companyOptions: ERPDynamicSelectOption[];
  companyHandlers: LazyDropdownHandlers;
  stateOptions: ERPDynamicSelectOption[];
  stateHandlers: LazyDropdownHandlers;
  bankOptions: ERPDynamicSelectOption[];
  bankHandlers: LazyDropdownHandlers;
  godownOptions: ERPDynamicSelectOption[];
  godownHandlers: LazyDropdownHandlers;
  onBranchGstinValueChange: ERPDynamicFieldValueChangeHandler;
  gstinValidators: GstinFieldValidators;
}): ERPDynamicModalField[] {
  return [
    // == Identity (tab) ======================================================
    {
      name: "__heading_identity",
      label: "Identity",
      type: "heading",
    },
    // Never shown: tells disabledWhen whether this is an edit.
    EDIT_MODE_FIELD,
    {
      name: "brName",
      label: "Branch Name",
      required: true,
      validation: {
        requiredMessage: "Enter the branch name.",
        minLength: 2,
        maxLength: 150,
        minLengthMessage: "Branch Name must be at least 2 characters.",
        maxLengthMessage: "Branch Name must be at most 150 characters.",
      },
    },
    {
      name: "brMailingName",
      label: "Mailing Name",
      validation: {
        maxLength: 150,
        maxLengthMessage: "Mailing Name must be at most 150 characters.",
      },
    },
    {
      name: "brAlias",
      label: "Alias",
      validation: {
        maxLength: 100,
        maxLengthMessage: "Alias must be at most 100 characters.",
      },
    },
    {
      name: "brCode",
      label: "Branch Code",
      validation: {
        maxLength: 20,
        maxLengthMessage: "Branch Code must be at most 20 characters.",
      },
    },
    {
      name: "brShort",
      label: "Short Code",
      validation: {
        maxLength: 50,
        maxLengthMessage: "Short Code must be at most 50 characters.",
      },
    },
    {
      name: "brType",
      label: "Branch Type",
      type: "select",
      required: true,
      options: BRANCH_TYPE_OPTIONS,
      validation: {
        requiredMessage: "Choose the branch type.",
      },
    },
    {
      name: "brCompId",
      label: "Company",
      type: "select",
      searchable: true,
      serverSearch: true,
      required: true,
      options: companyOptions,
      onSearchOpenChange: companyHandlers.onSearchOpenChange,
      onSearchQueryChange: companyHandlers.onSearchQueryChange,
      onValueChange: companyHandlers.onValueChange,
      // A branch's documents carry its company; moving it to another one would
      // split its history across two sets of books (the server refuses it for
      // any branch in use, notes 72 B4).
      disabledWhen: whenEditing,
      validation: {
        requiredMessage: "Choose the company.",
      },
    },
    {
      name: "__subheading_gst_registration",
      label: "GST Registration",
      type: "subheading",
    },
    {
      name: "brGstinNo",
      label: "GSTIN No",
      placeholder: "24ABCDE1234F1Z6",
      helperText: GST_LOOKUP_HELPER_TEXT,
      onValueChange: onBranchGstinValueChange,
      validation: {
        custom: gstinValidators.gstin,
      },
    },
    {
      name: "brGstRegType",
      label: "GST Reg Type",
      type: "select",
      searchable: true,
      required: true,
      options: GST_REG_TYPE_OPTIONS,
      validation: {
        requiredMessage: "Choose the GST registration type.",
      },
    },
    {
      name: "brPanNo",
      label: "PAN No",
      placeholder: "ABCDE1234F",
      validation: {
        minLength: 10,
        maxLength: 10,
        minLengthMessage: "PAN No must be exactly 10 characters.",
        maxLengthMessage: "PAN No must be exactly 10 characters.",
        pattern: "^[A-Za-z]{5}[0-9]{4}[A-Za-z]$",
        patternMessage: "PAN No must match the standard PAN format.",
        custom: gstinValidators.pan,
      },
    },
    {
      name: "__subheading_address",
      label: "Address",
      type: "subheading",
    },
    {
      name: "brAddr1",
      label: "Address Line 1",
    },
    {
      name: "brAddr2",
      label: "Address Line 2",
    },
    {
      name: "brAddr3",
      label: "Address Line 3",
    },
    {
      name: "brCity",
      label: "City",
      required: true,
      validation: {
        requiredMessage: "Enter the city.",
        maxLength: 100,
        maxLengthMessage: "City must be at most 100 characters.",
      },
    },
    {
      name: "brDistrict",
      label: "District",
      required: true,
      validation: {
        requiredMessage: "Enter the district.",
        maxLength: 100,
        maxLengthMessage: "District must be at most 100 characters.",
      },
    },
    {
      name: "brState",
      label: "State",
      type: "select",
      searchable: true,
      serverSearch: true,
      required: true,
      options: stateOptions,
      onSearchOpenChange: stateHandlers.onSearchOpenChange,
      onSearchQueryChange: stateHandlers.onSearchQueryChange,
      onValueChange: stateHandlers.onValueChange,
      validation: {
        requiredMessage: "Choose the state.",
      },
    },
    {
      name: "brPin",
      label: "Pin Code",
      type: "number",
      required: true,
      min: 0,
      step: 1,
      inputMode: "numeric",
      validation: {
        requiredMessage: "Enter the pin code.",
        minMessage: "Pin Code must be 0 or greater.",
      },
    },
    {
      name: "brCountry",
      label: "Country",
      validation: {
        maxLength: 60,
        maxLengthMessage: "Country must be at most 60 characters.",
      },
    },
    {
      name: "brLandmark",
      label: "Landmark",
      validation: {
        maxLength: 150,
        maxLengthMessage: "Landmark must be at most 150 characters.",
      },
    },
    {
      name: "__subheading_contact",
      label: "Contact",
      type: "subheading",
    },
    {
      name: "brContactPerson",
      label: "Contact Person",
      validation: {
        maxLength: 150,
        maxLengthMessage: "Contact Person must be at most 150 characters.",
      },
    },
    {
      name: "brTel",
      label: "Telephone",
      type: "tel",
      validation: {
        maxLength: 20,
        maxLengthMessage: "Telephone must be at most 20 characters.",
      },
    },
    {
      name: "brPhone",
      label: "Mobile / Phone",
      type: "tel",
      validation: {
        maxLength: 20,
        maxLengthMessage: "Mobile / Phone must be at most 20 characters.",
      },
    },
    {
      name: "brMail",
      label: "Email",
      type: "email",
    },
    // == Billing & Preferences (tab) =========================================
    {
      name: "__heading_billing",
      label: "Billing & Preferences",
      type: "heading",
    },
    {
      name: "__subheading_invoice",
      label: "Invoice & Operations",
      type: "subheading",
    },
    {
      name: "brBillPrefix",
      label: "Bill Prefix",
      validation: {
        maxLength: 20,
        maxLengthMessage: "Bill Prefix must be at most 20 characters.",
      },
    },
    {
      name: "brInvoiceSeriesPrefix",
      label: "Invoice Series Prefix",
      validation: {
        maxLength: 20,
        maxLengthMessage: "Invoice Series Prefix must be at most 20 characters.",
      },
    },
    {
      name: "brRoundingMode",
      label: "Rounding Mode",
      type: "select",
      options: ROUNDING_MODE_OPTIONS,
    },
    {
      name: "brRoundingValue",
      label: "Rounding Value",
      type: "number",
      min: 0,
      step: "0.01",
      inputMode: "decimal",
      validation: {
        minMessage: "Rounding Value must be 0 or greater.",
      },
    },
    {
      name: "brBankId",
      label: "Default Bank",
      type: "select",
      searchable: true,
      serverSearch: true,
      options: bankOptions,
      placeholder: "Search bank ledger",
      onSearchOpenChange: bankHandlers.onSearchOpenChange,
      onSearchQueryChange: bankHandlers.onSearchQueryChange,
      onValueChange: bankHandlers.onValueChange,
    },
    {
      name: "brDefaultGodownId",
      label: "Default Godown",
      type: "select",
      searchable: true,
      serverSearch: true,
      options: godownOptions,
      placeholder: "Search godown",
      helperText: GODOWN_HELPER_TEXT,
      // Only this branch's own godowns can be its default, and a new branch has
      // none yet: the field opens once the branch is saved.
      disabledWhen: whenCreating,
      onSearchOpenChange: godownHandlers.onSearchOpenChange,
      onSearchQueryChange: godownHandlers.onSearchQueryChange,
      onValueChange: godownHandlers.onValueChange,
    },
    {
      name: "brBillGreeting",
      label: "Bill Greeting",
      type: "textarea",
      rows: 2,
      colSpan: 2,
      validation: {
        maxLength: 300,
        maxLengthMessage: "Bill Greeting must be at most 300 characters.",
      },
    },
    {
      name: "brTerms",
      label: "Terms & Conditions",
      type: "textarea",
      rows: 3,
      colSpan: 2,
    },
    {
      name: "__subheading_fssai",
      label: "FSSAI",
      type: "subheading",
    },
    {
      name: "brFssaiNo",
      label: "FSSAI No",
      validation: {
        maxLength: 20,
        maxLengthMessage: "FSSAI No must be at most 20 characters.",
      },
    },
    {
      name: "brFssaiLicenseType",
      label: "License Type",
      type: "select",
      options: FSSAI_LICENSE_TYPE_OPTIONS,
    },
    {
      name: "brFssaiValidUpto",
      label: "Valid Upto",
      type: "date",
    },
    {
      name: "__subheading_preferences",
      label: "Preferences",
      type: "subheading",
    },
    {
      name: "brAllowNegativeStock",
      label: "Allow Negative Stock",
      type: "checkbox",
      fieldStyle: PREFERENCE_CHECKBOX_FIELD_STYLE,
    },
    {
      name: "brSmsApplicable",
      label: "Send SMS",
      type: "checkbox",
      fieldStyle: PREFERENCE_CHECKBOX_FIELD_STYLE,
    },
    {
      name: "brIsDefault",
      label: "Default Branch",
      type: "checkbox",
      fieldStyle: PREFERENCE_CHECKBOX_FIELD_STYLE,
    },
    {
      name: "brIsActive",
      label: "Active",
      type: "checkbox",
      fieldStyle: PREFERENCE_CHECKBOX_FIELD_STYLE,
    },
    // == Regional Details (tab) ==============================================
    // Regional-language values, typed as the region writes them.
    {
      name: "__heading_regional",
      label: "Regional Details",
      type: "heading",
    },
    {
      name: "brRegionName",
      label: "Regional Name",
    },
    {
      name: "brRegionAddr1",
      label: "Regional Addr 1",
    },
    {
      name: "brRegionAddr2",
      label: "Regional Addr 2",
    },
    {
      name: "brRegionAddr3",
      label: "Regional Addr 3",
    },
    {
      name: "brRegionCity",
      label: "Regional City",
      validation: {
        maxLength: 100,
        maxLengthMessage: "Regional City must be at most 100 characters.",
      },
    },
    {
      name: "brRegionDistrict",
      label: "Regional District",
      validation: {
        maxLength: 100,
        maxLengthMessage: "Regional District must be at most 100 characters.",
      },
    },
    {
      name: "brRegionState",
      label: "Regional State",
    },
    {
      name: "brRegionCountry",
      label: "Regional Country",
      validation: {
        maxLength: 60,
        maxLengthMessage: "Regional Country must be at most 60 characters.",
      },
    },
  ];
}
export function toSnakeCaseKey(value: string): string {
  return value.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`);
}
export function getBranchFieldValue(
  source: Record<string, unknown>,
  fieldName: string,
): unknown {
  return getFirstDefinedValue(source, [fieldName, toSnakeCaseKey(fieldName)]);
}
export function mapBranchFormValues(
  source: Record<string, unknown> | null,
  defaults: Record<string, string>,
  stateNameByCode: Record<string, string>,
): Record<string, string> {
  const rowSource = source ?? {};
  const mergedDefaults: Record<string, string> = {
    ...BRANCH_INITIAL_FORM_VALUES,
    ...defaults,
  };
  const values: Record<string, string> = { ...mergedDefaults };
  for (const fieldName of BRANCH_STANDARD_FIELD_NAMES) {
    const resolvedValue = toDisplayValue(getBranchFieldValue(rowSource, fieldName));
    // A saved record shows what it holds: create defaults (Rounding NORMAL /
    // 0.50, Country India) only fill a NEW form.
    values[fieldName] = source ? resolvedValue : resolvedValue || mergedDefaults[fieldName] || "";
  }
  for (const fieldName of BRANCH_DATE_FIELD_NAMES) {
    const resolvedValue = toDateInputValue(getBranchFieldValue(rowSource, fieldName));
    values[fieldName] = resolvedValue || (source ? "" : mergedDefaults[fieldName] || "");
  }
  for (const fieldName of BRANCH_BOOLEAN_FIELD_NAMES) {
    const fallback = mergedDefaults[fieldName] === "false" ? "false" : "true";
    values[fieldName] = toSelectBoolean(
      getBranchFieldValue(rowSource, fieldName),
      fallback,
    );
  }
  const existingStateCode = toDisplayValue(
    getBranchFieldValue(rowSource, "brStateCode"),
  ).toUpperCase();
  if (!values.brState && existingStateCode) {
    values.brState = stateNameByCode[existingStateCode] ?? "";
  }
  values.brStateCode = existingStateCode || mergedDefaults.brStateCode || "";
  return values;
}
/** The save payload minus the update id, which the module adds. */
export function buildBranchRequestPayload(
  values: Record<string, string>,
  stateCodeByName: Record<string, string>,
): Record<string, unknown> {
  const normalizedState = (values.brState ?? "").trim();
  const derivedStateCode =
    stateCodeByName[normalizedState] ??
    (values.brStateCode ?? "").trim().toUpperCase();
  const payload: Record<string, unknown> = {
    brCompId: (values.brCompId ?? "").trim(),
    brCode: toNullableString(values.brCode ?? ""),
    brName: (values.brName ?? "").trim(),
    brMailingName: toNullableString(values.brMailingName ?? ""),
    brAlias: toNullableString(values.brAlias ?? ""),
    brShort: toNullableString(values.brShort ?? ""),
    brType: toNullableString(values.brType ?? ""),
    brIsDefault: (values.brIsDefault ?? "false") === "true",
    brIsActive: (values.brIsActive ?? "true") === "true",
    brAddr1: toNullableString(values.brAddr1 ?? ""),
    brAddr2: toNullableString(values.brAddr2 ?? ""),
    brAddr3: toNullableString(values.brAddr3 ?? ""),
    brCity: toNullableString(values.brCity ?? ""),
    brDistrict: toNullableString(values.brDistrict ?? ""),
    brState: toNullableString(values.brState ?? ""),
    brStateCode: toUpper(derivedStateCode),
    brPin: toNullableInteger(values.brPin ?? ""),
    brCountry: (values.brCountry ?? "").trim() || "India",
    brLandmark: toNullableString(values.brLandmark ?? ""),
    brRegionAddr1: toNullableString(values.brRegionAddr1 ?? ""),
    brRegionAddr2: toNullableString(values.brRegionAddr2 ?? ""),
    brRegionAddr3: toNullableString(values.brRegionAddr3 ?? ""),
    brRegionCity: toNullableString(values.brRegionCity ?? ""),
    brRegionDistrict: toNullableString(values.brRegionDistrict ?? ""),
    brRegionState: toNullableString(values.brRegionState ?? ""),
    brRegionCountry: toNullableString(values.brRegionCountry ?? ""),
    brRegionName: toNullableString(values.brRegionName ?? ""),
    brContactPerson: toNullableString(values.brContactPerson ?? ""),
    brTel: toNullableString(values.brTel ?? ""),
    brPhone: toNullableString(values.brPhone ?? ""),
    brMail: toNullableString(values.brMail ?? ""),
    brBillPrefix: toNullableString(values.brBillPrefix ?? ""),
    brInvoiceSeriesPrefix: toNullableString(
      values.brInvoiceSeriesPrefix ?? "",
    ),
    brBillGreeting: toNullableString(values.brBillGreeting ?? ""),
    brTerms: toNullableString(values.brTerms ?? ""),
    brRoundingMode: toNullableString(values.brRoundingMode ?? ""),
    brRoundingValue: toNullableNumber(values.brRoundingValue ?? ""),
    brDefaultGodownId: toNullableString(values.brDefaultGodownId ?? ""),
    // Not on the form (Qt has no field for it either); carried through so
    // an edit does not wipe a value set elsewhere.
    brPosType: toNullableString(values.brPosType ?? ""),
    brAllowNegativeStock:
      (values.brAllowNegativeStock ?? "false") === "true",
    brSmsApplicable: (values.brSmsApplicable ?? "false") === "true",
    brBankId: toNullableString(values.brBankId ?? ""),
    brFssaiNo: toNullableString(values.brFssaiNo ?? ""),
    brFssaiLicenseType: toNullableString(values.brFssaiLicenseType ?? ""),
    brFssaiValidUpto: toNullableDate(values.brFssaiValidUpto ?? ""),
    brGstinNo: toUpperNullable(values.brGstinNo ?? ""),
    brGstRegType: toUpperNullable(values.brGstRegType ?? ""),
    brPanNo: toUpperNullable(values.brPanNo ?? ""),
  };
  return payload;
}
