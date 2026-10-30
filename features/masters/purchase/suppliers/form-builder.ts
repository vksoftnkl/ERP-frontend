import {
  toNullableString,
  toUpdateId,
} from "@/app/master/_shared/crud-utils";
import { partyGstRuleMessageFor } from "@/features/masters/shared/party-master-rules";
import { SUPPLIER_MAX_CREDIT_DAYS, SUPPLIER_MSME_MAX_AGREED_DAYS } from "./constants";
import type { SupplierFormValues } from "./types";
import {
  toGstTypeValue,
  toNullableInteger,
  toNullableLookupSelection,
} from "./transformers";

// Validation Functions
/** The picked state's code: the form stores the state NAME (the record's own code as fallback). */
function supplierStateCodeOf(values: Record<string, string>, stateCodeByName: Record<string, string>): string {
  const stateName = (values.supStateName ?? "").trim();
  return stateName ? (stateCodeByName[stateName] ?? (values.supStateCode ?? "").trim()) : "";
}

function supplierGstRuleInput(
  values: Record<string, string>,
  gstin: string,
  stateCodeByName: Record<string, string>,
) {
  return {
    role: "supplier" as const,
    gstType: values.supGstType ?? "",
    gstin,
    stateCode: supplierStateCodeOf(values, stateCodeByName),
  };
}

/**
 * Party rules D2 (the server's resolvePartyGstType): REGULAR / COMPOSITION /
 * SEZ need a GSTIN, UNREGISTERED / OVERSEAS refuse one; any GSTN shape is
 * accepted (a normal one also passes the Qt mod-36 check); a normal GSTIN's
 * first two digits must be the State's code (PURCHASE_SUPPLIER_GSTIN_STATE_MISMATCH).
 */
export function validateSupplierGstin(
  value: string,
  values: Record<string, string>,
  stateCodeByName: Record<string, string>,
): string | null {
  return partyGstRuleMessageFor("gstin", supplierGstRuleInput(values, value, stateCodeByName));
}

/** OVERSEAS = state 96 "Other Country" (Q6, PURCHASE_SUPPLIER_OVERSEAS_STATE). */
export function validateSupplierOverseasState(
  values: Record<string, string>,
  stateCodeByName: Record<string, string>,
): string | null {
  return partyGstRuleMessageFor(
    "state",
    supplierGstRuleInput(values, values.supGstNo ?? "", stateCodeByName),
  );
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
  // Regional Details keeps its own State box, pre-filled by mirroring the Identity
  // tab's State. What is in that box wins, so a manual edit there is not discarded;
  // the Identity state is only the fallback for records saved before it was shown.
  const resolvedRegionStateName =
    (values.supRegionStateName ?? "").trim() || selectedStateName;

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
    supCreditDays: Math.min(
      toNonNegativeInteger(values.supCreditDays ?? "0", 0),
      SUPPLIER_MAX_CREDIT_DAYS,
    ),
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
    // supBilledDate is not sent: no master save writes it (party rules D3-5, Q10).
    supSortOrder: toNullableInteger(values.supSortOrder ?? ""),
    supIsActive: (values.supIsActive ?? "true") === "true",
    ...buildSupplierPurchasePayload(values),
    supCreatedBy: toNullableString(values.supCreatedBy ?? ""),
    supModifiedBy: toNullableString(values.supModifiedBy ?? ""),
  };

  if (shouldUpdate && editingItemId !== null) {
    payload.supId = toUpdateId(editingItemId);
  }

  return payload;
}

/** "Agreed Days" is 0–45 or not given. */
export function validateSupplierAgreedDays(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  const days = Number(normalized);
  return Number.isInteger(days) && days >= 0 && days <= SUPPLIER_MSME_MAX_AGREED_DAYS
    ? null
    : `Agreed Days is a whole number from 0 to ${SUPPLIER_MSME_MAX_AGREED_DAYS}.`;
}

/**
 * MST-01 — the Purchase tab's keys (server 70b1901e). Every key is sent, so a
 * cleared field clears the column: blank codes / dates / godown go as null.
 */
export function buildSupplierPurchasePayload(values: Partial<SupplierFormValues>): Record<string, unknown> {
  const code = (raw: string | undefined) => {
    const normalized = (raw ?? "").trim().toUpperCase();
    return normalized ? normalized : null;
  };
  const date = (raw: string | undefined) => {
    const normalized = (raw ?? "").trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
  };
  const days = toNullableInteger(values.supMsmeAgreedDays ?? "");
  return {
    supMsmeCategory: code(values.supMsmeCategory),
    supMsmeActivity: code(values.supMsmeActivity),
    supMsmeAgreement: values.supMsmeAgreement === "true",
    supMsmeAgreedDays:
      days === null ? null : Math.min(Math.max(days, 0), SUPPLIER_MSME_MAX_AGREED_DAYS),
    supDrugLicenceExpiry: date(values.supDrugLicenceExpiry),
    supFssaiNo: toNullableString(values.supFssaiNo ?? ""),
    supFssaiValidTo: date(values.supFssaiValidTo),
    supDefaultGodownId: toNullableString(values.supDefaultGodownId ?? ""),
    supShowNotesOnEntry: values.supShowNotesOnEntry === "true",
    supIsImport: values.supIsImport === "true",
  };
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
