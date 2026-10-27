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
  toCsvFromArray,
  toDateInputValue,
  toDisplayValue,
  toNonNegativeNumber,
  toNullableDate,
  toNullableInteger,
  toNullableNumber,
  toNullableString,
  toSelectBoolean,
  toUniqueStringArrayFromCsv,
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
  validateFiscalYearFields,
  type FiscalYearFieldKey,
} from "@/features/masters/shared/fiscal-year";
import {
  EDIT_MODE_FIELD,
  isEditingValues,
  whenEditing,
} from "@/features/masters/shared/edit-mode-field";
import {
  resolveStoredPhotoName,
  resolveStoredPhotoPreview,
} from "@/features/masters/shared/stored-photo";

export const STATE_LOOKUP_ARRAY_KEYS = [
  "items",
  "data",
  "results",
  "rows",
  "list",
  "stateCodes",
  "state_codes",
  "states",
] as const;
export const STATE_LOOKUP_NAME_KEYS = ["stateName", "state_name", "name", "label"] as const;
export const STATE_LOOKUP_CODE_KEYS = ["id", "value", "stateCode", "state_code", "code"] as const;
export const GST_LOOKUP_HELPER_TEXT =
  "Type a 15-character GSTIN to load company details automatically.";
/** compGstinNo / compGstRegType / compPanNo — the three the GSTIN rules read. */
export const COMPANY_GSTIN_FIELDS = gstinFieldNames("comp");
/** Where a GSTIN lookup lands; the company also switches GST Applicable on. */
export const COMPANY_LOOKUP_FIELD_MAP = prefixedGstinLookupFieldMap("comp", {
  gstApplicable: "compGstApplicable",
});
export const PRICE_FIXING_OPTIONS: ERPDynamicSelectOption[] = [
  {
    value: "Do not Update When Purchase",
    label: "Do not Update When Purchase",
  },
  {
    value: "Update Sales Price When Purchase",
    label: "Update Sales Price When Purchase",
  },
  {
    label: "Update Only Cost Price When Purchase",
    value: "Update Only Cost Price When Purchase",
  },
  {
    label: "Open Change Selling when Purchase",
    value: "Open Change Selling when Purchase",
  },
];
/**
 * ck_comp_aato_class — the annual aggregate turnover band (notes 72 A2). It
 * decides e-invoice applicability and HSN digits; NOT NULL, column default
 * LE_5CR, so a new company starts there.
 */
export const AATO_CLASS_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "LE_1_5CR", label: "Up to 1.5 Cr" },
  { value: "LE_5CR", label: "Up to 5 Cr" },
  { value: "LE_10CR", label: "Up to 10 Cr" },
  { value: "GT_10CR", label: "Above 10 Cr" },
];
export const DEFAULT_AATO_CLASS = "LE_5CR";
/**
 * The delivery-challan purposes a company may issue (notes 72 A3; the CHECK on
 * sales.sale_dc.sdc_purpose). At least one; the column default is the four the
 * Qt widget ticks for a new company.
 */
export const DC_PURPOSE_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "SUPPLY", label: "Supply" },
  { value: "APPROVAL", label: "Approval" },
  { value: "JOB_WORK", label: "Job Work" },
  { value: "EXHIBITION", label: "Exhibition" },
  { value: "OWN_USE", label: "Own Use" },
  { value: "LINE_SALES", label: "Line Sales" },
  { value: "OTHER", label: "Other" },
];
export const DEFAULT_DC_PURPOSES = "SUPPLY,APPROVAL,JOB_WORK,OTHER";
export const DC_PURPOSES_REQUIRED_MESSAGE = "Tick at least one delivery-challan purpose.";
/** Notes 72 C5: the signature is an image of at most this size, of these kinds. */
export const SIGNATURE_MAX_BYTES = 512 * 1024;
export const SIGNATURE_MIME_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
/** Holds the stored signature's data URL for the file field's preview on edit. */
export const SIGNATURE_PREVIEW_FIELD = "compAuthorizeSignaturePreview";
export const APPLICABILITY_CHECKBOX_FIELD_STYLE: CSSProperties = {
  marginBlock: "0.5rem",
};
export const COMPANY_MODAL_PANEL_STYLE: CSSProperties = {
  width: "min(calc(92vw/var(--erp-ui-scale)), 70rem)",
  // Fixed height, sized to the tallest tab rather than to whichever tab is open,
  // so the panel does not resize as you move between them. The Tax tab is the
  // tallest (the turnover band and the delivery-challan purposes joined it);
  // shorter tabs leave an empty band above the footer, which is the cost of a
  // stable panel. The vh term keeps it inside short viewports, where the body
  // scrolls instead.
  height: "min(calc(88vh/var(--erp-ui-scale)), 800px)",
  maxHeight: "calc(88vh/var(--erp-ui-scale))",
};
export const COMPANY_STANDARD_FIELD_NAMES = [
  "compName",
  "compCode",
  "compShort",
  "compLegalName",
  "compGstinNo",
  "compGstRegType",
  "compPanNo",
  "compTanNo",
  "compCinNo",
  "compFssaiNo",
  "compDrugLicenseNo",
  "compAatoClass",
  "compAddr1",
  "compAddr2",
  "compAddr3",
  "compCity",
  "compDistrict",
  "compState",
  "compStateCode",
  "compPin",
  "compCountry",
  "compRegionAddr1",
  "compRegionAddr2",
  "compRegionAddr3",
  "compRegionCity",
  "compRegionDistrict",
  "compRegionState",
  "compRegionCountry",
  "compRegionName",
  "compTel",
  "compPhone",
  "compMail",
  "compSupportEmail",
  "compSupportPhone",
  "compWebsiteName",
  "compEwayInterLimit",
  "compEwayIntraLimit",
  "compStylesheetId",
  "compBankId",
  "compPriceFixing",
  "compPrefixCode",
  "compBillGreeting",
  "compCurrencyCode",
  "compCurrencySymbol",
  "compLocaleCode",
  "compRemarks",
] as const;
// Create-only on the server (notes 72 C2): they seed the company's first
// fiscal_years row; on update they are ignored and GET returns the current
// year's. The lock date belongs to the year and is not offered here.
export const COMPANY_DATE_FIELD_NAMES = [
  "compFinYearFrom",
  "compFinYearTo",
  "compBooksBeginFrom",
  "compEwayDate",
  "compEinvoiceDate",
] as const;
export const COMPANY_BOOLEAN_FIELD_NAMES = [
  "compGstApplicable",
  "compTcsApplicable",
  "compTdsApplicable",
  "compSmsApplicable",
  "compEinvoiceApplicable",
  "compEwayApplicable",
  "compEwayIntraApl",
  "compEinvoiceInclEway",
  "compNegStkApl",
  "compDefault",
  "compIsActive",
] as const;
/**
 * Create defaults. Where Qt and the column defaults disagree (Qt ticks Send
 * SMS, the column is false), the COLUMN wins: a row saved from anywhere else
 * gets the column's value, and the two clients should agree with it.
 */
export const COMPANY_INITIAL_FORM_VALUES = {
  compName: "",
  compCode: "",
  compShort: "",
  compLegalName: "",
  compGstinNo: "",
  compGstRegType: "",
  compPanNo: "",
  compTanNo: "",
  compCinNo: "",
  compFssaiNo: "",
  compDrugLicenseNo: "",
  compAatoClass: DEFAULT_AATO_CLASS,
  compDcPurposes: DEFAULT_DC_PURPOSES,
  compAddr1: "",
  compAddr2: "",
  compAddr3: "",
  compCity: "",
  compDistrict: "",
  compState: "",
  compStateCode: "",
  compPin: "",
  compCountry: "India",
  compRegionAddr1: "",
  compRegionAddr2: "",
  compRegionAddr3: "",
  compRegionCity: "",
  compRegionDistrict: "",
  compRegionState: "",
  compRegionCountry: "",
  compRegionName: "",
  compTel: "",
  compPhone: "",
  compMail: "",
  compSupportEmail: "",
  compSupportPhone: "",
  compWebsiteName: "",
  compFinYearFrom: "",
  compFinYearTo: "",
  compBooksBeginFrom: "",
  compGstApplicable: "true",
  compTcsApplicable: "false",
  compTdsApplicable: "false",
  compSmsApplicable: "false",
  compEinvoiceApplicable: "false",
  compEwayApplicable: "false",
  compEwayDate: "",
  compEwayInterLimit: "",
  compEwayIntraApl: "false",
  compEwayIntraLimit: "0",
  compEinvoiceDate: "",
  compEinvoiceInclEway: "false",
  compStylesheetId: "",
  compBankId: "",
  compPriceFixing: "",
  compPrefixCode: "",
  compBillGreeting: "",
  compNegStkApl: "true",
  compDefault: "false",
  compIsActive: "true",
  compCurrencyCode: "INR",
  compCurrencySymbol: "",
  compLocaleCode: "en-IN",
  compRemarks: "",
  // The file field shows the stored file's NAME; the preview key holds its data URL.
  compAuthorizeSignature: "",
  [SIGNATURE_PREVIEW_FIELD]: "",
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
/**
 * The Qt form's three fiscal-year checks, one `validation.custom` per date
 * field: each reports only its own failure, first failure wins. Create only —
 * on edit the three are read-only and show the stored year.
 */
export function fiscalYearFieldValidator(field: FiscalYearFieldKey) {
  return (_value: string, values: Record<string, string>): string | null => {
    if (isEditingValues(values)) {
      return null;
    }
    const error = validateFiscalYearFields({
      from: values.compFinYearFrom ?? "",
      to: values.compFinYearTo ?? "",
      books: values.compBooksBeginFrom ?? "",
    });
    return error?.field === field ? error.message : null;
  };
}
export function buildCompanyFormFields({
  bankOptions,
  bankHandlers,
  stateOptions,
  stateHandlers,
  appThemeOptions,
  appThemeHandlers,
  onCompanyGstinValueChange,
  gstinValidators,
}: {
  bankOptions: ERPDynamicSelectOption[];
  bankHandlers: LazyDropdownHandlers;
  stateOptions: ERPDynamicSelectOption[];
  stateHandlers: LazyDropdownHandlers;
  appThemeOptions: ERPDynamicSelectOption[];
  appThemeHandlers: LazyDropdownHandlers;
  onCompanyGstinValueChange: ERPDynamicFieldValueChangeHandler;
  gstinValidators: GstinFieldValidators;
}): ERPDynamicModalField[] {
  return [
    // == Identity (tab) ======================================================
    {
      name: "__heading_identity",
      label: "Identity",
      type: "heading",
    },
    // Never shown: tells disabledWhen / the validators whether this is an edit.
    EDIT_MODE_FIELD,
    {
      name: "compGstinNo",
      label: "GSTIN No",
      placeholder: "24ABCDE1234F1Z6",
      helperText: GST_LOOKUP_HELPER_TEXT,
      onValueChange: onCompanyGstinValueChange,
      validation: {
        custom: gstinValidators.gstin,
      },
    },
    {
      name: "compGstRegType",
      label: "GST Reg Type",
      type: "select",
      searchable: true,
      required: true,
      options: GST_REG_TYPE_OPTIONS,
      validation: {
        requiredMessage: "Choose registration type.",
      },
    },
    {
      name: "compName",
      label: "Company Name",
      required: true,
      validation: {
        minLength: 2,
        minLengthMessage: "Company Name must be at least 2 characters.",
        requiredMessage: "Enter the company name.",
      },
    },
    {
      name: "compCode",
      label: "Company Code",
      validation: {
        maxLength: 20,
        maxLengthMessage: "Company Code must be at most 20 characters.",
      },
    },
    {
      name: "compShort",
      label: "Short Code",
    },
    {
      name: "compLegalName",
      label: "Legal Name",
    },
    {
      name: "compPriceFixing",
      label: "Price Fixing",
      type: "select",
      required: true,
      options: PRICE_FIXING_OPTIONS,
      validation: {
        requiredMessage: "Choose price fixing.",
        maxLength: 50,
        maxLengthMessage: "Price Fixing must be at most 50 characters.",
      },
    },
    {
      name: "__subheading_address",
      label: "Address",
      type: "subheading",
    },
    {
      name: "compAddr1",
      label: "Address Line 1",
    },
    {
      name: "compAddr2",
      label: "Address Line 2",
    },
    {
      name: "compAddr3",
      label: "Address Line 3",
    },
    {
      name: "compCity",
      label: "City",
      validation: {
        maxLength: 100,
        maxLengthMessage: "City must be at most 100 characters.",
      },
    },
    {
      name: "compDistrict",
      label: "District",
      validation: {
        maxLength: 100,
        maxLengthMessage: "District must be at most 100 characters.",
      },
    },
    {
      name: "compState",
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
        requiredMessage: "Choose state name.",
      },
    },
    {
      name: "compPin",
      label: "Pin Code",
      type: "number",
      min: 0,
      step: 1,
      inputMode: "numeric",
      validation: {
        minMessage: "Pin Code must be 0 or greater.",
      },
    },
    {
      name: "compCountry",
      label: "Country",
      validation: {
        maxLength: 60,
        maxLengthMessage: "Country must be at most 60 characters.",
      },
    },
    {
      name: "__subheading_contact",
      label: "Contact",
      type: "subheading",
    },
    {
      name: "compPhone",
      label: "Mobile / Phone",
      type: "tel",
    },
    {
      name: "compTel",
      label: "Telephone",
      type: "tel",
    },
    {
      name: "compMail",
      label: "Mail ID",
      type: "email",
    },
    {
      name: "compWebsiteName",
      label: "Website",
      type: "url",
    },
    {
      name: "compSupportPhone",
      label: "Support Phone",
      type: "tel",
    },
    {
      name: "compSupportEmail",
      label: "Support Email",
      type: "email",
    },
    // == Tax and Compliance (tab) ============================================
    {
      name: "__heading_tax",
      label: "Tax and Compliance",
      type: "heading",
    },
    {
      name: "compPanNo",
      label: "PAN No",
      placeholder: "ABCDE1234F",
      validation: {
        minLength: 10,
        maxLength: 10,
        minLengthMessage: "PAN No must be exactly 10 characters.",
        maxLengthMessage: "PAN No must be exactly 10 characters.",
        pattern: "^[A-Za-z]{5}[0-9]{4}[A-Za-z]$",
        patternMessage: "PAN No must match the standard PAN format.",
        // Characters 3-12 of the GSTIN are the holder's PAN: the two must agree.
        custom: gstinValidators.pan,
      },
    },
    {
      name: "compTanNo",
      label: "TAN No",
    },
    {
      name: "compCinNo",
      label: "CIN No",
    },
    {
      name: "compFssaiNo",
      label: "FSSAI No",
      validation: {
        maxLength: 20,
        maxLengthMessage: "FSSAI No must be at most 20 characters.",
      },
    },
    {
      name: "compDrugLicenseNo",
      label: "Drug License No",
      validation: {
        maxLength: 20,
        maxLengthMessage: "Drug License No must be at most 20 characters.",
      },
    },
    {
      name: "compAatoClass",
      label: "Turnover (AATO)",
      type: "select",
      required: true,
      options: AATO_CLASS_OPTIONS,
      validation: {
        requiredMessage: "Choose the turnover band.",
      },
    },
    {
      name: "compGstApplicable",
      label: "GST Applicable",
      type: "checkbox",
      fieldStyle: APPLICABILITY_CHECKBOX_FIELD_STYLE,
    },
    {
      name: "compTcsApplicable",
      label: "TCS Applicable",
      type: "checkbox",
      fieldStyle: APPLICABILITY_CHECKBOX_FIELD_STYLE,
    },
    {
      name: "compTdsApplicable",
      label: "TDS Applicable",
      type: "checkbox",
      fieldStyle: APPLICABILITY_CHECKBOX_FIELD_STYLE,
    },
    {
      name: "compSmsApplicable",
      label: "Send SMS",
      type: "checkbox",
      fieldStyle: APPLICABILITY_CHECKBOX_FIELD_STYLE,
    },
    {
      name: "compNegStkApl",
      label: "Allow Negative Stock",
      type: "checkbox",
      fieldStyle: APPLICABILITY_CHECKBOX_FIELD_STYLE,
    },
    {
      name: "compDefault",
      label: "Default Company",
      type: "checkbox",
      fieldStyle: APPLICABILITY_CHECKBOX_FIELD_STYLE,
    },
    {
      name: "compIsActive",
      label: "Active",
      type: "checkbox",
      fieldStyle: APPLICABILITY_CHECKBOX_FIELD_STYLE,
    },
    {
      name: "__subheading_einvoicing",
      label: "e-Invoicing",
      type: "subheading",
    },
    {
      name: "compEinvoiceApplicable",
      label: "e-Invoicing Applicable",
      type: "checkbox",
      fieldStyle: APPLICABILITY_CHECKBOX_FIELD_STYLE,
    },
    {
      name: "compEinvoiceDate",
      label: "e-Invoice From",
      type: "date",
    },
    {
      name: "compEinvoiceInclEway",
      label: "Send e-Way details with e-Invoice",
      type: "checkbox",
      fieldStyle: APPLICABILITY_CHECKBOX_FIELD_STYLE,
    },
    {
      name: "__subheading_eway",
      label: "e-Way Bill",
      type: "subheading",
    },
    {
      name: "compEwayApplicable",
      label: "e-Way Bill Applicable",
      type: "checkbox",
      fieldStyle: APPLICABILITY_CHECKBOX_FIELD_STYLE,
    },
    {
      name: "compEwayDate",
      label: "e-Way From",
      type: "date",
    },
    {
      name: "compEwayInterLimit",
      label: "Other State Limit",
      type: "number",
      min: 0,
      step: "0.01",
      validation: {
        minMessage: "Other State Limit must be 0 or greater.",
      },
    },
    {
      name: "compEwayIntraApl",
      label: "Applicable for Own State",
      type: "checkbox",
      fieldStyle: APPLICABILITY_CHECKBOX_FIELD_STYLE,
    },
    {
      name: "compEwayIntraLimit",
      label: "Own State Limit",
      type: "number",
      min: 0,
      step: "0.01",
      validation: {
        minMessage: "Own State Limit must be 0 or greater.",
      },
    },
    {
      name: "__subheading_dc",
      label: "Delivery Challan Purposes",
      type: "subheading",
    },
    {
      name: "compDcPurposes",
      label: "Allowed Purposes",
      type: "checkbox-group",
      options: DC_PURPOSE_OPTIONS,
      colSpan: 2,
      validation: {
        custom: (value) => (value.trim() ? null : DC_PURPOSES_REQUIRED_MESSAGE),
      },
    },
    // == Preferences (tab) ===================================================
    {
      name: "__heading_preferences",
      label: "Preferences",
      type: "heading",
    },
    {
      name: "compStylesheetId",
      label: "Stylesheet",
      type: "select",
      searchable: true,
      serverSearch: true,
      required: true,
      options: appThemeOptions,
      onSearchOpenChange: appThemeHandlers.onSearchOpenChange,
      onSearchQueryChange: appThemeHandlers.onSearchQueryChange,
      onValueChange: appThemeHandlers.onValueChange,
      validation: {
        requiredMessage: "Stylesheet is required.",
      },
    },
    {
      name: "compBankId",
      label: "Bank",
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
      name: "compPrefixCode",
      label: "Prefix Code",
      validation: {
        maxLength: 20,
        maxLengthMessage: "Prefix Code must be at most 20 characters.",
      },
    },
    {
      name: "compCurrencyCode",
      label: "Currency Code",
      placeholder: "INR",
      validation: {
        maxLength: 3,
        maxLengthMessage: "Currency Code must be at most 3 characters.",
      },
    },
    {
      name: "compCurrencySymbol",
      label: "Currency Symbol",
      validation: {
        maxLength: 10,
        maxLengthMessage: "Currency Symbol must be at most 10 characters.",
      },
    },
    {
      name: "__subheading_books",
      label: "Books",
      type: "subheading",
    },
    // On create these seed the company's first fiscal year (notes 72 A1); the
    // server ignores them on update and GET returns the current year's dates,
    // so they are read-only in edit mode. A year's dates change on its own
    // screen, not by editing the company.
    {
      name: "compFinYearFrom",
      label: "Financial Year From",
      type: "date",
      disabledWhen: whenEditing,
      validation: {
        custom: fiscalYearFieldValidator("from"),
      },
    },
    {
      name: "compFinYearTo",
      label: "Financial Year To",
      type: "date",
      disabledWhen: whenEditing,
      validation: {
        custom: fiscalYearFieldValidator("to"),
      },
    },
    {
      name: "compBooksBeginFrom",
      label: "Books Begin From",
      type: "date",
      disabledWhen: whenEditing,
      validation: {
        custom: fiscalYearFieldValidator("books"),
      },
    },
    {
      name: "compBillGreeting",
      label: "Bill Greeting",
      type: "textarea",
      rows: 3,
      colSpan: 2,
    },
    {
      name: "compRemarks",
      label: "Remarks",
      type: "textarea",
      rows: 3,
      colSpan: 2,
    },
    // Notes 72 C5: a PNG / JPEG / GIF / WebP of at most 512 KB, stored and
    // returned as a data URL — an image, not a line of text.
    {
      name: "compAuthorizeSignature",
      label: "Authorized Signature",
      type: "file",
      accept: SIGNATURE_MIME_TYPES.join(","),
      maxFileSizeBytes: SIGNATURE_MAX_BYTES,
      allowedMimeTypes: SIGNATURE_MIME_TYPES,
      previewImageValueKey: SIGNATURE_PREVIEW_FIELD,
      helperText: "Optional. PNG, JPEG, GIF or WebP up to 512 KB.",
      colSpan: 2,
    },
    {
      name: SIGNATURE_PREVIEW_FIELD,
      label: "",
      type: "text",
      visibleWhen: () => false,
    },
    // == Regional Details (tab) ==============================================
    {
      name: "__heading_regional",
      label: "Regional Details",
      type: "heading",
    },
    {
      name: "compRegionName",
      label: "Regional Name",
    },
    {
      name: "compRegionAddr1",
      label: "Regional Addr 1",
    },
    {
      name: "compRegionAddr2",
      label: "Regional Addr 2",
    },
    {
      name: "compRegionAddr3",
      label: "Regional Addr 3",
    },
    {
      name: "compRegionCity",
      label: "Regional City",
      validation: {
        maxLength: 100,
        maxLengthMessage: "Regional City must be at most 100 characters.",
      },
    },
    {
      name: "compRegionDistrict",
      label: "Regional District",
      validation: {
        maxLength: 100,
        maxLengthMessage: "Regional District must be at most 100 characters.",
      },
    },
    {
      name: "compRegionState",
      label: "Regional State",
    },
    {
      name: "compRegionCountry",
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
export function getCompanyFieldValue(
  source: Record<string, unknown>,
  fieldName: string,
): unknown {
  return getFirstDefinedValue(source, [fieldName, toSnakeCaseKey(fieldName)]);
}
export function mapCompanyFormValues(
  source: Record<string, unknown> | null,
  defaults: Record<string, string>,
  stateNameByCode: Record<string, string>,
): Record<string, string> {
  const rowSource = source ?? {};
  const mergedDefaults: Record<string, string> = {
    ...COMPANY_INITIAL_FORM_VALUES,
    ...defaults,
  };
  const values: Record<string, string> = { ...mergedDefaults };
  for (const fieldName of COMPANY_STANDARD_FIELD_NAMES) {
    const resolvedValue = toDisplayValue(getCompanyFieldValue(rowSource, fieldName));
    values[fieldName] = resolvedValue || mergedDefaults[fieldName] || "";
  }
  for (const fieldName of COMPANY_DATE_FIELD_NAMES) {
    const resolvedValue = toDateInputValue(getCompanyFieldValue(rowSource, fieldName));
    values[fieldName] = resolvedValue || mergedDefaults[fieldName] || "";
  }
  for (const fieldName of COMPANY_BOOLEAN_FIELD_NAMES) {
    const fallback = mergedDefaults[fieldName] === "false" ? "false" : "true";
    values[fieldName] = toSelectBoolean(
      getCompanyFieldValue(rowSource, fieldName),
      fallback,
    );
  }
  // GET returns the purposes as an array; the checkbox-group holds them comma-joined.
  values.compDcPurposes =
    toCsvFromArray(getCompanyFieldValue(rowSource, "compDcPurposes")) ||
    mergedDefaults.compDcPurposes ||
    "";
  // The stored signature comes back as a data URL: name it for the file field,
  // and hand the URL to its preview.
  const storedSignature = toDisplayValue(
    getCompanyFieldValue(rowSource, "compAuthorizeSignature"),
  );
  values.compAuthorizeSignature = resolveStoredPhotoName("", storedSignature.length > 0);
  values[SIGNATURE_PREVIEW_FIELD] = resolveStoredPhotoPreview(storedSignature, "");
  const existingStateCode = toDisplayValue(
    getCompanyFieldValue(rowSource, "compStateCode"),
  ).toUpperCase();
  if (!values.compState && existingStateCode) {
    values.compState = stateNameByCode[existingStateCode] ?? mergedDefaults.compState;
  }
  values.compStateCode = existingStateCode || mergedDefaults.compStateCode || "";
  return values;
}
/**
 * The save payload minus the signature image and the update id, which the
 * module adds (they need the file and the editing row).
 */
export function buildCompanyRequestPayload(
  values: Record<string, string>,
  shouldUpdate: boolean,
  stateCodeByName: Record<string, string>,
): Record<string, unknown> {
  const isEwayApplicable =
    (values.compEwayApplicable ?? "false") === "true";
  const isEinvoiceApplicable =
    (values.compEinvoiceApplicable ?? "false") === "true";
  const isEwayIntraApplicable =
    isEwayApplicable && (values.compEwayIntraApl ?? "false") === "true";
  const normalizedState = (values.compState ?? "").trim();
  const derivedStateCode =
    stateCodeByName[normalizedState] ??
    (values.compStateCode ?? "").trim().toUpperCase();
  const payload: Record<string, unknown> = {
    compName: (values.compName ?? "").trim(),
    compCode: toNullableString(values.compCode ?? ""),
    compShort: toNullableString(values.compShort ?? ""),
    compLegalName: toNullableString(values.compLegalName ?? ""),
    compGstinNo: toUpperNullable(values.compGstinNo ?? ""),
    compGstRegType: toUpperNullable(values.compGstRegType ?? ""),
    compPanNo: toUpperNullable(values.compPanNo ?? ""),
    compTanNo: toUpperNullable(values.compTanNo ?? ""),
    compCinNo: toUpperNullable(values.compCinNo ?? ""),
    compFssaiNo: toNullableString(values.compFssaiNo ?? ""),
    compDrugLicenseNo: toNullableString(values.compDrugLicenseNo ?? ""),
    compAatoClass: toUpper(values.compAatoClass ?? "") || DEFAULT_AATO_CLASS,
    compDcPurposes: toUniqueStringArrayFromCsv(values.compDcPurposes ?? "").map(toUpper),
    compAddr1: toNullableString(values.compAddr1 ?? ""),
    compAddr2: toNullableString(values.compAddr2 ?? ""),
    compAddr3: toNullableString(values.compAddr3 ?? ""),
    compCity: toNullableString(values.compCity ?? ""),
    compDistrict: toNullableString(values.compDistrict ?? ""),
    compState: toNullableString(values.compState ?? ""),
    compStateCode: toUpper(derivedStateCode),
    compPin: toNullableInteger(values.compPin ?? ""),
    compCountry: (values.compCountry ?? "").trim() || "India",
    compRegionAddr1: toNullableString(values.compRegionAddr1 ?? ""),
    compRegionAddr2: toNullableString(values.compRegionAddr2 ?? ""),
    compRegionAddr3: toNullableString(values.compRegionAddr3 ?? ""),
    compRegionCity: toNullableString(values.compRegionCity ?? ""),
    compRegionDistrict: toNullableString(values.compRegionDistrict ?? ""),
    compRegionState: toNullableString(values.compRegionState ?? ""),
    compRegionCountry: toNullableString(values.compRegionCountry ?? ""),
    compRegionName: toNullableString(values.compRegionName ?? ""),
    compTel: toNullableString(values.compTel ?? ""),
    compPhone: toNullableString(values.compPhone ?? ""),
    compMail: toNullableString(values.compMail ?? ""),
    compSupportEmail: toNullableString(values.compSupportEmail ?? ""),
    compSupportPhone: toNullableString(values.compSupportPhone ?? ""),
    compWebsiteName: toNullableString(values.compWebsiteName ?? ""),
    compGstApplicable: (values.compGstApplicable ?? "false") === "true",
    compTcsApplicable: (values.compTcsApplicable ?? "false") === "true",
    compTdsApplicable: (values.compTdsApplicable ?? "false") === "true",
    compSmsApplicable: (values.compSmsApplicable ?? "false") === "true",
    compEinvoiceApplicable: isEinvoiceApplicable,
    compEwayApplicable: isEwayApplicable,
    compEwayDate: isEwayApplicable
      ? toNullableDate(values.compEwayDate ?? "")
      : null,
    compEwayInterLimit: isEwayApplicable
      ? toNullableNumber(values.compEwayInterLimit ?? "")
      : null,
    compEwayIntraApl: isEwayIntraApplicable,
    compEwayIntraLimit: isEwayIntraApplicable
      ? toNonNegativeNumber(values.compEwayIntraLimit ?? "0", 0)
      : 0,
    compEinvoiceDate: isEinvoiceApplicable
      ? toNullableDate(values.compEinvoiceDate ?? "")
      : null,
    compEinvoiceInclEway: isEinvoiceApplicable
      ? (values.compEinvoiceInclEway ?? "false") === "true"
      : false,
    compStylesheetId: toNullableInteger(values.compStylesheetId ?? ""),
    compBankId: toNullableString(values.compBankId ?? ""),
    compPriceFixing: toNullableString(values.compPriceFixing ?? ""),
    compPrefixCode: toNullableString(values.compPrefixCode ?? ""),
    compBillGreeting: toNullableString(values.compBillGreeting ?? ""),
    compNegStkApl: (values.compNegStkApl ?? "false") === "true",
    compDefault: (values.compDefault ?? "false") === "true",
    compIsActive: (values.compIsActive ?? "false") === "true",
    compCurrencyCode: toUpper(values.compCurrencyCode ?? "") || "INR",
    compCurrencySymbol: toNullableString(values.compCurrencySymbol ?? ""),
    compLocaleCode: (values.compLocaleCode ?? "").trim() || "en-IN",
    compRemarks: toNullableString(values.compRemarks ?? ""),
  };
  if (!shouldUpdate) {
    // Create only: the first fiscal year (notes 72 A1). On update the
    // server ignores them, so they are not sent at all.
    payload.compFinYearFrom = toNullableDate(values.compFinYearFrom ?? "");
    payload.compFinYearTo = toNullableDate(values.compFinYearTo ?? "");
    payload.compBooksBeginFrom = toNullableDate(values.compBooksBeginFrom ?? "");
  }
  return payload;
}
