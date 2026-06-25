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
  COLLECTION_DAY_OPTIONS,
  GST_LOOKUP_HELPER_TEXT,
  GST_TYPE_OPTIONS,
  PURCHASE_TYPE_OPTIONS,
  STATE_MODAL_INITIAL_VALUES,
  SUPPLIER_GROUP_MODAL_INITIAL_VALUES,
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
): ERPDynamicModalField[] {
  return [
    {
      name: "scopeHeading",
      label: "Primary Details",
      type: "heading",
      gridColumnStart: 1,
      gridRowStart: 1,
    },
    {
      name: "supGstNo",
      label: "GST No",
      gridColumnStart: 1,
      gridRowStart: 2,
      placeholder: "24ABCDE1234F1Z5",
      helperText: GST_LOOKUP_HELPER_TEXT,
      onValueChange: onSupplierGstinValueChange,
      validation: {
        custom: (value, values) => validateSupplierGstin(value, values),
      },
    },
    {
      name: "supGstType",
      label: "GST Type",
      type: "select",
      gridColumnStart: 1,
      gridRowStart: 3,
      searchable: true,
      options: GST_TYPE_OPTIONS,
      required: true,
      validation: {
        requiredMessage: "GST Type is required.",
      },
    },
    {
      name: "supName",
      label: "Supplier Name",
      gridColumnStart: 2,
      gridRowStart: 2,
      required: true,
      validation: {
        minLength: 2,
        maxLength: 200,
        minLengthMessage: "Supplier Name must be at least 2 characters.",
        maxLengthMessage: "Supplier Name must be at most 200 characters.",
      },
    },
    {
      name: "supGroupId",
      label: "Supplier Group",
      type: "select",
      gridColumnStart: 2,
      gridRowStart: 3,
      searchable: true,
      serverSearch: true,
      required: true,
      options: supplierGroupOptions,
      onSearchOpenChange: lazy.supGroupId.onSearchOpenChange,
      onSearchQueryChange: lazy.supGroupId.onSearchQueryChange,
      onValueChange: lazy.supGroupId.onValueChange,
      onSearchCreateShortcut: onSupplierGroupCreateShortcut,
      onSearchEditShortcut: onSupplierGroupEditShortcut,
      validation: {
        requiredMessage: "Supplier Group is required.",
      },
    },
    {
      name: "supCompanyId",
      label: "Company",
      type: "select",
      gridColumnStart: 3,
      gridRowStart: 2,
      searchable: true,
      serverSearch: true,
      options: companyOptions,
      onSearchOpenChange: lazy.supCompanyId.onSearchOpenChange,
      onSearchQueryChange: lazy.supCompanyId.onSearchQueryChange,
      onValueChange: lazy.supCompanyId.onValueChange,
    },
    {
      name: "supShort",
      label: "Short Name",
      gridColumnStart: 2,
      gridRowStart: 5,
      validation: {
        maxLength: 50,
        maxLengthMessage: "Short Name must be at most 50 characters.",
      },
    },
    {
      name: "supPurchaseType",
      label: "Purchase Type",
      type: "select",
      gridColumnStart: 2,
      gridRowStart: 4,
      searchable: false,
      required: true,
      options: PURCHASE_TYPE_OPTIONS,
      validation: {
        requiredMessage: "Purchase Type is required.",
      },
    },
    {
      name: "supBranchId",
      label: "Branch",
      type: "select",
      gridColumnStart: 3,
      gridRowStart: 3,
      searchable: true,
      serverSearch: true,
      options: branchOptions,
      onSearchOpenChange: lazy.supBranchId.onSearchOpenChange,
      onSearchQueryChange: lazy.supBranchId.onSearchQueryChange,
      onValueChange: lazy.supBranchId.onValueChange,
    },
    {
      name: "supPanNo",
      label: "PAN No",
      gridColumnStart: 1,
      gridRowStart: 4,
      validation: {
        custom: (value) => validateSupplierPan(value),
      },
    },
    {
      name: "supDrugLiscenceNo",
      label: "Drug Licence No",
      gridColumnStart: 1,
      gridRowStart: 5,
      validation: {
        maxLength: 100,
        maxLengthMessage: "Drug Licence No must be at most 100 characters.",
      },
    },
    {
      name: "contactHeading",
      label: "Address & Contact Details",
      type: "heading",
      gridColumnStart: 1,
      gridRowStart: 6,
    },
    {
      name: "supAddr1",
      label: "Address Line 1",
      gridColumnStart: 1,
      gridRowStart: 7,
      validation: {
        maxLength: 250,
        maxLengthMessage: "Address Line 1 must be at most 250 characters.",
      },
    },
    {
      name: "supDistrict",
      label: "District",
      gridColumnStart: 2,
      gridRowStart: 7,
      validation: {
        maxLength: 250,
        maxLengthMessage: "District must be at most 250 characters.",
      },
    },
    {
      name: "supPhone",
      label: "Phone",
      type: "tel",
      gridColumnStart: 3,
      gridRowStart: 7,
      validation: {
        maxLength: 20,
        maxLengthMessage: "Phone must be at most 20 characters.",
      },
    },
    {
      name: "supAddr2",
      label: "Address Line 2",
      gridColumnStart: 1,
      gridRowStart: 8,
      validation: {
        maxLength: 250,
        maxLengthMessage: "Address Line 2 must be at most 250 characters.",
      },
    },
    {
      name: "supStateName",
      label: "State",
      type: "select",
      gridColumnStart: 2,
      gridRowStart: 8,
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
      validation: {
        requiredMessage: "State is required.",
      },
    },
    {
      name: "supWhatsappNo",
      label: "WhatsApp No",
      type: "tel",
      gridColumnStart: 3,
      gridRowStart: 8,
      validation: {
        maxLength: 20,
        maxLengthMessage: "WhatsApp No must be at most 20 characters.",
      },
    },
    {
      name: "supAddr3",
      label: "Address Line 3",
      gridColumnStart: 1,
      gridRowStart: 9,
      validation: {
        maxLength: 250,
        maxLengthMessage: "Address Line 3 must be at most 250 characters.",
      },
    },
    {
      name: "supPincode",
      label: "PIN No",
      gridColumnStart: 2,
      gridRowStart: 9,
      validation: {
        maxLength: 10,
        maxLengthMessage: "PIN No must be at most 10 characters.",
      },
    },
    {
      name: "supTel",
      label: "Telephone",
      type: "tel",
      gridColumnStart: 3,
      gridRowStart: 9,
      validation: {
        maxLength: 20,
        maxLengthMessage: "Telephone must be at most 20 characters.",
      },
    },
    {
      name: "supCity",
      label: "City",
      gridColumnStart: 1,
      gridRowStart: 10,
      validation: {
        maxLength: 250,
        maxLengthMessage: "City must be at most 250 characters.",
      },
    },
    {
      name: "supWebsiteAddress",
      label: "Website",
      type: "url",
      gridColumnStart: 2,
      gridRowStart: 10,
      validation: {
        maxLength: 200,
        maxLengthMessage: "Website must be at most 200 characters.",
      },
    },
    {
      name: "supMailId",
      label: "Email",
      type: "email",
      gridColumnStart: 3,
      gridRowStart: 10,
      validation: {
        maxLength: 120,
        maxLengthMessage: "Email must be at most 120 characters.",
      },
    },
    {
      name: "creditHeading",
      label: "Credit Details",
      type: "heading",
      gridColumnStart: 1,
      gridRowStart: 11,
    },
    {
      name: "supCreditDays",
      label: "Credit Days",
      type: "number",
      gridColumnStart: 1,
      gridRowStart: 12,
      min: 0,
      step: 1,
      validation: {
        minMessage: "Credit Days must be 0 or greater.",
      },
    },
    {
      name: "supCashDiscPerc",
      label: "Cash Discount %",
      type: "number",
      gridColumnStart: 2,
      gridRowStart: 12,
      min: 0,
      step: 0.001,
      validation: {
        minMessage: "Cash Discount % must be 0 or greater.",
      },
    },
    {
      name: "supCollectionDays",
      label: "Collection Days",
      placeholder: "Select Days",
      type: "select",
      gridColumnStart: 3,
      gridRowStart: 12,
      searchable: true,
      multiple: true,
      options: COLLECTION_DAY_OPTIONS,
    },
    {
      name: "regionHeading",
      label: "Region Details",
      type: "heading",
      gridColumnStart: 1,
      gridRowStart: 13,
    },
    {
      name: "supRegionName",
      label: "Region Name",
      gridColumnStart: 1,
      gridRowStart: 14,
      validation: {
        maxLength: 200,
        maxLengthMessage: "Region Name must be at most 200 characters.",
      },
    },
    {
      name: "supRegionAddr3",
      label: "Region Address 3",
      gridColumnStart: 2,
      gridRowStart: 14,
      validation: {
        maxLength: 250,
        maxLengthMessage: "Region Address 3 must be at most 250 characters.",
      },
    },
    {
      name: "supRegionCountry",
      label: "Region Country",
      disabled: true,
      gridColumnStart: 3,
      gridRowStart: 14,
      validation: {
        maxLength: 60,
        maxLengthMessage: "Region Country must be at most 60 characters.",
      },
    },
    {
      name: "supRegionAddr1",
      label: "Region Address 1",
      gridColumnStart: 1,
      gridRowStart: 15,
      validation: {
        maxLength: 250,
        maxLengthMessage: "Region Address 1 must be at most 250 characters.",
      },
    },
    {
      name: "supRegionCity",
      label: "Region City",
      gridColumnStart: 2,
      gridRowStart: 15,
      validation: {
        maxLength: 250,
        maxLengthMessage: "Region City must be at most 250 characters.",
      },
    },
    {
      name: "supRegionAddr2",
      label: "Region Address 2",
      gridColumnStart: 1,
      gridRowStart: 16,
      validation: {
        maxLength: 250,
        maxLengthMessage: "Region Address 2 must be at most 250 characters.",
      },
    },
    {
      name: "statusHeading",
      label: "Status & Notes",
      type: "heading",
      gridColumnStart: 1,
      gridRowStart: 17,
    },
    {
      name: "supChequePreName",
      label: "Cheque  Name",
      gridColumnStart: 1,
      gridRowStart: 18,
      validation: {
        maxLength: 200,
        maxLengthMessage: "Cheque Prefix Name must be at most 200 characters.",
      },
    },
    {
      name: "supSortOrder",
      label: "Sort Order",
      type: "number",
      gridColumnStart: 2,
      gridRowStart: 18,
      step: 1,
      min: 0,
      validation: {
        minMessage: "Sort Order must be 0 or greater.",
      },
    },
    {
      name: "supIsActive",
      label: "Status",
      type: "checkbox",
      gridColumnStart: 3,
      gridRowStart: 18,
      options: [
        { label: "Active", value: "true" },
        { label: "Inactive", value: "false" },
      ],
    },
    {
      name: "supNotes",
      label: "Notes",
      gridColumnStart: 1,
      gridRowStart: 19,
      colSpan: 2,
      validation: {
        maxLength: 250,
        maxLengthMessage: "Notes must be at most 250 characters.",
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
