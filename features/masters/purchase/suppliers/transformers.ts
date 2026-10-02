import type { ERPDynamicSelectOption } from "@/components/design-system/ui/dynamic-modal-form";
import {
  buildLookupOptions,
  extractRows,
  getFirstDefinedValue,
  toDateInputValue,
  toDisplayValue,
  toNonNegativeInteger,
  toNonNegativeNumber,
  toNullableDate,
  toNullableString,
  toSelectBoolean,
  toUpper,
  DEFAULT_LOOKUP_ARRAY_KEYS,
} from "@/app/master/_shared/crud-utils";
import {
  DEFAULT_LOOKUP_OPTION,
  GST_TYPE_VALUES,
  STATE_DETAIL_KEYS,
  STATE_LOOKUP_ARRAY_KEYS,
  STATE_LOOKUP_CODE_KEYS,
  STATE_LOOKUP_NAME_KEYS,
  SUPPLIER_GROUP_DETAIL_KEYS,
  SUPPLIER_GROUP_ID_KEYS,
  SUPPLIER_GROUP_LOOKUP_ARRAY_KEYS,
  SUPPLIER_GROUP_NAME_KEYS,
} from "./constants";
import {
  gstinLookupToValues,
  type GstinLookupFieldMap,
  type GstinLookupPayload,
} from "@/features/masters/shared/gstin-lookup";
import type {
  SupplierFormValues,
  StateModalFormValues,
  SupplierGroupModalFormValues,
  GstLookupResult,
} from "./types";

/** Where a GSTIN lookup lands on the supplier form. */
const SUPPLIER_GSTIN_LOOKUP_FIELDS: GstinLookupFieldMap = {
  gstin: "supGstNo",
  pan: "supPanNo",
  country: "supCountry",
  name: "supName",
  regType: "supGstType",
  addr1: "supAddr1",
  addr2: "supAddr2",
  addr3: "supAddr3",
  city: "supCity",
  district: "supDistrict",
  stateCode: "supStateCode",
  stateName: "supStateName",
  pin: "supPincode",
};

// Collection Days Handling
export function parseCollectionDays(value: string): number[] {
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

export function toCollectionDaysInput(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }
  const normalized = value
    .map((entry) => (typeof entry === "number" ? entry : Number(entry)))
    .filter((entry) => Number.isInteger(entry) && entry >= 0)
    .map((entry) => String(entry));
  return Array.from(new Set(normalized)).join(",");
}

// Integer Conversion
export function toNullableInteger(value: string): number | null {
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

// GST Type Conversion
export function toGstTypeValue(value: string): string {
  const normalized = value.trim().toUpperCase();
  return GST_TYPE_VALUES.has(normalized) ? normalized : "";
}


// Lookup Selection
export function toNullableLookupSelection(value: string): string | null {
  const normalized = value.trim();
  if (normalized) {
    return normalized;
  }
  return null;
}

// Resolve Option from Shortcut
export function resolveOptionFromShortcut(
  payload: unknown,
  options: ERPDynamicSelectOption[],
): ERPDynamicSelectOption | null {
  if (typeof payload !== "object" || !payload) {
    return null;
  }
  const shortcutPayload = payload as Record<string, string>;
  const selectedValue = shortcutPayload.value?.trim() ?? "";
  if (selectedValue) {
    const selectedOption = options.find((option) => option.value === selectedValue);
    if (selectedOption) {
      return selectedOption;
    }
  }
  const normalizedQuery = (shortcutPayload.query ?? "").trim().toLowerCase();
  if (!normalizedQuery) {
    return null;
  }
  const exactMatch = options.find((option) => {
    const label = option.label.trim().toLowerCase();
    const value = option.value.trim().toLowerCase();
    return label === normalizedQuery || value === normalizedQuery;
  });
  if (exactMatch) {
    return exactMatch;
  }
  const startsWithMatch = options.find((option) =>
    option.label.trim().toLowerCase().startsWith(normalizedQuery),
  );
  if (startsWithMatch) {
    return startsWithMatch;
  }
  return (
    options.find((option) =>
      option.label.trim().toLowerCase().includes(normalizedQuery),
    ) ?? null
  );
}

// Lookup Option Builders
export function removeEmptyOptions(
  options: ERPDynamicSelectOption[],
): ERPDynamicSelectOption[] {
  return options.filter((option) => option.value.trim().length > 0);
}

export function buildSupplierGroupOptions(payload: unknown): ERPDynamicSelectOption[] {
  return removeEmptyOptions(
    buildLookupOptions(payload, DEFAULT_LOOKUP_OPTION, {
      arrayKeys: SUPPLIER_GROUP_LOOKUP_ARRAY_KEYS,
      idKeys: SUPPLIER_GROUP_ID_KEYS,
      labelKeys: SUPPLIER_GROUP_NAME_KEYS,
    }),
  );
}

export function buildStateNameOptions(payload: unknown): ERPDynamicSelectOption[] {
  return removeEmptyOptions(
    buildLookupOptions(payload, DEFAULT_LOOKUP_OPTION, {
      arrayKeys: STATE_LOOKUP_ARRAY_KEYS,
      idKeys: STATE_LOOKUP_NAME_KEYS,
      labelKeys: STATE_LOOKUP_NAME_KEYS,
    }),
  );
}

export function buildCompanyOptions(payload: unknown): ERPDynamicSelectOption[] {
  return removeEmptyOptions(
    buildLookupOptions(payload, DEFAULT_LOOKUP_OPTION, {
      arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "companies", "companys"],
      idKeys: ["compId", "comp_id", "company_id", "companyId", "id", "_id", "value"],
      labelKeys: [
        "compName",
        "comp_name",
        "company_name",
        "companyName",
        "name",
        "label",
      ],
    }),
  );
}

export function buildBranchOptions(payload: unknown): ERPDynamicSelectOption[] {
  return removeEmptyOptions(
    buildLookupOptions(payload, DEFAULT_LOOKUP_OPTION, {
      arrayKeys: [...DEFAULT_LOOKUP_ARRAY_KEYS, "branches", "branch_masters"],
      idKeys: ["brId", "br_id", "branch_id", "branchId", "id", "_id", "value"],
      labelKeys: ["brName", "br_name", "branch_name", "branchName", "name", "label"],
    }),
  );
}

// State Code Mapping
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

// GST Lookup
/**
 * The supplier form's patch for a GSTIN lookup (`GET /gst/search`, already
 * normalised by the server). Every lookup key is written — blank where the
 * record has nothing — so a second lookup does not leave the first one's
 * address behind. The state goes in as code and name, and the regional state
 * starts as the same name.
 */
export function buildSupplierLookupValues(
  payload: GstinLookupPayload,
  stateNameByCode: Record<string, string>,
): GstLookupResult {
  const looked = gstinLookupToValues(payload, SUPPLIER_GSTIN_LOOKUP_FIELDS, {
    stateNameByCode,
    allowedRegTypes: Array.from(GST_TYPE_VALUES),
  });
  const values: GstLookupResult = {
    supGstNo: "",
    supPanNo: "",
    supCountry: "India",
    supName: "",
    supGstType: "",
    supAddr1: "",
    supAddr2: "",
    supAddr3: "",
    supCity: "",
    supDistrict: "",
    supStateCode: "",
    supStateName: "",
    supRegionStateName: "",
    supPincode: "",
    ...looked,
  };
  values.supRegionStateName = values.supStateName;
  return values;
}

// Detail Source Extraction
export function extractDetailSource(
  payload: unknown,
  arrayKeys: readonly string[],
): Record<string, unknown> | null {
  const rows = extractRows(payload, arrayKeys);
  if (rows.length > 0) {
    const firstRow = rows[0];
    if (firstRow && typeof firstRow === "object" && !Array.isArray(firstRow)) {
      return firstRow as Record<string, unknown>;
    }
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const objectPayload = payload as Record<string, unknown>;
  const nestedData = objectPayload.data;
  if (nestedData && typeof nestedData === "object" && !Array.isArray(nestedData)) {
    return nestedData as Record<string, unknown>;
  }
  return objectPayload;
}

// Modal Form Value Mapping
export function mapStateDetailToFormValues(
  source: Record<string, unknown>,
): Record<string, string> {
  return {
    stateCode:
      toUpper(toDisplayValue(getFirstDefinedValue(source, STATE_DETAIL_KEYS.code))) || "",
    stateName: toDisplayValue(
      getFirstDefinedValue(source, STATE_DETAIL_KEYS.name),
    ) || "",
    stateUt: toSelectBoolean(
      getFirstDefinedValue(source, STATE_DETAIL_KEYS.stateUt),
      "false",
    ),
    tinCode:
      toUpper(toDisplayValue(getFirstDefinedValue(source, STATE_DETAIL_KEYS.tinCode))) || "",
    isActive: toSelectBoolean(
      getFirstDefinedValue(source, STATE_DETAIL_KEYS.active),
      "true",
    ),
  };
}

export function mapSupplierGroupDetailToFormValues(
  source: Record<string, unknown>,
): Record<string, string> {
  return {
    spgName: toDisplayValue(
      getFirstDefinedValue(source, SUPPLIER_GROUP_DETAIL_KEYS.name),
    ) || "",
    spgShort: toDisplayValue(
      getFirstDefinedValue(source, SUPPLIER_GROUP_DETAIL_KEYS.short),
    ) || "",
    spgDesc: toDisplayValue(
      getFirstDefinedValue(source, SUPPLIER_GROUP_DETAIL_KEYS.description),
    ) || "",
    spgIsActive: toSelectBoolean(
      getFirstDefinedValue(source, SUPPLIER_GROUP_DETAIL_KEYS.active),
      "true",
    ),
  };
}

// Form Value Mapping from Row Data
export function toSupplierFormValues(
  rowSource: Record<string, unknown>,
  defaults: Record<string, unknown>,
  stateCodeByName: Record<string, string>,
  initialValues: SupplierFormValues,
  lookupKeys: Record<string, readonly string[]>,
): SupplierFormValues {
  const mappedStateName = toDisplayValue(rowSource.supStateName);
  return {
    ...initialValues,
    supCompanyId: toDisplayValue(rowSource.supCompanyId),
    supBranchId: toDisplayValue(rowSource.supBranchId),
    supGroupId: toDisplayValue(rowSource.supGroupId),
    supPurchaseType:
      toDisplayValue(
        rowSource.supPurchaseType ??
          getFirstDefinedValue(rowSource, lookupKeys.code as readonly string[]),
      ) ||
      toDisplayValue(defaults.searchCode) ||
      initialValues.supPurchaseType,
    supName:
      toDisplayValue(
        rowSource.supName ??
          getFirstDefinedValue(rowSource, lookupKeys.name as readonly string[]),
      ) ||
      toDisplayValue(defaults.masterName) ||
      initialValues.supName,
    supShort:
      toDisplayValue(
        rowSource.supShort ??
          getFirstDefinedValue(rowSource, lookupKeys.short as readonly string[]),
      ) ||
      toDisplayValue(defaults.masterShortName) ||
      initialValues.supShort,
    supAddr1: toDisplayValue(rowSource.supAddr1),
    supAddr2: toDisplayValue(rowSource.supAddr2),
    supAddr3: toDisplayValue(rowSource.supAddr3),
    supCity: toDisplayValue(rowSource.supCity),
    supDistrict: toDisplayValue(rowSource.supDistrict),
    supStateName: mappedStateName,
    supCountry:
      toDisplayValue(rowSource.supCountry) || initialValues.supCountry,
    supPincode: toDisplayValue(rowSource.supPincode),
    supTel: toDisplayValue(rowSource.supTel),
    supPhone: toDisplayValue(rowSource.supPhone),
    supMailId: toDisplayValue(rowSource.supMailId),
    supWhatsappNo: toDisplayValue(rowSource.supWhatsappNo),
    supWebsiteAddress: toDisplayValue(rowSource.supWebsiteAddress),
    supChequePreName: toDisplayValue(rowSource.supChequePreName),
    supNotes:
      toDisplayValue(
        rowSource.supNotes ??
          getFirstDefinedValue(rowSource, lookupKeys.description as readonly string[]),
      ) ||
      toDisplayValue(defaults.masterDescription) ||
      initialValues.supNotes,
    supCreditDays:
      toDisplayValue(rowSource.supCreditDays) || initialValues.supCreditDays,
    supCashDiscPerc:
      toDisplayValue(rowSource.supCashDiscPerc) ||
      initialValues.supCashDiscPerc,
    supCollectionDays: toCollectionDaysInput(rowSource.supCollectionDays),
    supGstNo: toDisplayValue(rowSource.supGstNo),
    supStateCode:
      stateCodeByName[mappedStateName] || toDisplayValue(rowSource.supStateCode),
    supPanNo: toDisplayValue(rowSource.supPanNo),
    supGstType:
      toGstTypeValue(toDisplayValue(rowSource.supGstType)) ||
      initialValues.supGstType,
    supSupCst: toDisplayValue(rowSource.supSupCst),
    supDrugLiscenceNo: toDisplayValue(rowSource.supDrugLiscenceNo),
    supRegionName: toDisplayValue(rowSource.supRegionName),
    supRegionAddr1: toDisplayValue(rowSource.supRegionAddr1),
    supRegionAddr2: toDisplayValue(rowSource.supRegionAddr2),
    supRegionAddr3: toDisplayValue(rowSource.supRegionAddr3),
    supRegionCity: toDisplayValue(rowSource.supRegionCity),
    supRegionDistrict: toDisplayValue(rowSource.supRegionDistrict),
    supRegionStateName:
      mappedStateName || toDisplayValue(rowSource.supRegionStateName),
    supRegionCountry:
      toDisplayValue(rowSource.supRegionCountry) ||
      initialValues.supRegionCountry,
    supBilledDate: toDateInputValue(rowSource.supBilledDate),
    supSortOrder:
      toDisplayValue(
        rowSource.supSortOrder ??
          getFirstDefinedValue(rowSource, lookupKeys.position as readonly string[]),
      ) ||
      toDisplayValue(defaults.position) ||
      initialValues.supSortOrder,
    supIsActive: toSelectBoolean(
      rowSource.supIsActive ??
        getFirstDefinedValue(rowSource, [
          "supIsActive",
          "sup_is_active",
          "isActive",
          "is_active",
          "status",
        ]),
      "true",
    ),
  };
}
