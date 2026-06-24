import {
  toDisplayValue,
  getFirstDefinedValue,
  getFieldValue,
  toSelectBoolean,
  toDateInputValue,
  normalizeGstPartyRegType,
  normalizeObType,
} from "./transformers";
import { REQUEST_PAYLOAD_KEYS, LOOKUP_KEYS } from "./constants";
import {
  buildLedgerBankAccountPayload,
  type LedgerBankAccountFormRow,
} from "./bank-accounts";
import type {
  LedgerFormFieldName,
  LedgerFormValues,
} from "./types";

const LEDGER_INITIAL_FORM_VALUES = {
  masterName: "",
  masterAlias: "",
  masterShortName: "",
  ledCompanyId: "",
  ledBranchId: "",
  ledGroupId: "",
  ledTallyName: "",
  ledTallyGroupName: "",
  ledTallyGuid: "",
  ledCategory: "GENERAL",
  ledLedgerType: "",
  ledMailingName: "",
  ledIsBillByBill: "false",
  ledIsCostCenterReq: "false",
  ledIsInterestApplicable: "false",
  ledInterestRate: "0",
  ledContactPerson: "",
  ledEmail: "",
  ledTel: "",
  ledPhone1: "",
  ledPhone2: "",
  ledWhatsappNo: "",
  ledAddr1: "",
  ledAddr2: "",
  ledAddr3: "",
  ledCity: "",
  ledDistrict: "",
  ledStateName: "",
  ledStateCode: "",
  ledPin: "",
  ledCountry: "",
  ledRegionName: "",
  ledRegionAddr1: "",
  ledRegionAddr2: "",
  ledRegionAddr3: "",
  ledRegionCity: "",
  ledRegionDistrict: "",
  ledRegionStateName: "",
  ledRegionCountry: "",
  ledGstPartyRegType: "REGULAR",
  ledGstinNo: "",
  ledPanNo: "",
  ledAadharNo: "",
  ledEcommerceGstin: "",
  ledIsSez: "false",
  ledTypeOfSupply: "",
  ledHsnSac: "",
  ledGstRate: "",
  ledTaxability: "",
  ledGstPartyType: "",
  ledTanNo: "",
  ledCin: "",
  ledUdyamNo: "",
  ledMsmeType: "",
  ledGstDutyHead: "",
  ledTaxRate: "",
  ledRoundingMethod: "",
  ledRoundingLimit: "",
  ledIsTdsApplicable: "false",
  ledTdsDeducteeType: "",
  ledTdsNatureOfPayment: "",
  ledIsTcsApplicable: "false",
  ledObAmount: "0",
  ledObType: "DR",
  ledObAsOn: "",
  ledTotalDr: "0",
  ledTotalCr: "0",
  ledTotalBalance: "0",
  ledSortOrder: "",
  ledIsActive: "true",
  ledAllowEdit: "false",
  ledIsEntry: "false",
  ledAllowSms: "false",
  masterDescription: "",
} as const;

export const LEDGER_FIELD_NAME_SET = new Set<string>(
  Object.keys(LEDGER_INITIAL_FORM_VALUES),
);

export function isLedgerFieldName(value: string): value is LedgerFormFieldName {
  return LEDGER_FIELD_NAME_SET.has(value);
}

export function createInitialLedgerFormValues(): LedgerFormValues {
  return {
    ...LEDGER_INITIAL_FORM_VALUES,
  };
}

export function toLedgerFormValues(source: Record<string, unknown> | null): LedgerFormValues {
  const rowSource = source ?? {};
  const defaults = createInitialLedgerFormValues();
  const gstPartyType = normalizeGstPartyRegType(
    toDisplayValue(getFieldValue(rowSource, "ledGstPartyRegType")),
  );
  return {
    ...defaults,
    masterName:
      toDisplayValue(getFieldValue(rowSource, "ledName")) || defaults.masterName,
    masterAlias:
      toDisplayValue(getFieldValue(rowSource, "ledAlias")) || defaults.masterAlias,
    masterShortName:
      toDisplayValue(getFieldValue(rowSource, "ledShort")) || defaults.masterShortName,
    ledCompanyId:
      toDisplayValue(getFieldValue(rowSource, "ledCompanyId")) || defaults.ledCompanyId,
    ledBranchId:
      toDisplayValue(getFieldValue(rowSource, "ledBranchId")) || defaults.ledBranchId,
    ledGroupId:
      toDisplayValue(getFieldValue(rowSource, "ledGroupId")) || defaults.ledGroupId,
    ledTallyName: toDisplayValue(getFieldValue(rowSource, "ledTallyName")),
    ledTallyGroupName: toDisplayValue(getFieldValue(rowSource, "ledTallyGroupName")),
    ledTallyGuid: toDisplayValue(getFieldValue(rowSource, "ledTallyGuid")),
    ledCategory:
      toDisplayValue(getFieldValue(rowSource, "ledCategory")) || defaults.ledCategory,
    ledLedgerType: toDisplayValue(getFieldValue(rowSource, "ledLedgerType")),
    ledMailingName: toDisplayValue(getFieldValue(rowSource, "ledMailingName")),
    ledIsBillByBill: toSelectBoolean(getFieldValue(rowSource, "ledIsBillByBill"), "false"),
    ledIsCostCenterReq: toSelectBoolean(
      getFieldValue(rowSource, "ledIsCostCenterReq"),
      "false",
    ),
    ledIsInterestApplicable: toSelectBoolean(
      getFieldValue(rowSource, "ledIsInterestApplicable"),
      "false",
    ),
    ledInterestRate:
      toDisplayValue(getFieldValue(rowSource, "ledInterestRate")) || defaults.ledInterestRate,
    ledContactPerson: toDisplayValue(getFieldValue(rowSource, "ledContactPerson")),
    ledEmail: toDisplayValue(getFieldValue(rowSource, "ledEmail")),
    ledTel: toDisplayValue(getFieldValue(rowSource, "ledTel")),
    ledPhone1: toDisplayValue(getFieldValue(rowSource, "ledPhone1")),
    ledPhone2: toDisplayValue(getFieldValue(rowSource, "ledPhone2")),
    ledWhatsappNo: toDisplayValue(getFieldValue(rowSource, "ledWhatsappNo")),
    ledAddr1: toDisplayValue(getFieldValue(rowSource, "ledAddr1")),
    ledAddr2: toDisplayValue(getFieldValue(rowSource, "ledAddr2")),
    ledAddr3: toDisplayValue(getFieldValue(rowSource, "ledAddr3")),
    ledCity: toDisplayValue(getFieldValue(rowSource, "ledCity")),
    ledDistrict: toDisplayValue(getFieldValue(rowSource, "ledDistrict")),
    ledStateName: toDisplayValue(getFieldValue(rowSource, "ledStateName")),
    ledStateCode: toDisplayValue(getFieldValue(rowSource, "ledStateCode")),
    ledPin: toDisplayValue(getFieldValue(rowSource, "ledPin")),
    ledCountry: toDisplayValue(getFieldValue(rowSource, "ledCountry")),
    ledRegionName: toDisplayValue(getFieldValue(rowSource, "ledRegionName")),
    ledRegionAddr1: toDisplayValue(getFieldValue(rowSource, "ledRegionAddr1")),
    ledRegionAddr2: toDisplayValue(getFieldValue(rowSource, "ledRegionAddr2")),
    ledRegionAddr3: toDisplayValue(getFieldValue(rowSource, "ledRegionAddr3")),
    ledRegionCity: toDisplayValue(getFieldValue(rowSource, "ledRegionCity")),
    ledRegionDistrict: toDisplayValue(getFieldValue(rowSource, "ledRegionDistrict")),
    ledRegionStateName: toDisplayValue(getFieldValue(rowSource, "ledRegionStateName")),
    ledRegionCountry: toDisplayValue(getFieldValue(rowSource, "ledRegionCountry")),
    ledGstPartyRegType: gstPartyType ?? defaults.ledGstPartyRegType,
    ledGstinNo: toDisplayValue(getFieldValue(rowSource, "ledGstinNo")),
    ledPanNo: toDisplayValue(getFieldValue(rowSource, "ledPanNo")),
    ledAadharNo: toDisplayValue(getFieldValue(rowSource, "ledAadharNo")),
    ledEcommerceGstin: toDisplayValue(getFieldValue(rowSource, "ledEcommerceGstin")),
    ledIsSez: toSelectBoolean(getFieldValue(rowSource, "ledIsSez"), "false"),
    ledTypeOfSupply: toDisplayValue(getFieldValue(rowSource, "ledTypeOfSupply")),
    ledHsnSac: toDisplayValue(getFieldValue(rowSource, "ledHsnSac")),
    ledGstRate: toDisplayValue(getFieldValue(rowSource, "ledGstRate")),
    ledTaxability: toDisplayValue(getFieldValue(rowSource, "ledTaxability")),
    ledGstPartyType: toDisplayValue(getFieldValue(rowSource, "ledGstPartyType")),
    ledTanNo: toDisplayValue(getFieldValue(rowSource, "ledTanNo")),
    ledCin: toDisplayValue(getFieldValue(rowSource, "ledCin")),
    ledUdyamNo: toDisplayValue(getFieldValue(rowSource, "ledUdyamNo")),
    ledMsmeType: toDisplayValue(getFieldValue(rowSource, "ledMsmeType")),
    ledGstDutyHead: toDisplayValue(getFieldValue(rowSource, "ledGstDutyHead")),
    ledTaxRate: toDisplayValue(getFieldValue(rowSource, "ledTaxRate")),
    ledRoundingMethod: toDisplayValue(getFieldValue(rowSource, "ledRoundingMethod")),
    ledRoundingLimit: toDisplayValue(getFieldValue(rowSource, "ledRoundingLimit")),
    ledIsTdsApplicable: toSelectBoolean(getFieldValue(rowSource, "ledIsTdsApplicable"), "false"),
    ledTdsDeducteeType: toDisplayValue(getFieldValue(rowSource, "ledTdsDeducteeType")),
    ledTdsNatureOfPayment: toDisplayValue(getFieldValue(rowSource, "ledTdsNatureOfPayment")),
    ledIsTcsApplicable: toSelectBoolean(getFieldValue(rowSource, "ledIsTcsApplicable"), "false"),
    ledObAmount:
      toDisplayValue(getFieldValue(rowSource, "ledObAmount")) || defaults.ledObAmount,
    ledObType: normalizeObType(toDisplayValue(getFieldValue(rowSource, "ledObType"))),
    ledObAsOn: toDateInputValue(getFieldValue(rowSource, "ledObAsOn")),
    ledTotalDr: toDisplayValue(getFieldValue(rowSource, "ledTotalDr")) || defaults.ledTotalDr,
    ledTotalCr: toDisplayValue(getFieldValue(rowSource, "ledTotalCr")) || defaults.ledTotalCr,
    ledTotalBalance:
      toDisplayValue(getFieldValue(rowSource, "ledTotalBalance")) || defaults.ledTotalBalance,
    ledSortOrder: toDisplayValue(getFieldValue(rowSource, "ledSortOrder")),
    ledIsActive: toSelectBoolean(getFieldValue(rowSource, "ledIsActive"), "true"),
    ledAllowEdit: toSelectBoolean(getFieldValue(rowSource, "ledAllowEdit"), "false"),
    ledIsEntry: toSelectBoolean(getFieldValue(rowSource, "ledIsEntry"), "false"),
    ledAllowSms: toSelectBoolean(getFieldValue(rowSource, "ledAllowSms"), "false"),
    masterDescription:
      toDisplayValue(getFieldValue(rowSource, "ledRemarks")) || defaults.masterDescription,
  };
}

export function buildLedgerRequestPayload(
  values: LedgerFormValues,
  shouldUpdate: boolean,
  editingItemId: string | number | null,
  bankAccountRows: LedgerBankAccountFormRow[] = [],
): Record<string, unknown> {
  const { toNumber, toNullableString, toUpperNullable, toNullableDate } = require("./transformers");

  const toNullableNumber = (raw: string | undefined): number | null => {
    const normalized = (raw ?? "").trim();
    if (!normalized) {
      return null;
    }
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const toNullableInt = (raw: string | undefined): number | null => {
    const normalized = (raw ?? "").trim();
    if (!normalized) {
      return null;
    }
    const parsed = Number.parseInt(normalized, 10);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const payload: Record<string, unknown> = {
    ledCompanyId: (values.ledCompanyId ?? "").trim(),
    ledBranchId: (values.ledBranchId ?? "").trim(),
    ledGroupId: (values.ledGroupId ?? "").trim(),
    ledName: (values.masterName ?? "").trim(),
    ledAlias: toNullableString(values.masterAlias ?? ""),
    ledShort: toNullableString(values.masterShortName ?? ""),
    ledTallyName: toNullableString(values.ledTallyName ?? ""),
    ledTallyGroupName: toNullableString(values.ledTallyGroupName ?? ""),
    ledTallyGuid: toNullableString(values.ledTallyGuid ?? ""),
    ledCategory: (values.ledCategory ?? "").trim() || "GENERAL",
    ledLedgerType: toNullableString(values.ledLedgerType ?? ""),
    ledMailingName: toNullableString(values.ledMailingName ?? ""),
    ledIsBillByBill: (values.ledIsBillByBill ?? "false") === "true",
    ledIsCostCenterReq: (values.ledIsCostCenterReq ?? "false") === "true",
    ledIsInterestApplicable: (values.ledIsInterestApplicable ?? "false") === "true",
    ledInterestRate: Math.max(0, toNumber(values.ledInterestRate ?? "0", 0)),
    ledContactPerson: toNullableString(values.ledContactPerson ?? ""),
    ledEmail: toNullableString(values.ledEmail ?? ""),
    ledTel: toNullableString(values.ledTel ?? ""),
    ledPhone1: toNullableString(values.ledPhone1 ?? ""),
    ledPhone2: toNullableString(values.ledPhone2 ?? ""),
    ledWhatsappNo: toNullableString(values.ledWhatsappNo ?? ""),
    ledAddr1: toNullableString(values.ledAddr1 ?? ""),
    ledAddr2: toNullableString(values.ledAddr2 ?? ""),
    ledAddr3: toNullableString(values.ledAddr3 ?? ""),
    ledCity: toNullableString(values.ledCity ?? ""),
    ledDistrict: toNullableString(values.ledDistrict ?? ""),
    ledStateName: toNullableString(values.ledStateName ?? ""),
    ledStateCode: toUpperNullable(values.ledStateCode ?? ""),
    ledPin: toNullableString(values.ledPin ?? ""),
    ledCountry: toNullableString(values.ledCountry ?? ""),
    ledRegionName: toNullableString(values.ledRegionName ?? ""),
    ledRegionAddr1: toNullableString(values.ledRegionAddr1 ?? ""),
    ledRegionAddr2: toNullableString(values.ledRegionAddr2 ?? ""),
    ledRegionAddr3: toNullableString(values.ledRegionAddr3 ?? ""),
    ledRegionCity: toNullableString(values.ledRegionCity ?? ""),
    ledRegionDistrict: toNullableString(values.ledRegionDistrict ?? ""),
    ledRegionStateName: toNullableString(values.ledRegionStateName ?? ""),
    ledRegionCountry: toNullableString(values.ledRegionCountry ?? ""),
    ledGstPartyRegType: normalizeGstPartyRegType(values.ledGstPartyRegType ?? ""),
    ledGstinNo: toUpperNullable(values.ledGstinNo ?? ""),
    ledPanNo: toUpperNullable(values.ledPanNo ?? ""),
    ledAadharNo: toNullableString(values.ledAadharNo ?? ""),
    ledEcommerceGstin: toUpperNullable(values.ledEcommerceGstin ?? ""),
    ledIsSez: (values.ledIsSez ?? "false") === "true",
    ledTypeOfSupply: toNullableString(values.ledTypeOfSupply ?? ""),
    ledHsnSac: toNullableString(values.ledHsnSac ?? ""),
    ledGstRate: toNullableNumber(values.ledGstRate),
    ledTaxability: toNullableString(values.ledTaxability ?? ""),
    ledGstPartyType: toNullableString(values.ledGstPartyType ?? ""),
    ledTanNo: toUpperNullable(values.ledTanNo ?? ""),
    ledCin: toUpperNullable(values.ledCin ?? ""),
    ledUdyamNo: toUpperNullable(values.ledUdyamNo ?? ""),
    ledMsmeType: toNullableString(values.ledMsmeType ?? ""),
    ledGstDutyHead: toNullableString(values.ledGstDutyHead ?? ""),
    ledTaxRate: toNullableNumber(values.ledTaxRate),
    ledRoundingMethod: toNullableString(values.ledRoundingMethod ?? ""),
    ledRoundingLimit: toNullableNumber(values.ledRoundingLimit),
    ledIsTdsApplicable: (values.ledIsTdsApplicable ?? "false") === "true",
    ledTdsDeducteeType: toNullableString(values.ledTdsDeducteeType ?? ""),
    ledTdsNatureOfPayment: toNullableString(values.ledTdsNatureOfPayment ?? ""),
    ledIsTcsApplicable: (values.ledIsTcsApplicable ?? "false") === "true",
    ledObAmount: Math.max(0, toNumber(values.ledObAmount ?? "0", 0)),
    ledObType: normalizeObType(values.ledObType ?? "DR"),
    ledObAsOn: toNullableDate(values.ledObAsOn ?? ""),
    ledTotalDr: toNumber(values.ledTotalDr ?? "0", 0),
    ledTotalCr: toNumber(values.ledTotalCr ?? "0", 0),
    ledTotalBalance: toNumber(values.ledTotalBalance ?? "0", 0),
    ledSortOrder: toNullableInt(values.ledSortOrder),
    ledIsActive: (values.ledIsActive ?? "true") === "true",
    ledAllowEdit: (values.ledAllowEdit ?? "false") === "true",
    ledIsEntry: (values.ledIsEntry ?? "false") === "true",
    ledAllowSms: (values.ledAllowSms ?? "false") === "true",
    ledRemarks: toNullableString(values.masterDescription ?? ""),
  };
  if (shouldUpdate && editingItemId !== null) {
    payload.ledId = String(editingItemId);
  }
  // Nested bank accounts. Only attach when at least one non-blank row exists so an
  // empty array is never sent (server treats an absent array as "leave untouched").
  const bankAccounts = buildLedgerBankAccountPayload(bankAccountRows);
  if (bankAccounts.length > 0) {
    payload.ledgerBankAccount = bankAccounts;
  }
  return payload;
}

export function getLedgerValidationError(
  values: LedgerFormValues,
): { fieldName: LedgerFormFieldName; message: string } | null {
  if (!(values.masterName ?? "").trim()) {
    return {
      fieldName: "masterName",
      message: "Ledger Name is required.",
    };
  }
  if (!(values.ledCompanyId ?? "").trim()) {
    return {
      fieldName: "ledCompanyId",
      message: "Company is required.",
    };
  }
  if (!(values.ledBranchId ?? "").trim()) {
    return {
      fieldName: "ledBranchId",
      message: "Branch is required.",
    };
  }
  if (!(values.ledGroupId ?? "").trim()) {
    return {
      fieldName: "ledGroupId",
      message: "Account Group is required.",
    };
  }

  return null;
}
