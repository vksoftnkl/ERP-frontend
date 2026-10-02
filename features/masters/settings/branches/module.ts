"use client";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ERPDynamicFieldValueChangeHandler,
  ERPDynamicModalField,
  ERPDynamicSelectOption,
} from "@/components/design-system/ui/dynamic-modal-form";
import { useApi } from "@/hooks/useApi";
import {
  useLazyConfiguredDropdown,
  type LazyDropdownHandlers,
} from "@/features/masters/shared/use-lazy-configured-dropdown";
import styles from "@/app/master/state-master/page.module.scss";
import {
  defineMasterModule,
  extractRows,
  getFirstDefinedValue,
  toDateInputValue,
  toDisplayValue,
  toNullableDate,
  toNullableInteger,
  toNullableNumber,
  toNullableString,
  toSelectBoolean,
  toUpdateId,
  toUpper,
  toUpperNullable,
} from "@/features/masters/shared";
import {
  GST_REG_TYPE_OPTIONS,
  buildGstinFieldValidators,
  gstinFieldNames,
  normalizeGstin,
  type GstinFieldValidators,
} from "@/features/masters/shared/gst-registration";
import {
  GSTIN_LOOKUP_ENDPOINT,
  GSTIN_LOOKUP_INPUT_PATTERN,
  fetchGstinDetails,
  gstinLookupToValues,
  prefixedGstinLookupFieldMap,
} from "@/features/masters/shared/gstin-lookup";
import {
  EDIT_MODE_FIELD,
  whenCreating,
  whenEditing,
  withEditMode,
} from "@/features/masters/shared/edit-mode-field";
import { useDataRefresh } from "@/lib/data-freshness";
import type { ConfiguredGridKey } from "@/lib/configured-grids";
import type { ConfiguredDropdownKey } from "@/lib/configured-dropdowns";

/**
 * Branch master — the React twin of the Qt `branch_entry.cpp` form (notes 72):
 * three tabs (Identity · Billing & Preferences · Regional Details) in two
 * columns, the same required set (Name, Type, Company, GST Reg Type, City,
 * District, State, Pin), and the company's GSTIN rules under the `br` prefix.
 * A saved branch keeps its company (its documents carry it), and its default
 * godown is picked from its OWN godowns, so only after it exists.
 */

/**
 * The Grid Master row this list reads — "MAIN LIST - BRANCHES". `CrudMasterPage`
 * resolves it to a grid id at runtime (see lib/configured-grids), and uses it
 * for both the rows and the configured columns.
 */
export const BRANCH_LIST_GRID_KEY = "branchList" satisfies ConfiguredGridKey;
const API_ENDPOINTS = {
  getById: "/branch-masters/get",
  create: "/branch-masters/create",
  delete: "/branch-masters/delete",
} as const;
const GRID_TABLE_NAME = "branch_master";
const STATE_LOOKUP_ENDPOINT = "/master-lookups/name-id/all-masters";
const STATE_LOOKUP_QUERY = {
  module: "stateCodes",
} as const;
const LOOKUP_KEYS = {
  id: ["brId", "br_id", "id", "_id"],
  code: ["brCode", "br_code", "code"],
  name: ["brName", "br_name", "name"],
  short: ["brShort", "br_short", "short", "shortName"],
  alias: ["brAlias", "br_alias", "alias"],
  active: ["brIsActive", "br_is_active", "isActive", "is_active", "status"],
  position: ["position", "sort"],
  description: ["brTerms", "br_terms", "description", "remarks"],
  array: ["data", "items", "results", "rows", "list", "branches", "branch_masters"],
} as const;
/**
 * Delete / Restore for the list (notes 72 B1, B3): a soft-deleted branch comes
 * back through `/restore` (409 while its company is deleted).
 */
export const BRANCH_SOFT_DELETE = {
  deleteEndpoint: API_ENDPOINTS.delete,
  restoreEndpoint: "/branch-masters/restore",
  idParam: "brId",
  idKeys: LOOKUP_KEYS.id,
  entityTitle: "Branch",
} as const;
const REQUEST_PAYLOAD_KEYS = {
  id: "brId",
  name: "brName",
  alias: "brAlias",
  short: "brShort",
  description: "brTerms",
  sort: "position",
} as const;
const DEFAULT_COMPANY_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Company",
};
const DEFAULT_BANK_LEDGER_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Bank",
};
const DEFAULT_GODOWN_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Godown",
};
// Company is a lazy, server-side searchable configured dropdown (dropdown 22,
// COMPANYS -> comp_id/comp_name), loaded on open + on debounced search.
const COMPANY_DROPDOWN_CONFIG = {
  dropdownKey: "company" satisfies ConfiguredDropdownKey,
  idKeys: ["comp_id", "compId"] as const,
  labelKeys: ["comp_name", "compName"] as const,
  defaultOption: DEFAULT_COMPANY_OPTION,
} as const;
// Source keys to seed the saved company on edit/view (getById returns brCompId + brCompName).
const COMPANY_SOURCE_ID_KEYS = ["brCompId", "br_comp_id", "compId", "comp_id"] as const;
const COMPANY_SOURCE_NAME_KEYS = ["brCompName", "br_comp_name", "compName", "comp_name", "companyName", "company_name"] as const;
// State is a lazy configured dropdown (dropdown 21 -> state_code/state_name); the
// field value is the state NAME. The full code<->name maps below still load eagerly
// because submit derives brStateCode from the picked name and the GSTIN rules
// compare its code.
const STATE_DROPDOWN_CONFIG = {
  dropdownKey: "gstStateCode" satisfies ConfiguredDropdownKey,
  idKeys: ["state_name", "stateName"] as const,
  labelKeys: ["state_name", "stateName"] as const,
  defaultOption: { value: "", label: "Select State" } as ERPDynamicSelectOption,
} as const;
// Default Bank: dropdown 25, the bank-group ledgers only (not every ledger).
const BANK_LEDGER_DROPDOWN_CONFIG = {
  dropdownKey: "bankLedger" satisfies ConfiguredDropdownKey,
  idKeys: ["led_id", "ledId"] as const,
  labelKeys: ["led_name", "ledName"] as const,
  defaultOption: DEFAULT_BANK_LEDGER_OPTION,
} as const;
// Default Godown: dropdown 26 (GODOWNS -> gdl_id/gdl_name). Its SQL narrows to
// one branch's godowns through the guarded `ibranch_id` token; the edit form
// sends the branch's own id there.
const GODOWN_DROPDOWN_CONFIG = {
  dropdownKey: "godown" satisfies ConfiguredDropdownKey,
  idKeys: ["gdl_id", "gdlId"] as const,
  labelKeys: ["gdl_name", "gdlName"] as const,
  defaultOption: DEFAULT_GODOWN_OPTION,
} as const;
const BRANCH_STATE_KEYS = ["brState", "br_state"] as const;
const BRANCH_ID_KEYS = ["brId", "br_id"] as const;
const BRANCH_TYPE_OPTIONS: ERPDynamicSelectOption[] = [
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
const ROUNDING_MODE_OPTIONS: ERPDynamicSelectOption[] = [
  "NORMAL",
  "ROUND UP",
  "ROUND DOWN",
  "NONE",
  "BANKERS",
].map((value) => ({ value, label: value }));
const FSSAI_LICENSE_TYPE_OPTIONS: ERPDynamicSelectOption[] = [
  "Registration",
  "State License",
  "Central License",
].map((value) => ({ value, label: value }));
const STATE_LOOKUP_ARRAY_KEYS = ["items", "data", "results", "rows", "list"] as const;
const STATE_LOOKUP_NAME_KEYS = ["stateName", "state_name", "name", "label"] as const;
const STATE_LOOKUP_CODE_KEYS = ["id", "value", "stateCode", "state_code", "code"] as const;
const GST_LOOKUP_HELPER_TEXT =
  "Type a 15-character GSTIN to load the registered address automatically.";
const GODOWN_HELPER_TEXT = "A new branch has no godowns yet; pick its default after it is saved.";
/** brGstinNo / brGstRegType / brPanNo — the three the GSTIN rules read. */
const BRANCH_GSTIN_FIELDS = gstinFieldNames("br");
/**
 * Where a GSTIN lookup lands. The branch has no legal-name field; its NAME is
 * handled apart (see the lookup handler): branches in one state share the
 * company's GSTIN, so the trade name only fills a blank Branch Name.
 */
const BRANCH_LOOKUP_FIELD_MAP = prefixedGstinLookupFieldMap("br", {
  name: undefined,
  legalName: undefined,
});
const BRANCH_MODAL_PANEL_STYLE: CSSProperties = {
  width: "min(calc(92vw/var(--erp-ui-scale)), 70rem)",
  // Fixed height, sized to the tallest tab (Identity) rather than to whichever
  // tab is open, so the panel does not resize between tabs. The vh term keeps
  // it inside short viewports, where the body scrolls instead.
  height: "min(calc(88vh/var(--erp-ui-scale)), 800px)",
  maxHeight: "calc(88vh/var(--erp-ui-scale))",
};
const PREFERENCE_CHECKBOX_FIELD_STYLE: CSSProperties = {
  marginBlock: "0.5rem",
};
const BRANCH_STANDARD_FIELD_NAMES = [
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
const BRANCH_DATE_FIELD_NAMES = ["brFssaiValidUpto"] as const;
const BRANCH_BOOLEAN_FIELD_NAMES = [
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
const BRANCH_INITIAL_FORM_VALUES = {
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
function buildStateCodeByName(payload: unknown): Record<string, string> {
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
function buildStateNameByCode(payload: unknown): Record<string, string> {
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
function buildBranchFormFields({
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
function toSnakeCaseKey(value: string): string {
  return value.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`);
}
function getBranchFieldValue(
  source: Record<string, unknown>,
  fieldName: string,
): unknown {
  return getFirstDefinedValue(source, [fieldName, toSnakeCaseKey(fieldName)]);
}
function mapBranchFormValues(
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
export function useBranchesModule() {
  const { getAll: getStateLookup } = useApi<unknown>(STATE_LOOKUP_ENDPOINT);
  // GET /gst/search (notes 72 C6). Its failures are shown on the GSTIN field,
  // not as a popup: a 503 "not configured" must not interrupt typing a branch.
  const { getAll: searchGstin } = useApi<unknown>(GSTIN_LOOKUP_ENDPOINT, {
    toast: { error: false },
  });
  // The branch the form is editing ("" on create): the godown dropdown lists
  // only its godowns, through dropdown 26's `ibranch_id` token.
  const [editingBranchId, setEditingBranchId] = useState("");
  const {
    options: companyOptions,
    handlers: companyHandlers,
    seedSelected: seedCompany,
  } = useLazyConfiguredDropdown(COMPANY_DROPDOWN_CONFIG);
  const {
    options: stateOptions,
    handlers: stateHandlers,
    seedSelected: seedState,
  } = useLazyConfiguredDropdown(STATE_DROPDOWN_CONFIG);
  const {
    options: bankOptions,
    handlers: bankHandlers,
    seedSelected: seedBank,
  } = useLazyConfiguredDropdown(BANK_LEDGER_DROPDOWN_CONFIG);
  const godownParams = useMemo(
    () => (editingBranchId ? { ibranch_id: editingBranchId } : undefined),
    [editingBranchId],
  );
  const {
    options: godownOptions,
    handlers: godownHandlers,
    seedSelected: seedGodown,
  } = useLazyConfiguredDropdown({ ...GODOWN_DROPDOWN_CONFIG, params: godownParams });
  // Full code<->name maps are loaded eagerly: the GSTIN lookup turns its state
  // code into the State field's name, the GSTIN/State rule reads the picked
  // state's code, and submit derives brStateCode from the picked name.
  const [stateCodeByName, setStateCodeByName] = useState<Record<string, string>>({});
  const [stateNameByCode, setStateNameByCode] = useState<Record<string, string>>({});
  // Per GSTIN: the form patch, and the registered name kept apart (see below).
  const gstLookupCacheRef = useRef<
    Record<string, { values: Record<string, string>; tradeName: string }>
  >({});
  // Lookup options come from master tables that other users and other screens
  // change, so they are re-read on every data-refresh signal, not just on mount.
  const loadStateOptions = useCallback(() => {
    let mounted = true;
    void (async () => {
      try {
        const payload = await getStateLookup(STATE_LOOKUP_QUERY);
        if (!mounted) {
          return;
        }
        setStateCodeByName(buildStateCodeByName(payload));
        setStateNameByCode(buildStateNameByCode(payload));
      } catch {
        if (!mounted) {
          return;
        }
        setStateCodeByName({});
        setStateNameByCode({});
      }
    })();
    return () => {
      mounted = false;
    };
  }, [getStateLookup]);
  useEffect(() => loadStateOptions(), [loadStateOptions]);
  useDataRefresh(() => {
    loadStateOptions();
  });
  // The company's GSTIN rules under the `br` prefix (notes 72 C7).
  const gstinValidators = useMemo(
    () =>
      buildGstinFieldValidators({
        fields: BRANCH_GSTIN_FIELDS,
        stateCodeOf: (values) => stateCodeByName[(values.brState ?? "").trim()] ?? "",
      }),
    [stateCodeByName],
  );
  const handleBranchGstinValueChange =
    useCallback<ERPDynamicFieldValueChangeHandler>(
      async ({ value, values }) => {
        const typingPatch = gstinValidators.valueChangePatch(value, values);
        const typingValues = Object.keys(typingPatch).length ? { values: typingPatch } : {};
        const normalizedGstin = normalizeGstin(value);
        if (!GSTIN_LOOKUP_INPUT_PATTERN.test(normalizedGstin)) {
          return {
            ...typingValues,
            errors: { brGstinNo: null },
          };
        }
        let cached = gstLookupCacheRef.current[normalizedGstin];
        if (!cached) {
          const result = await fetchGstinDetails(searchGstin, normalizedGstin);
          if (!result.ok) {
            return {
              ...typingValues,
              errors: { brGstinNo: result.message },
            };
          }
          cached = {
            values: gstinLookupToValues(result.payload, BRANCH_LOOKUP_FIELD_MAP, {
              stateNameByCode,
            }),
            tradeName: result.payload.tradeName || result.payload.legalName || "",
          };
          gstLookupCacheRef.current[normalizedGstin] = cached;
        }
        const lookupValues = { ...cached.values };
        const { tradeName } = cached;
        // Branches in one state share their company's GSTIN, so the registered
        // trade name is only a starting point: it fills a blank Branch Name and
        // never replaces one already typed.
        if (tradeName && !(values.brName ?? "").trim()) {
          lookupValues.brName = tradeName;
        }
        // Pin the auto-filled state so the lazy dropdown can display it.
        if (lookupValues.brState) {
          seedState(lookupValues.brState, lookupValues.brState);
        }
        return {
          values: { ...typingPatch, ...lookupValues },
          errors: { brGstinNo: null },
        };
      },
      [gstinValidators, searchGstin, stateNameByCode, seedState],
    );
  const branchFormFields = useMemo(
    () =>
      buildBranchFormFields({
        companyOptions,
        companyHandlers,
        stateOptions,
        stateHandlers,
        bankOptions,
        bankHandlers,
        godownOptions,
        godownHandlers,
        onBranchGstinValueChange: handleBranchGstinValueChange,
        gstinValidators,
      }),
    [
      companyOptions,
      companyHandlers,
      stateOptions,
      stateHandlers,
      bankOptions,
      bankHandlers,
      godownOptions,
      godownHandlers,
      handleBranchGstinValueChange,
      gstinValidators,
    ],
  );
  const createInitialValues = useMemo(
    () => withEditMode({ ...BRANCH_INITIAL_FORM_VALUES }, false),
    [],
  );
  return useMemo(
    () =>
      defineMasterModule({
        title: "Branch",
        iconName: "branch_master",
        auditHistory: { screenName: "Branch Master" },
        entityLabel: "branch",
        entityLabelPlural: "branches",
        apiEndpoints: API_ENDPOINTS,
        gridKey: BRANCH_LIST_GRID_KEY,
        gridTableName: GRID_TABLE_NAME,
        listResponseStyleArrayKey: "",
        lookupKeys: LOOKUP_KEYS,
        requestPayloadKeys: REQUEST_PAYLOAD_KEYS,
        styles,
        listTitle: "Branch List",
        listTitleOverride: "Branch List",
        listSubtitleOverride: "Manage branches and their configuration",
        createLabel: "Add Branch",
        codeColumnHeader: "Branch Code",
        nameColumnHeader: "Branch Name",
        nameFieldLabel: "Branch Name",
        nameFieldPlaceholder: "Main Branch",
        formTitle: "Branch Form",
        formDescription:
          "Create and update branches with address, billing, inventory, and compliance details.",
        customFields: branchFormFields,
        createInitialValues,
        modalPanelStyle: BRANCH_MODAL_PANEL_STYLE,
        createModalTitle: "Branch Entry",
        editModalTitle: "Edit Branch Entry",
        modalFormGridColumns: 2,
        modalFormDenseGrid: false,
        modalStackLabels: false,
        modalSectionNavigationMode: "tabs",
        modalHideFieldHelperText: true,
        modalHideFieldErrorText: true,
        modalFocusFirstInvalidFieldOnValidationError: true,
        // Field errors are hidden, and the GSTIN / financial-year / PAN rules
        // need their words: the first one is raised as a warning, as Qt does.
        modalShowValidationErrorPopup: true,
        modalEnableArrowKeyFieldNavigation: true,
        onModalOpenChange: (open, variantKey) => {
          // Clear the lazy dropdowns when the create modal opens so no stale
          // selection from a previously edited branch lingers (they reload on open).
          if (open && variantKey === "master-create") {
            setEditingBranchId("");
            seedCompany("", "");
            seedState("", "");
            seedBank("", "");
            seedGodown("", "");
          }
        },
        mapFormValues: ({ source, defaults }) => {
          const rowSource = source ?? {};
          setEditingBranchId(
            source ? toDisplayValue(getFirstDefinedValue(rowSource, BRANCH_ID_KEYS)) : "",
          );
          // Seed the lazy dropdowns so the triggers show the saved labels on
          // edit/view before each field is opened (and lazily loaded). GET
          // resolves the company, bank and godown names alongside their ids.
          const companyId = toDisplayValue(
            getFirstDefinedValue(rowSource, COMPANY_SOURCE_ID_KEYS),
          );
          seedCompany(
            companyId,
            toDisplayValue(getFirstDefinedValue(rowSource, COMPANY_SOURCE_NAME_KEYS)),
          );
          // State field value IS the name. Fall back to deriving it from the saved code.
          const stateName =
            toDisplayValue(getFirstDefinedValue(rowSource, BRANCH_STATE_KEYS)) ||
            stateNameByCode[
              toDisplayValue(getBranchFieldValue(rowSource, "brStateCode")).toUpperCase()
            ] ||
            "";
          seedState(stateName, stateName);
          const bankId = toDisplayValue(getBranchFieldValue(rowSource, "brBankId"));
          seedBank(
            bankId,
            toDisplayValue(getBranchFieldValue(rowSource, "brBankName")) || bankId,
          );
          const godownId = toDisplayValue(getBranchFieldValue(rowSource, "brDefaultGodownId"));
          seedGodown(
            godownId,
            toDisplayValue(getBranchFieldValue(rowSource, "brDefaultGodownName")) || godownId,
          );
          const mappedValues = mapBranchFormValues(source, defaults, stateNameByCode);
          // Keep the company field value aligned with the seeded dropdown regardless of
          // which key getById returns it under (brCompId/br_comp_id/compId/comp_id).
          mappedValues.brCompId = companyId || mappedValues.brCompId;
          return withEditMode(mappedValues, source !== null);
        },
        buildRequestPayload: ({ values, shouldUpdate, editingItemId }) => {
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
          if (shouldUpdate && editingItemId !== null) {
            payload.brId = toUpdateId(editingItemId);
          }
          return payload;
        },
      }),
    [
      branchFormFields,
      createInitialValues,
      stateCodeByName,
      stateNameByCode,
      seedCompany,
      seedState,
      seedBank,
      seedGodown,
    ],
  );
}
