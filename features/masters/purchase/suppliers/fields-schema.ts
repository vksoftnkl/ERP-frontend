import type {
  ERPDynamicFieldValueChangeHandler,
  ERPDynamicModalField,
  ERPDynamicSearchQueryChangeHandler,
  ERPDynamicSearchShortcutPayload,
  ERPDynamicSelectOption,
} from "@/components/design-system/ui/dynamic-modal-form";

// Per-field handlers wiring a searchable select to its lazy server-side dropdown.
type SupplierLazyFieldHandlers = {
  onSearchOpenChange: (open: boolean) => void;
  onSearchQueryChange: ERPDynamicSearchQueryChangeHandler;
  onValueChange: ERPDynamicFieldValueChangeHandler;
};
export type SupplierLazyDropdownHandlers = Record<
  "supCompanyId" | "supBranchId" | "supGroupId" | "supStateName",
  SupplierLazyFieldHandlers
>;
import {
  COLLECTION_DAY_SHORT_OPTIONS,
  GST_LOOKUP_HELPER_TEXT,
  GST_TYPE_OPTIONS,
  PURCHASE_TYPE_OPTIONS,
} from "./constants";
import { validateSupplierGstin, validateSupplierPan } from "./form-builder";

// Build Supplier Form Fields
export function buildSupplierFormFields(
  supplierGroupOptions: ERPDynamicSelectOption[],
  companyOptions: ERPDynamicSelectOption[],
  branchOptions: ERPDynamicSelectOption[],
  stateOptions: ERPDynamicSelectOption[],
  lazy: SupplierLazyDropdownHandlers,
  onSupplierGroupCreateShortcut: (
    payload: ERPDynamicSearchShortcutPayload,
  ) => void | Promise<void>,
  onSupplierGroupEditShortcut: (
    payload: ERPDynamicSearchShortcutPayload,
  ) => void | Promise<void>,
  onStateCreateShortcut: (
    payload: ERPDynamicSearchShortcutPayload,
  ) => void | Promise<void>,
  onStateEditShortcut: (
    payload: ERPDynamicSearchShortcutPayload,
  ) => void | Promise<void>,
  onSupplierGstinValueChange: ERPDynamicFieldValueChangeHandler,
  // The bank-accounts grid, rendered under "Bank Details" on the Notes tab (the
  // legacy screen keeps it there rather than on a tab of its own).
  bankAccountsField: ERPDynamicModalField,
): ERPDynamicModalField[] {
  // Every tab is a 12-column grid holding two label/control pairs per row, as in
  // the legacy Supplier Entry screen: normal inputs span 6, full-width fields use
  // `colSpan: 2` (which the modal renders as `grid-column: 1 / -1`).
  const span = (columns: number) => ({
    fieldStyle: { gridColumn: `span ${columns}` },
  });
  return [
    // ── Identity tab ──────────────────────────────────────────────
    {
      name: "identitySection",
      label: "Identity",
      type: "heading",
      sectionGridColumns: 12,
    },
    {
      name: "supGstNo",
      label: "GST No",
      placeholder: "24ABCDE1234F1Z5",
      helperText: GST_LOOKUP_HELPER_TEXT,
      onValueChange: onSupplierGstinValueChange,
      ...span(6),
      validation: {
        custom: (value, values) => validateSupplierGstin(value, values),
      },
    },
    {
      name: "supName",
      label: "Supplier Name",
      required: true,
      ...span(6),
      validation: {
        minLength: 2,
        maxLength: 200,
        minLengthMessage: "Supplier Name must be at least 2 characters.",
        maxLengthMessage: "Supplier Name must be at most 200 characters.",
      },
    },
    {
      name: "supShort",
      label: "Short Name",
      ...span(6),
      validation: {
        maxLength: 50,
        maxLengthMessage: "Short Name must be at most 50 characters.",
      },
    },
    {
      name: "supGroupId",
      label: "Group",
      type: "select",
      searchable: true,
      serverSearch: true,
      required: true,
      options: supplierGroupOptions,
      onSearchOpenChange: lazy.supGroupId.onSearchOpenChange,
      onSearchQueryChange: lazy.supGroupId.onSearchQueryChange,
      onValueChange: lazy.supGroupId.onValueChange,
      onSearchCreateShortcut: onSupplierGroupCreateShortcut,
      onSearchEditShortcut: onSupplierGroupEditShortcut,
      ...span(6),
      validation: {
        requiredMessage: "Supplier Group is required.",
      },
    },
    {
      name: "supCompanyId",
      label: "Company",
      type: "select",
      searchable: true,
      serverSearch: true,
      options: companyOptions,
      onSearchOpenChange: lazy.supCompanyId.onSearchOpenChange,
      onSearchQueryChange: lazy.supCompanyId.onSearchQueryChange,
      onValueChange: lazy.supCompanyId.onValueChange,
      ...span(6),
    },
    {
      name: "supBranchId",
      label: "Branch",
      type: "select",
      searchable: true,
      serverSearch: true,
      options: branchOptions,
      onSearchOpenChange: lazy.supBranchId.onSearchOpenChange,
      onSearchQueryChange: lazy.supBranchId.onSearchQueryChange,
      onValueChange: lazy.supBranchId.onValueChange,
      ...span(6),
    },
    {
      name: "supGstType",
      label: "GST Type",
      type: "select",
      searchable: true,
      options: GST_TYPE_OPTIONS,
      required: true,
      ...span(6),
      validation: {
        requiredMessage: "GST Type is required.",
      },
    },
    {
      name: "supPurchaseType",
      label: "Purchase Type",
      type: "select",
      searchable: false,
      required: true,
      options: PURCHASE_TYPE_OPTIONS,
      ...span(6),
      validation: {
        requiredMessage: "Purchase Type is required.",
      },
    },
    {
      name: "supPanNo",
      label: "PAN No",
      ...span(6),
      validation: {
        custom: (value) => validateSupplierPan(value),
      },
    },
    {
      name: "supDrugLiscenceNo",
      label: "Drug Licence No",
      ...span(6),
      validation: {
        maxLength: 100,
        maxLengthMessage: "Drug Licence No must be at most 100 characters.",
      },
    },
    {
      name: "supIsActive",
      label: "Active",
      type: "checkbox",
      ...span(6),
    },
    // ── Address ───────────────────────────────────────────────────
    {
      name: "addressSubheading",
      label: "Address",
      type: "subheading",
    },
    {
      name: "supAddr1",
      label: "Address 1",
      ...span(6),
      validation: {
        maxLength: 250,
        maxLengthMessage: "Address 1 must be at most 250 characters.",
      },
    },
    {
      name: "supAddr2",
      label: "Address 2",
      ...span(6),
      validation: {
        maxLength: 250,
        maxLengthMessage: "Address 2 must be at most 250 characters.",
      },
    },
    {
      name: "supAddr3",
      label: "Address 3",
      ...span(6),
      validation: {
        maxLength: 250,
        maxLengthMessage: "Address 3 must be at most 250 characters.",
      },
    },
    {
      name: "supCity",
      label: "City",
      ...span(6),
      validation: {
        maxLength: 250,
        maxLengthMessage: "City must be at most 250 characters.",
      },
    },
    {
      name: "supDistrict",
      label: "District",
      ...span(6),
      validation: {
        maxLength: 250,
        maxLengthMessage: "District must be at most 250 characters.",
      },
    },
    {
      name: "supStateName",
      label: "State",
      type: "select",
      searchable: true,
      serverSearch: true,
      required: true,
      options: stateOptions,
      onSearchOpenChange: lazy.supStateName.onSearchOpenChange,
      onSearchQueryChange: lazy.supStateName.onSearchQueryChange,
      // Pins the selection and mirrors the name into supRegionStateName.
      onValueChange: lazy.supStateName.onValueChange,
      onSearchCreateShortcut: onStateCreateShortcut,
      onSearchEditShortcut: onStateEditShortcut,
      ...span(6),
      validation: {
        requiredMessage: "State is required.",
      },
    },
    {
      name: "supPincode",
      label: "Pincode",
      ...span(6),
      validation: {
        maxLength: 10,
        maxLengthMessage: "Pincode must be at most 10 characters.",
      },
    },
    {
      name: "supCountry",
      label: "Country",
      ...span(6),
      validation: {
        maxLength: 60,
        maxLengthMessage: "Country must be at most 60 characters.",
      },
    },
    // ── Contact ───────────────────────────────────────────────────
    {
      name: "contactSubheading",
      label: "Contact",
      type: "subheading",
    },
    {
      name: "supTel",
      label: "Telephone",
      type: "tel",
      ...span(6),
      validation: {
        maxLength: 20,
        maxLengthMessage: "Telephone must be at most 20 characters.",
      },
    },
    {
      name: "supPhone",
      label: "Phone",
      type: "tel",
      ...span(6),
      validation: {
        maxLength: 20,
        maxLengthMessage: "Phone must be at most 20 characters.",
      },
    },
    {
      name: "supMailId",
      label: "Email",
      type: "email",
      ...span(6),
      validation: {
        maxLength: 120,
        maxLengthMessage: "Email must be at most 120 characters.",
      },
    },
    {
      name: "supWhatsappNo",
      label: "WhatsApp",
      type: "tel",
      ...span(6),
      validation: {
        maxLength: 20,
        maxLengthMessage: "WhatsApp must be at most 20 characters.",
      },
    },
    {
      name: "supWebsiteAddress",
      label: "Website",
      type: "url",
      ...span(6),
      validation: {
        maxLength: 200,
        maxLengthMessage: "Website must be at most 200 characters.",
      },
    },
    // ── Notes tab ─────────────────────────────────────────────────
    {
      name: "notesSection",
      label: "Notes",
      type: "heading",
      sectionGridColumns: 12,
    },
    {
      name: "termsSubheading",
      label: "Terms",
      type: "subheading",
    },
    {
      name: "supChequePreName",
      label: "Cheque Pre-Name",
      ...span(6),
      validation: {
        maxLength: 200,
        maxLengthMessage: "Cheque Pre-Name must be at most 200 characters.",
      },
    },
    {
      name: "supCreditDays",
      label: "Credit Days",
      type: "number",
      min: 0,
      step: 1,
      ...span(6),
      validation: {
        minMessage: "Credit Days must be 0 or greater.",
      },
    },
    {
      name: "supCashDiscPerc",
      label: "Cash Disc %",
      type: "number",
      min: 0,
      step: 0.001,
      ...span(6),
      validation: {
        minMessage: "Cash Disc % must be 0 or greater.",
      },
    },
    {
      name: "supSortOrder",
      label: "Sort Order",
      type: "number",
      step: 1,
      min: 0,
      ...span(6),
      validation: {
        minMessage: "Sort Order must be 0 or greater.",
      },
    },
    // ── Bank Details ──────────────────────────────────────────────
    {
      name: "bankDetailsSubheading",
      label: "Bank Details",
      type: "subheading",
    },
    bankAccountsField,
    // ── Collection Days ───────────────────────────────────────────
    {
      name: "collectionDaysSubheading",
      label: "Collection Days",
      type: "subheading",
    },
    {
      // Mirrors the legacy Supplier Entry screen: one checkbox per weekday on
      // its own full-width row rather than a dropdown.
      name: "supCollectionDays",
      label: "Collection Days",
      type: "checkbox-group",
      colSpan: 2,
      options: COLLECTION_DAY_SHORT_OPTIONS,
    },
    {
      name: "supNotes",
      label: "Notes",
      type: "textarea",
      rows: 3,
      colSpan: 2,
      validation: {
        maxLength: 250,
        maxLengthMessage: "Notes must be at most 250 characters.",
      },
    },
    // ── Regional Details tab ──────────────────────────────────────
    {
      name: "regionalSection",
      label: "Regional Details",
      type: "heading",
      sectionGridColumns: 12,
    },
    {
      name: "supRegionName",
      label: "Regional Name",
      colSpan: 2,
      validation: {
        maxLength: 200,
        maxLengthMessage: "Regional Name must be at most 200 characters.",
      },
    },
    {
      name: "supRegionAddr1",
      label: "Address 1",
      ...span(6),
      validation: {
        maxLength: 250,
        maxLengthMessage: "Address 1 must be at most 250 characters.",
      },
    },
    {
      name: "supRegionAddr2",
      label: "Address 2",
      ...span(6),
      validation: {
        maxLength: 250,
        maxLengthMessage: "Address 2 must be at most 250 characters.",
      },
    },
    {
      name: "supRegionAddr3",
      label: "Address 3",
      ...span(6),
      validation: {
        maxLength: 250,
        maxLengthMessage: "Address 3 must be at most 250 characters.",
      },
    },
    {
      name: "supRegionCity",
      label: "City",
      ...span(6),
      validation: {
        maxLength: 250,
        maxLengthMessage: "City must be at most 250 characters.",
      },
    },
    {
      name: "supRegionDistrict",
      label: "District",
      ...span(6),
      validation: {
        maxLength: 250,
        maxLengthMessage: "District must be at most 250 characters.",
      },
    },
    {
      // Mirrored from the Identity tab's State whenever that changes, but still
      // editable here (the legacy screen keeps it a plain text field too).
      name: "supRegionStateName",
      label: "State",
      ...span(6),
      validation: {
        maxLength: 100,
        maxLengthMessage: "State must be at most 100 characters.",
      },
    },
    {
      name: "supRegionCountry",
      label: "Country",
      ...span(6),
      validation: {
        maxLength: 60,
        maxLengthMessage: "Country must be at most 60 characters.",
      },
    },
  ];
}

// Build State Modal Fields
export function buildStateModalFields(
  disableStateCode: boolean,
): ERPDynamicModalField[] {
  return [
    {
      name: "stateCode",
      label: "State Code",
      required: true,
      disabled: disableStateCode,
      helperText: "Two-character state code.",
      validation: {
        pattern: "^[A-Za-z]{2}$",
        patternMessage: "State Code must be exactly 2 letters.",
      },
    },
    {
      name: "stateName",
      label: "State Name",
      required: true,
      validation: {
        minLength: 2,
        minLengthMessage: "State Name must be at least 2 characters.",
      },
    },
    {
      name: "stateUt",
      label: "State / UT",
      type: "checkbox",
    },
    {
      name: "tinCode",
      label: "TIN Code",
      validation: {
        pattern: "^[A-Za-z0-9]{0,2}$",
        patternMessage: "TIN Code can be up to 2 letters/numbers.",
      },
    },
    {
      name: "isActive",
      label: "Is Active",
      type: "checkbox",
    },
  ];
}

// Build Supplier Group Modal Fields
export function buildSupplierGroupModalFields(): ERPDynamicModalField[] {
  return [
    {
      name: "spgName",
      label: "Group Name",
      colSpan: 2,
      required: true,
      validation: {
        minLength: 2,
        minLengthMessage: "Group Name must be at least 2 characters.",
      },
    },
    {
      name: "spgShort",
      label: "Short Name",
      colSpan: 2,
    },
    {
      name: "spgDesc",
      label: "Description",
      colSpan: 2,
    },
    {
      name: "spgIsActive",
      label: "Is Active",
      type: "checkbox",
    },
  ];
}
