import { validateGstin } from "@/utils/validation";
import {
  toNullableString,
  toUpdateId,
} from "@/app/master/_shared/crud-utils";
import {
  GST_LOOKUP_HELPER_TEXT,
  GST_TYPE_VALUES,
  LOOKUP_KEYS,
  PURCHASE_TYPE_OPTIONS,
  SUPPLIER_INITIAL_FORM_VALUES,
} from "./constants";
import type { SupplierFormValues } from "./types";
import {
  toGstTypeValue,
  toNullableInteger,
  toNullableLookupSelection,
} from "./transformers";

// Validation Functions
export function validateSupplierGstin(
  value: string,
  values: Record<string, string>,
): string | null {
  const normalized = value.trim();
  const gstType = toGstTypeValue(values.supGstType ?? "");
  if (!normalized) {
    return gstType === "REGULAR"
      ? "GST No is required when GST Type is Regular."
      : null;
  }
  return validateGstin(normalized);
}

export function validateSupplierPan(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  if (!normalized) {
    return null;
  }
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(normalized)
    ? null
    : "PAN No must be 10 characters (e.g., ABCDE1234F).";
}

// Request Payload Builder
export function buildSupplierRequestPayload(
  values: SupplierFormValues,
  stateCodeByName: Record<string, string>,
  shouldUpdate: boolean,
  editingItemId: string | null,
): Record<string, unknown> {
  const selectedStateName = (values.supStateName ?? "").trim();
  const resolvedStateCode = stateCodeByName[selectedStateName] ?? (values.supStateCode ?? "").trim().toUpperCase();
  const resolvedRegionStateName =
    selectedStateName || (values.supRegionStateName ?? "").trim();

  const payload: Record<string, unknown> = {
    supCompanyId: toNullableLookupSelection(values.supCompanyId ?? ""),
    supBranchId: toNullableLookupSelection(values.supBranchId ?? ""),
    supGroupId: (values.supGroupId ?? "").trim(),
    supPurchaseType: (values.supPurchaseType ?? "").trim(),
    supName: (values.supName ?? "").trim(),
    supShort: toNullableString(values.supShort ?? ""),
    supAddr1: toNullableString(values.supAddr1 ?? ""),
    supAddr2: toNullableString(values.supAddr2 ?? ""),
    supAddr3: toNullableString(values.supAddr3 ?? ""),
    supCity: toNullableString(values.supCity ?? ""),
    supDistrict: toNullableString(values.supDistrict ?? ""),
    supStateName: selectedStateName,
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
    supGstNo: toNullableString((values.supGstNo ?? "").trim().toUpperCase()),
    supStateCode: resolvedStateCode,
    supPanNo: toNullableString((values.supPanNo ?? "").trim().toUpperCase()),
    supGstType: toGstTypeValue(values.supGstType ?? ""),
    supSupCst: toNullableString(values.supSupCst ?? ""),
    supDrugLiscenceNo: toNullableString(values.supDrugLiscenceNo ?? ""),
    supRegionName: toNullableString(values.supRegionName ?? ""),
    supRegionAddr1: toNullableString(values.supRegionAddr1 ?? ""),
    supRegionAddr2: toNullableString(values.supRegionAddr2 ?? ""),
    supRegionAddr3: toNullableString(values.supRegionAddr3 ?? ""),
    supRegionCity: toNullableString(values.supRegionCity ?? ""),
    supRegionDistrict: toNullableString(values.supRegionDistrict ?? ""),
    supRegionStateName: toNullableString(resolvedRegionStateName),
    supRegionCountry: toNullableString(values.supRegionCountry ?? ""),
    supBilledDate: toNullableDate(values.supBilledDate ?? ""),
    supSortOrder: toNullableInteger(values.supSortOrder ?? ""),
    supIsActive: (values.supIsActive ?? "true") === "true",
    supCreatedBy: toNullableString(values.supCreatedBy ?? ""),
    supModifiedBy: toNullableString(values.supModifiedBy ?? ""),
  };

  if (shouldUpdate && editingItemId !== null) {
    payload.supId = toUpdateId(editingItemId);
  }

  return payload;
}

// Helper Functions
function toNonNegativeInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function toNonNegativeNumber(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function toNullableDate(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  // Basic validation for date format
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? normalized : null;
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
