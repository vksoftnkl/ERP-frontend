"use client";

import { useEffect, useMemo, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import { useApi } from "@/hooks/useApi";
import type {
  ERPDynamicModalField,
  ERPDynamicSelectOption,
} from "@/components/library/ui/dynamic-modal-form";
import styles from "../state-master/page.module.scss";
import {
  buildLookupOptions,
  getFirstDefinedValue,
  toDateInputValue,
  toDisplayValue,
  toNonNegativeInteger,
  toNonNegativeNumber,
  toNullableDate,
  toNullableString,
  toSelectBoolean,
  toUpdateId,
  toUpper,
  DEFAULT_LOOKUP_ARRAY_KEYS,
} from "../_shared/crud-utils";

const API_ENDPOINTS = {
  list: "/suppliers/list",
  getById: "/suppliers/get",
  create: "/suppliers/create",
  delete: "/suppliers/delete",
} as const;

const GRID_TABLE_NAME = "suppliers";

const SUPPLIER_GROUP_LOOKUP_ENDPOINT = "/supplier-groups/list";
const SUPPLIER_GROUP_LOOKUP_QUERY = {
  page: "1",
  limit: "20",
  spgIsActive: "true",
} as const;

const LOOKUP_KEYS = {
  id: ["supId", "sup_id", "supplier_id", "supplierId", "id", "_id"],
  code: ["supPurchaseType", "sup_purchase_type", "supGstNo", "sup_gst_no", "code"],
  name: ["supName", "sup_name", "supplier_name", "supplierName", "name"],
  short: ["supShort", "sup_short", "short_name", "shortName", "short"],
  alias: ["supPurchaseType", "sup_purchase_type", "supGroupName", "sup_group_name", "alias"],
  active: ["supIsActive", "sup_is_active", "isActive", "is_active", "status"],
  position: ["supSortOrder", "sup_sort_order", "position", "sort"],
  description: ["supNotes", "sup_notes", "notes", "description", "desc"],
  array: ["data", "items", "results", "rows", "list", "suppliers"],
} as const;

const REQUEST_PAYLOAD_KEYS = {
  id: "supId",
  name: "supName",
  alias: "supPurchaseType",
  short: "supShort",
  description: "supNotes",
  sort: "supSortOrder",
} as const;

const SUPPLIER_IS_ACTIVE_KEYS = [
  "supIsActive",
  "sup_is_active",
  "isActive",
  "is_active",
  "status",
] as const;

const DEFAULT_SUPPLIER_GROUP_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Supplier Group",
};

const SUPPLIER_INITIAL_FORM_VALUES = {
  supCompanyId: "",
  supBranchId: "",
  supGroupId: "",
  supPurchaseType: "",
  supName: "",
  supShort: "",
  supAddr1: "",
  supAddr2: "",
  supAddr3: "",
  supCity: "",
  supDistrict: "",
  supStateName: "",
  supCountry: "India",
  supPincode: "",
  supTel: "",
  supPhone: "",
  supMailId: "",
  supWhatsappNo: "",
  supWebsiteAddress: "",
  supChequePreName: "",
  supNotes: "",
  supCreditDays: "0",
  supCashDiscPerc: "0",
  supCollectionDays: "",
  supGstNo: "",
  supStateCode: "",
  supPanNo: "",
  supGstType: "",
  supSupCst: "",
  supDrugLiscenceNo: "",
  supRegionName: "",
  supRegionAddr1: "",
  supRegionAddr2: "",
  supRegionAddr3: "",
  supRegionCity: "",
  supRegionDistrict: "",
  supRegionStateName: "",
  supRegionCountry: "India",
  supBilledDate: "",
  supSortOrder: "0",
  supIsActive: "true",
  supStateId: "",
} as const;

function buildSupplierFormFields(
  supplierGroupOptions: ERPDynamicSelectOption[],
): ERPDynamicModalField[] {
  return [
    {
      name: "scopeHeading",
      label: "Scope / Core",
      type: "heading",
      helperText: "Required linkage and supplier identity fields.",
    },
    {
      name: "supGroupId",
      label: "Supplier Group",
      type: "select",
      searchable: true,
      required: true,
      options: supplierGroupOptions,
      validation: {
        requiredMessage: "Supplier Group is required.",
      },
    },
    {
      name: "supPurchaseType",
      label: "Purchase Type",
      required: true,
      validation: {
        maxLength: 20,
        maxLengthMessage: "Purchase Type must be at most 20 characters.",
      },
    },
    {
      name: "supName",
      label: "Supplier Name",
      required: true,
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
      validation: {
        maxLength: 50,
        maxLengthMessage: "Short Name must be at most 50 characters.",
      },
    },
    {
      name: "supCompanyId",
      label: "Company Id (UUID)",
      validation: {
        pattern: "^[0-9a-fA-F-]{36}$",
        patternMessage: "Company Id must be a valid UUID.",
      },
    },
    {
      name: "supBranchId",
      label: "Branch Id (UUID)",
      validation: {
        pattern: "^[0-9a-fA-F-]{36}$",
        patternMessage: "Branch Id must be a valid UUID.",
      },
    },
    {
      name: "contactHeading",
      label: "Address / Contact",
      type: "heading",
      helperText: "Primary address and communication details.",
    },
    {
      name: "supAddr1",
      label: "Address Line 1",
      type: "textarea",
      colSpan: 2,
      rows: 2,
      validation: {
        maxLength: 250,
        maxLengthMessage: "Address Line 1 must be at most 250 characters.",
      },
    },
    {
      name: "supAddr2",
      label: "Address Line 2",
      validation: {
        maxLength: 250,
        maxLengthMessage: "Address Line 2 must be at most 250 characters.",
      },
    },
    {
      name: "supAddr3",
      label: "Address Line 3",
      validation: {
        maxLength: 250,
        maxLengthMessage: "Address Line 3 must be at most 250 characters.",
      },
    },
    {
      name: "supCity",
      label: "City",
      validation: {
        maxLength: 250,
        maxLengthMessage: "City must be at most 250 characters.",
      },
    },
    {
      name: "supDistrict",
      label: "District",
      validation: {
        maxLength: 250,
        maxLengthMessage: "District must be at most 250 characters.",
      },
    },
    {
      name: "supStateName",
      label: "State Name",
      required: true,
      validation: {
        minLength: 2,
        maxLength: 100,
        minLengthMessage: "State Name must be at least 2 characters.",
        maxLengthMessage: "State Name must be at most 100 characters.",
      },
    },
    {
      name: "supStateCode",
      label: "State Code",
      required: true,
      validation: {
        pattern: "^[A-Za-z]{2}$",
        patternMessage: "State Code must be exactly 2 letters.",
      },
    },
    {
      name: "supCountry",
      label: "Country",
      validation: {
        maxLength: 60,
        maxLengthMessage: "Country must be at most 60 characters.",
      },
    },
    {
      name: "supPincode",
      label: "Pincode",
      validation: {
        maxLength: 10,
        maxLengthMessage: "Pincode must be at most 10 characters.",
      },
    },
    {
      name: "supTel",
      label: "Telephone",
      type: "tel",
      validation: {
        maxLength: 20,
        maxLengthMessage: "Telephone must be at most 20 characters.",
      },
    },
    {
      name: "supPhone",
      label: "Phone",
      type: "tel",
      validation: {
        maxLength: 20,
        maxLengthMessage: "Phone must be at most 20 characters.",
      },
    },
    {
      name: "supMailId",
      label: "Email",
      type: "email",
      validation: {
        maxLength: 120,
        maxLengthMessage: "Email must be at most 120 characters.",
      },
    },
    {
      name: "supWhatsappNo",
      label: "WhatsApp No",
      type: "tel",
      validation: {
        maxLength: 20,
        maxLengthMessage: "WhatsApp No must be at most 20 characters.",
      },
    },
    {
      name: "supWebsiteAddress",
      label: "Website",
      type: "url",
      validation: {
        maxLength: 200,
        maxLengthMessage: "Website must be at most 200 characters.",
      },
    },
    {
      name: "supChequePreName",
      label: "Cheque Prefix Name",
      validation: {
        maxLength: 200,
        maxLengthMessage: "Cheque Prefix Name must be at most 200 characters.",
      },
    },
    {
      name: "supNotes",
      label: "Notes",
      type: "textarea",
      colSpan: 2,
      validation: {
        maxLength: 250,
        maxLengthMessage: "Notes must be at most 250 characters.",
      },
    },
    {
      name: "creditTaxHeading",
      label: "Credit / Tax",
      type: "heading",
      helperText: "Credit rules, collection schedule, and tax compliance.",
    },
    {
      name: "supCreditDays",
      label: "Credit Days",
      type: "number",
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
      min: 0,
      step: 0.001,
      validation: {
        minMessage: "Cash Discount % must be 0 or greater.",
      },
    },
    {
      name: "supCollectionDays",
      label: "Collection Days",
      helperText: "Enter comma-separated day numbers (example: 1,3,7).",
      colSpan: 2,
    },
    {
      name: "supGstNo",
      label: "GST No",
      validation: {
        maxLength: 15,
        maxLengthMessage: "GST No must be at most 15 characters.",
      },
    },
    {
      name: "supPanNo",
      label: "PAN No",
      validation: {
        maxLength: 10,
        maxLengthMessage: "PAN No must be at most 10 characters.",
      },
    },
    {
      name: "supGstType",
      label: "GST Type",
      required: true,
      validation: {
        maxLength: 30,
        maxLengthMessage: "GST Type must be at most 30 characters.",
      },
    },
    {
      name: "supSupCst",
      label: "SUP CST",
      validation: {
        maxLength: 25,
        maxLengthMessage: "SUP CST must be at most 25 characters.",
      },
    },
    {
      name: "supDrugLiscenceNo",
      label: "Drug Licence No",
      validation: {
        maxLength: 100,
        maxLengthMessage: "Drug Licence No must be at most 100 characters.",
      },
    },
    {
      name: "supStateId",
      label: "State Id (UUID)",
      validation: {
        pattern: "^[0-9a-fA-F-]{36}$",
        patternMessage: "State Id must be a valid UUID.",
      },
    },
    {
      name: "regionalHeading",
      label: "Regional / Status",
      type: "heading",
      helperText: "Regional details, billing date, status and audit fields.",
    },
    {
      name: "supRegionName",
      label: "Region Name",
      validation: {
        maxLength: 200,
        maxLengthMessage: "Region Name must be at most 200 characters.",
      },
    },
    {
      name: "supRegionAddr1",
      label: "Region Address 1",
      type: "textarea",
      colSpan: 2,
      rows: 2,
      validation: {
        maxLength: 250,
        maxLengthMessage: "Region Address 1 must be at most 250 characters.",
      },
    },
    {
      name: "supRegionAddr2",
      label: "Region Address 2",
      validation: {
        maxLength: 250,
        maxLengthMessage: "Region Address 2 must be at most 250 characters.",
      },
    },
    {
      name: "supRegionAddr3",
      label: "Region Address 3",
      validation: {
        maxLength: 250,
        maxLengthMessage: "Region Address 3 must be at most 250 characters.",
      },
    },
    {
      name: "supRegionCity",
      label: "Region City",
      validation: {
        maxLength: 250,
        maxLengthMessage: "Region City must be at most 250 characters.",
      },
    },
    {
      name: "supRegionDistrict",
      label: "Region District",
      validation: {
        maxLength: 250,
        maxLengthMessage: "Region District must be at most 250 characters.",
      },
    },
    {
      name: "supRegionStateName",
      label: "Region State Name",
      validation: {
        maxLength: 100,
        maxLengthMessage: "Region State Name must be at most 100 characters.",
      },
    },
    {
      name: "supRegionCountry",
      label: "Region Country",
      validation: {
        maxLength: 60,
        maxLengthMessage: "Region Country must be at most 60 characters.",
      },
    },
    {
      name: "supBilledDate",
      label: "Billed Date",
      type: "date",
    },
    {
      name: "supSortOrder",
      label: "Sort Order",
      type: "number",
      step: 1,
    },
    {
      name: "supIsActive",
      label: "Status",
      type: "checkbox",
      options: [
        { label: "Active", value: "true" },
        { label: "Inactive", value: "false" },
      ],
    },
  ];
}

function parseCollectionDays(value: string): number[] {
  const normalized = value.trim();
  if (!normalized) {
    return [];
  }

  const parsedValues = normalized
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => Number.parseInt(entry, 10))
    .filter((entry) => Number.isInteger(entry) && entry >= 0);

  return Array.from(new Set(parsedValues));
}

function toCollectionDaysInput(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }

  const normalized = value
    .map((entry) => (typeof entry === "number" ? entry : Number(entry)))
    .filter((entry) => Number.isInteger(entry) && entry >= 0)
    .map((entry) => String(entry));

  return Array.from(new Set(normalized)).join(",");
}

function toNullableInteger(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

export default function SuppliersMasterPage() {
  const { getAll: getSupplierGroupLookup } = useApi<unknown>(SUPPLIER_GROUP_LOOKUP_ENDPOINT);
  const [supplierGroupOptions, setSupplierGroupOptions] = useState<ERPDynamicSelectOption[]>([
    DEFAULT_SUPPLIER_GROUP_OPTION,
  ]);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        const payload = await getSupplierGroupLookup(SUPPLIER_GROUP_LOOKUP_QUERY);
        if (!mounted) {
          return;
        }

        setSupplierGroupOptions(
          buildLookupOptions(payload, DEFAULT_SUPPLIER_GROUP_OPTION, {
            arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "supplierGroups", "supplier_groups"],
            idKeys: ["spgId", "spg_id", "id", "_id", "value"],
            labelKeys: ["spgName", "spg_name", "name", "label"],
          }),
        );
      } catch {
        if (mounted) {
          setSupplierGroupOptions([DEFAULT_SUPPLIER_GROUP_OPTION]);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [getSupplierGroupLookup]);

  const supplierFormFields = useMemo(
    () => buildSupplierFormFields(supplierGroupOptions),
    [supplierGroupOptions],
  );

  return (
    <CrudMasterPage
      title="Supplier"
      entityLabel="supplier"
      entityLabelPlural="suppliers"
      apiEndpoints={API_ENDPOINTS}
      gridTableName={GRID_TABLE_NAME}
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Supplier List"
      createLabel="Add Supplier"
      codeColumnHeader="Purchase Type"
      nameColumnHeader="Supplier Name"
      nameFieldLabel="Supplier Name"
      nameFieldPlaceholder="ABC Distributors"
      formTitle="Supplier Form"
      formDescription="Create and update suppliers."
      customFields={supplierFormFields}
      createInitialValues={SUPPLIER_INITIAL_FORM_VALUES}
      mapFormValues={({ source, defaults }) => {
        const rowSource = source ?? {};

        return {
          ...SUPPLIER_INITIAL_FORM_VALUES,
          supCompanyId: toDisplayValue(rowSource.supCompanyId),
          supBranchId: toDisplayValue(rowSource.supBranchId),
          supGroupId: toDisplayValue(rowSource.supGroupId),
          supPurchaseType:
            toDisplayValue(
              rowSource.supPurchaseType ?? getFirstDefinedValue(rowSource, LOOKUP_KEYS.code),
            ) ||
            defaults.searchCode ||
            SUPPLIER_INITIAL_FORM_VALUES.supPurchaseType,
          supName:
            toDisplayValue(rowSource.supName ?? getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) ||
            defaults.masterName ||
            SUPPLIER_INITIAL_FORM_VALUES.supName,
          supShort:
            toDisplayValue(rowSource.supShort ?? getFirstDefinedValue(rowSource, LOOKUP_KEYS.short)) ||
            defaults.masterShortName ||
            SUPPLIER_INITIAL_FORM_VALUES.supShort,
          supAddr1: toDisplayValue(rowSource.supAddr1),
          supAddr2: toDisplayValue(rowSource.supAddr2),
          supAddr3: toDisplayValue(rowSource.supAddr3),
          supCity: toDisplayValue(rowSource.supCity),
          supDistrict: toDisplayValue(rowSource.supDistrict),
          supStateName: toDisplayValue(rowSource.supStateName),
          supCountry: toDisplayValue(rowSource.supCountry) || SUPPLIER_INITIAL_FORM_VALUES.supCountry,
          supPincode: toDisplayValue(rowSource.supPincode),
          supTel: toDisplayValue(rowSource.supTel),
          supPhone: toDisplayValue(rowSource.supPhone),
          supMailId: toDisplayValue(rowSource.supMailId),
          supWhatsappNo: toDisplayValue(rowSource.supWhatsappNo),
          supWebsiteAddress: toDisplayValue(rowSource.supWebsiteAddress),
          supChequePreName: toDisplayValue(rowSource.supChequePreName),
          supNotes:
            toDisplayValue(
              rowSource.supNotes ?? getFirstDefinedValue(rowSource, LOOKUP_KEYS.description),
            ) ||
            defaults.masterDescription ||
            SUPPLIER_INITIAL_FORM_VALUES.supNotes,
          supCreditDays:
            toDisplayValue(rowSource.supCreditDays) || SUPPLIER_INITIAL_FORM_VALUES.supCreditDays,
          supCashDiscPerc:
            toDisplayValue(rowSource.supCashDiscPerc) || SUPPLIER_INITIAL_FORM_VALUES.supCashDiscPerc,
          supCollectionDays: toCollectionDaysInput(rowSource.supCollectionDays),
          supGstNo: toDisplayValue(rowSource.supGstNo),
          supStateCode: toDisplayValue(rowSource.supStateCode),
          supPanNo: toDisplayValue(rowSource.supPanNo),
          supGstType: toDisplayValue(rowSource.supGstType),
          supSupCst: toDisplayValue(rowSource.supSupCst),
          supDrugLiscenceNo: toDisplayValue(rowSource.supDrugLiscenceNo),
          supRegionName: toDisplayValue(rowSource.supRegionName),
          supRegionAddr1: toDisplayValue(rowSource.supRegionAddr1),
          supRegionAddr2: toDisplayValue(rowSource.supRegionAddr2),
          supRegionAddr3: toDisplayValue(rowSource.supRegionAddr3),
          supRegionCity: toDisplayValue(rowSource.supRegionCity),
          supRegionDistrict: toDisplayValue(rowSource.supRegionDistrict),
          supRegionStateName: toDisplayValue(rowSource.supRegionStateName),
          supRegionCountry:
            toDisplayValue(rowSource.supRegionCountry) || SUPPLIER_INITIAL_FORM_VALUES.supRegionCountry,
          supBilledDate: toDateInputValue(rowSource.supBilledDate),
          supSortOrder:
            toDisplayValue(rowSource.supSortOrder ?? getFirstDefinedValue(rowSource, LOOKUP_KEYS.position)) ||
            defaults.position ||
            SUPPLIER_INITIAL_FORM_VALUES.supSortOrder,
          supIsActive: toSelectBoolean(
            rowSource.supIsActive ?? getFirstDefinedValue(rowSource, SUPPLIER_IS_ACTIVE_KEYS),
            "true",
          ),
          supStateId: toDisplayValue(rowSource.supStateId),
          supCreatedBy: toDisplayValue(rowSource.supCreatedBy),
          supModifiedBy: toDisplayValue(rowSource.supModifiedBy),
        };
      }}
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const payload: Record<string, unknown> = {
          supCompanyId: toNullableString(values.supCompanyId ?? ""),
          supBranchId: toNullableString(values.supBranchId ?? ""),
          supGroupId: (values.supGroupId ?? "").trim(),
          supPurchaseType: (values.supPurchaseType ?? "").trim(),
          supName: (values.supName ?? "").trim(),
          supShort: toNullableString(values.supShort ?? ""),
          supAddr1: toNullableString(values.supAddr1 ?? ""),
          supAddr2: toNullableString(values.supAddr2 ?? ""),
          supAddr3: toNullableString(values.supAddr3 ?? ""),
          supCity: toNullableString(values.supCity ?? ""),
          supDistrict: toNullableString(values.supDistrict ?? ""),
          supStateName: (values.supStateName ?? "").trim(),
          supCountry: toNullableString(values.supCountry ?? ""),
          supPincode: toNullableString(values.supPincode ?? ""),
          supTel: toNullableString(values.supTel ?? ""),
          supPhone: toNullableString(values.supPhone ?? ""),
          supMailId: toNullableString(values.supMailId ?? ""),
          supWhatsappNo: toNullableString(values.supWhatsappNo ?? ""),
          supWebsiteAddress: toNullableString(values.supWebsiteAddress ?? ""),
          supChequePreName: toNullableString(values.supChequePreName ?? ""),
          supNotes: toNullableString(values.supNotes ?? ""),
          supCreditDays: toNonNegativeInteger(values.supCreditDays ?? "0", 0),
          supCashDiscPerc: toNonNegativeNumber(values.supCashDiscPerc ?? "0", 0),
          supCollectionDays: parseCollectionDays(values.supCollectionDays ?? ""),
          supGstNo: toNullableString(values.supGstNo ?? ""),
          supStateCode: toUpper(values.supStateCode ?? ""),
          supPanNo: toNullableString(values.supPanNo ?? ""),
          supGstType: (values.supGstType ?? "").trim(),
          supSupCst: toNullableString(values.supSupCst ?? ""),
          supDrugLiscenceNo: toNullableString(values.supDrugLiscenceNo ?? ""),
          supRegionName: toNullableString(values.supRegionName ?? ""),
          supRegionAddr1: toNullableString(values.supRegionAddr1 ?? ""),
          supRegionAddr2: toNullableString(values.supRegionAddr2 ?? ""),
          supRegionAddr3: toNullableString(values.supRegionAddr3 ?? ""),
          supRegionCity: toNullableString(values.supRegionCity ?? ""),
          supRegionDistrict: toNullableString(values.supRegionDistrict ?? ""),
          supRegionStateName: toNullableString(values.supRegionStateName ?? ""),
          supRegionCountry: toNullableString(values.supRegionCountry ?? ""),
          supBilledDate: toNullableDate(values.supBilledDate ?? ""),
          supSortOrder: toNullableInteger(values.supSortOrder ?? ""),
          supIsActive: (values.supIsActive ?? "true") === "true",
          supStateId: toNullableString(values.supStateId ?? ""),
          supCreatedBy: toNullableString(values.supCreatedBy ?? ""),
          supModifiedBy: toNullableString(values.supModifiedBy ?? ""),
        };

        if (shouldUpdate && editingItemId !== null) {
          payload.supId = toUpdateId(editingItemId);
        }

        return payload;
      }}
    />
  );
}
