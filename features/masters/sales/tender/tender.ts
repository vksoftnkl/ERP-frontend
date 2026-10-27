import type { ERPDynamicModalField, ERPDynamicSelectOption } from "@/components/design-system/ui/dynamic-modal-form";
import { extractRows } from "@/features/masters/shared/normalizers";
import {
  getFirstDefinedValue,
  toDateInputValue,
  toDisplayValue,
  toNonNegativeInteger,
  toNonNegativeNumber,
  toNullableDate,
  toNullableNumber,
  toNullableString,
  toSelectBoolean,
  toUpdateId,
} from "@/features/masters/shared/value-mappers";

export const LOOKUP_KEYS = {
  id: ["tndId", "tnd_id", "id", "_id"],
  code: ["tndDisplayPosition", "tnd_display_position", "position", "sort"],
  name: ["tndName", "tnd_name", "name"],
  short: ["tndMinAmount", "tnd_min_amount", "minAmount", "min_amount"],
  alias: ["tndName", "tnd_name", "name", "alias"],
  active: ["tndIsActive", "tnd_is_active", "isActive", "is_active", "status"],
  position: ["tndDisplayPosition", "tnd_display_position", "position", "sort"],
  description: ["tndRemarks", "tnd_remarks", "description", "remarks"],
  array: ["data", "items", "results", "rows", "list", "tenders", "tenderMasters"],
} as const;
const TENDER_COMPANY_ID_KEYS = ["tndCompanyId", "tnd_company_id", "companyId", "company_id"] as const;
const TENDER_BRANCH_ID_KEYS = ["tndBranchId", "tnd_branch_id", "branchId", "branch_id"] as const;
const TENDER_TYPE_ID_KEYS = ["tndTypeId", "tnd_type_id", "typeId", "type_id"] as const;
const TENDER_SHORT_NAME_KEYS = ["tndShortName", "tnd_short_name", "shortName", "short"] as const;
const TENDER_LEDGER_ID_KEYS = ["tndLedgerId", "tnd_ledger_id", "ledgerId", "ledger_id"] as const;
const TENDER_SETTLEMENT_LEDGER_ID_KEYS = [
  "tndSettlementLedgerId",
  "tnd_settlement_ledger_id",
] as const;
const TENDER_SETTLEMENT_DAYS_KEYS = ["tndSettlementDays", "tnd_settlement_days"] as const;
const TENDER_BANK_ACCOUNT_ID_KEYS = ["tndBankAccountId", "tnd_bank_account_id"] as const;
const TENDER_MIN_AMOUNT_KEYS = ["tndMinAmount", "tnd_min_amount", "minAmount", "min_amount"] as const;
const TENDER_MAX_AMOUNT_KEYS = ["tndMaxAmount", "tnd_max_amount", "maxAmount", "max_amount"] as const;
const TENDER_DAILY_LIMIT_KEYS = ["tndDailyLimit", "tnd_daily_limit", "dailyLimit"] as const;
const TENDER_SURCHARGE_KEYS = ["tndSurchargePerc", "tnd_surcharge_perc", "surchargePerc"] as const;
const TENDER_SURCHARGE_AMOUNT_KEYS = ["tndSurchargeAmount", "tnd_surcharge_amount"] as const;
const TENDER_SURCHARGE_LEDGER_ID_KEYS = ["tndSurchargeLedgerId", "tnd_surcharge_ledger_id"] as const;
const TENDER_IS_ACTIVE_KEYS = ["tndIsActive", "tnd_is_active", "isActive", "is_active"] as const;
const TENDER_EDIT_SURCHARGE_KEYS = [
  "tndEditSurcharge",
  "tnd_edit_surcharge",
  "editSurcharge",
] as const;
const TENDER_EDIT_LEDGER_KEYS = ["tndEditLedger", "tnd_edit_ledger", "editLedger"] as const;
const TENDER_UPI_VPA_KEYS = ["tndUpiVpa", "tnd_upi_vpa", "upiVpa"] as const;
const TENDER_UPI_QR_KEYS = ["tndUpiQrPayload", "tnd_upi_qr_payload"] as const;
const TENDER_MERCHANT_ID_KEYS = ["tndMerchantId", "tnd_merchant_id", "merchantId"] as const;
const TENDER_TERMINAL_ID_KEYS = ["tndTerminalId", "tnd_terminal_id", "terminalId"] as const;
const TENDER_CONVERSION_RATE_KEYS = ["tndConversionRate", "tnd_conversion_rate"] as const;
const TENDER_NEEDS_REF_KEYS = ["tndNeedsRef", "tnd_needs_ref"] as const;
const TENDER_ALLOW_CHANGE_KEYS = ["tndAllowChange", "tnd_allow_change"] as const;
const TENDER_ALLOW_IN_RETURN_KEYS = ["tndAllowInReturn", "tnd_allow_in_return"] as const;
const TENDER_OPEN_CASH_DRAWER_KEYS = ["tndOpenCashDrawer", "tnd_open_cash_drawer"] as const;
const TENDER_IS_DEFAULT_KEYS = ["tndIsDefault", "tnd_is_default"] as const;
const TENDER_HOTKEY_KEYS = ["tndHotkey", "tnd_hotkey", "hotkey"] as const;
const TENDER_COLOUR_KEYS = ["tndColour", "tnd_colour", "colour", "color"] as const;
const TENDER_EFFECTIVE_FROM_KEYS = ["tndEffectiveFrom", "tnd_effective_from"] as const;
const TENDER_EFFECTIVE_TO_KEYS = ["tndEffectiveTo", "tnd_effective_to"] as const;
const LOOKUP_ARRAY_KEYS = ["items", "data", "results", "rows", "list"] as const;
export const DEFAULT_TENDER_TYPE_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Tender Type",
};
export const DEFAULT_LEDGER_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Account Ledger",
};
export const DEFAULT_COMPANY_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Company",
};
// tnd_branch_id is nullable — a blank selection makes the tender company-wide.
export const DEFAULT_BRANCH_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "All Branches",
};
export const DEFAULT_BANK_ACCOUNT_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "Select Bank Account",
};
const OPTIONAL_LEDGER_OPTION: ERPDynamicSelectOption = {
  value: "",
  label: "None",
};
const STATUS_OPTIONS: ERPDynamicSelectOption[] = [
  { label: "Active", value: "true" },
  { label: "Inactive", value: "false" },
];
const YES_NO_OPTIONS: ERPDynamicSelectOption[] = [
  { label: "Yes", value: "true" },
  { label: "No", value: "false" },
];
export const TENDER_INITIAL_FORM_VALUES = {
  masterName: "",
  tndCompanyId: "",
  tndBranchId: "",
  tndTypeId: "",
  tndShortName: "",
  tndLedgerId: "",
  tndSettlementLedgerId: "",
  tndSettlementDays: "0",
  tndBankAccountId: "",
  tndMinAmount: "0",
  tndMaxAmount: "",
  tndDailyLimit: "",
  tndSurchargePerc: "0",
  tndSurchargeAmount: "0",
  tndSurchargeLedgerId: "",
  tndEditSurcharge: "false",
  tndEditLedger: "false",
  tndUpiVpa: "",
  tndUpiQrPayload: "",
  tndMerchantId: "",
  tndTerminalId: "",
  tndConversionRate: "1",
  tndNeedsRef: "",
  tndAllowChange: "",
  tndAllowInReturn: "",
  tndOpenCashDrawer: "false",
  tndIsDefault: "false",
  position: "0",
  tndHotkey: "",
  tndColour: "",
  tndEffectiveFrom: "",
  tndEffectiveTo: "",
  tndIsActive: "true",
  masterDescription: "",
} as const;
export function buildTenderFormFields(
  tenderTypeOptions: ERPDynamicSelectOption[],
  ledgerOptions: ERPDynamicSelectOption[],
  companyOptions: ERPDynamicSelectOption[],
  branchOptions: ERPDynamicSelectOption[],
  bankAccountOptions: ERPDynamicSelectOption[],
): ERPDynamicModalField[] {
  // The settlement/surcharge ledgers point at the same master as the posting
  // ledger, but are optional — swap the "Select…" placeholder for "None".
  const optionalLedgerOptions = [
    OPTIONAL_LEDGER_OPTION,
    ...ledgerOptions.filter((option) => option.value !== ""),
  ];
  // Column span inside each tab's 12-column grid: every label/control pair spans
  // 6 so two pairs sit per row, the way the legacy dialog lays them out. The two
  // textareas use `colSpan: 2` (full width) instead.
  const span = (columns: number) => ({
    fieldStyle: { gridColumn: `span ${columns}` },
  });
  // The payment-integration block only applies to a UPI tender: the ids come from
  // the tender-type lookup, so the match is on the option label rather than a
  // hardcoded id. Until the lookup resolves the set is empty and the block stays
  // disabled, which is the same state a non-UPI tender leaves it in.
  const upiTenderTypeIds = new Set(
    tenderTypeOptions
      .filter((option) => option.value !== "" && /upi/i.test(option.label))
      .map((option) => option.value),
  );
  const upiOnly = {
    disabledWhen: (values: Record<string, string>) =>
      !upiTenderTypeIds.has((values.tndTypeId ?? "").trim()),
  } as const;
  // Checkboxes are placed on an explicit column so each caption starts at the left
  // edge of its own half-row, the way the legacy dialog draws them (see
  // tender-modal.module.scss for the gutter the shared skin would otherwise add).
  const checkboxAt = (start: number) => ({
    fieldStyle: { gridColumnStart: start, gridColumnEnd: "span 6" },
  });
  // Columns the legacy dialog does not surface. They stay in the field list — and
  // therefore in the modal's form state — so an edit round-trips their stored
  // values instead of blanking them on save; they are just never rendered.
  const hidden = { visibleWhen: () => false } as const;
  return [
    // ── Tender tab ────────────────────────────────────────────────
    {
      name: "tenderSection",
      label: "Tender",
      type: "heading",
      sectionGridColumns: 12,
    },
    {
      name: "tndCompanyId",
      label: "Company",
      type: "select",
      searchable: true,
      required: true,
      options: companyOptions,
      ...span(6),
      validation: {
        requiredMessage: "Company is required.",
      },
    },
    {
      name: "tndBranchId",
      label: "Branch",
      type: "select",
      searchable: true,
      options: branchOptions,
      ...span(6),
    },
    {
      name: "tndTypeId",
      label: "Tender Type",
      type: "select",
      searchable: true,
      required: true,
      options: tenderTypeOptions,
      ...span(6),
      validation: {
        requiredMessage: "Tender Type is required.",
      },
    },
    {
      name: "tndLedgerId",
      label: "Posting Ledger",
      type: "select",
      searchable: true,
      required: true,
      options: ledgerOptions,
      ...span(6),
      validation: {
        requiredMessage: "Posting Ledger is required.",
      },
    },
    {
      name: "masterName",
      label: "Tender Name",
      required: true,
      placeholder: "e.g. HDFC Card, GPay QR",
      ...span(6),
      validation: {
        minLength: 2,
        minLengthMessage: "Tender Name must be at least 2 characters.",
      },
    },
    {
      name: "tndShortName",
      label: "Short Name",
      required: true,
      placeholder: "shown on the tender screen",
      ...span(6),
      validation: {
        requiredMessage: "Short Name is required.",
        maxLength: 30,
        maxLengthMessage: "Short Name must be 30 characters or fewer.",
      },
    },
    {
      name: "displayStatusSubheading",
      label: "Display && Status",
      type: "subheading",
    },
    {
      name: "position",
      label: "Display Position",
      type: "number",
      min: 0,
      step: 1,
      ...span(6),
      validation: {
        minMessage: "Display Position must be 0 or greater.",
      },
    },
    {
      name: "tndIsDefault",
      label: "Default tender on the settle screen",
      type: "checkbox",
      options: YES_NO_OPTIONS,
      ...checkboxAt(7),
    },
    {
      name: "tndEditLedger",
      label: "Cashier may change the ledger",
      type: "checkbox",
      options: YES_NO_OPTIONS,
      ...checkboxAt(1),
    },
    {
      name: "tndIsActive",
      label: "Active",
      type: "checkbox",
      options: STATUS_OPTIONS,
      ...checkboxAt(7),
    },
    {
      name: "limitsSubheading",
      label: "Limits && Surcharge",
      type: "subheading",
    },
    {
      name: "tndMinAmount",
      label: "Minimum Amount",
      type: "number",
      required: true,
      min: 0,
      step: "0.01",
      ...span(6),
      validation: {
        requiredMessage: "Minimum Amount is required.",
        minMessage: "Minimum Amount must be 0 or greater.",
      },
    },
    {
      name: "tndMaxAmount",
      label: "Maximum Amount",
      type: "number",
      min: 0,
      step: "0.01",
      placeholder: "blank = no limit",
      ...span(6),
      validation: {
        minMessage: "Maximum Amount must be 0 or greater.",
        custom: (value, values) => {
          const trimmedValue = value.trim();
          if (!trimmedValue) {
            return null;
          }
          const maxAmount = Number(trimmedValue);
          if (!Number.isFinite(maxAmount)) {
            return "Maximum Amount must be a valid number.";
          }
          const minAmount = Number((values.tndMinAmount ?? "").trim());
          if (!Number.isFinite(minAmount)) {
            return null;
          }
          if (maxAmount < minAmount) {
            return "Maximum Amount must be greater than or equal to Minimum Amount.";
          }
          return null;
        },
      },
    },
    {
      name: "tndDailyLimit",
      label: "Daily Limit",
      type: "number",
      min: 0,
      step: "0.01",
      placeholder: "blank = no limit",
      ...span(6),
      validation: {
        minMessage: "Daily Limit must be 0 or greater.",
      },
    },
    {
      name: "tndConversionRate",
      label: "Conversion Rate",
      type: "number",
      min: "0.0001",
      step: "0.0001",
      ...span(6),
      validation: {
        custom: (value) => {
          const trimmedValue = value.trim();
          if (!trimmedValue) {
            return null;
          }
          const rate = Number(trimmedValue);
          if (!Number.isFinite(rate)) {
            return "Conversion Rate must be a valid number.";
          }
          if (rate <= 0) {
            return "Conversion Rate must be greater than 0.";
          }
          return null;
        },
      },
    },
    {
      name: "surchargeSubheading",
      label: "Surcharge",
      type: "subheading",
    },
    {
      name: "tndSurchargePerc",
      label: "Surcharge %",
      type: "number",
      min: 0,
      max: 100,
      step: "0.001",
      ...span(6),
      validation: {
        minMessage: "Surcharge % must be 0 or greater.",
        maxMessage: "Surcharge % must be 100 or less.",
      },
    },
    {
      name: "tndSurchargeAmount",
      label: "Surcharge Amount",
      type: "number",
      min: 0,
      step: "0.01",
      ...span(6),
      validation: {
        minMessage: "Surcharge Amount must be 0 or greater.",
      },
    },
    {
      name: "tndSurchargeLedgerId",
      label: "Surcharge Ledger",
      type: "select",
      searchable: true,
      options: optionalLedgerOptions,
      ...span(6),
    },
    {
      name: "tndEditSurcharge",
      label: "Cashier may edit the surcharge",
      type: "checkbox",
      options: YES_NO_OPTIONS,
      ...checkboxAt(7),
    },
    // ── Payment & Behaviour tab ───────────────────────────────────
    {
      name: "paymentSection",
      label: "Payment & Behaviour",
      type: "heading",
      sectionGridColumns: 12,
    },
    {
      name: "tndUpiVpa",
      label: "UPI VPA",
      placeholder: "name@bank",
      ...span(6),
      ...upiOnly,
      validation: {
        maxLength: 100,
        maxLengthMessage: "UPI VPA must be 100 characters or fewer.",
      },
    },
    {
      name: "tndMerchantId",
      label: "Merchant ID",
      ...span(6),
      ...upiOnly,
      validation: {
        maxLength: 50,
        maxLengthMessage: "Merchant ID must be 50 characters or fewer.",
      },
    },
    {
      name: "tndTerminalId",
      label: "Terminal ID",
      ...span(6),
      ...upiOnly,
      validation: {
        maxLength: 50,
        maxLengthMessage: "Terminal ID must be 50 characters or fewer.",
      },
    },
    {
      name: "tndUpiQrPayload",
      label: "UPI QR Payload",
      type: "textarea",
      rows: 3,
      colSpan: 2,
      ...upiOnly,
    },
    {
      name: "behaviourSubheading",
      label: "Behaviour",
      type: "subheading",
    },
    // The three flags below stay tri-state underneath: an untouched checkbox keeps
    // the stored "" (null), which the POS reads as "inherit the tender type's own
    // flag". Ticking/unticking pins an explicit true/false.
    {
      name: "tndNeedsRef",
      label: "Reference no is mandatory (card / UPI txn)",
      type: "checkbox",
      ...checkboxAt(1),
    },
    {
      name: "tndAllowChange",
      label: "Can give change back (cash-like)",
      type: "checkbox",
      ...checkboxAt(7),
    },
    {
      name: "tndAllowInReturn",
      label: "Usable for refunds on sales returns",
      type: "checkbox",
      ...checkboxAt(1),
    },
    {
      name: "tndOpenCashDrawer",
      label: "Open the cash drawer",
      type: "checkbox",
      options: YES_NO_OPTIONS,
      ...checkboxAt(7),
    },
    {
      name: "remarksSubheading",
      label: "Remarks",
      type: "subheading",
    },
    {
      name: "masterDescription",
      label: "Remarks",
      type: "textarea",
      rows: 3,
      colSpan: 2,
    },
    {
      name: "tndSettlementLedgerId",
      label: "Settlement Ledger",
      type: "select",
      searchable: true,
      options: optionalLedgerOptions,
      ...hidden,
    },
    {
      name: "tndSettlementDays",
      label: "Settlement Days",
      type: "number",
      min: 0,
      max: 90,
      step: 1,
      ...hidden,
    },
    {
      name: "tndBankAccountId",
      label: "Bank Account",
      type: "select",
      searchable: true,
      options: bankAccountOptions,
      ...hidden,
    },
    {
      name: "tndHotkey",
      label: "Hotkey",
      ...hidden,
    },
    {
      name: "tndColour",
      label: "Colour",
      type: "color",
      ...hidden,
    },
    {
      name: "tndEffectiveFrom",
      label: "Effective From",
      type: "date",
      ...hidden,
    },
    {
      name: "tndEffectiveTo",
      label: "Effective To",
      type: "date",
      ...hidden,
    },
  ];
}
// "" on a tri-state select means "inherit from the tender type", which the API
// takes as null — distinct from an explicit false.
export function toTriStateSelect(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  return toSelectBoolean(value, "false");
}
export function toNullableBoolean(value: string): boolean | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  return normalized === "true";
}
export function buildLookupOptions(
  payload: unknown,
  defaultOption: ERPDynamicSelectOption,
): ERPDynamicSelectOption[] {
  const optionMap = new Map<string, string>();
  const rows = extractRows(payload, LOOKUP_ARRAY_KEYS);
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const source = row as Record<string, unknown>;
    const id = toDisplayValue(getFirstDefinedValue(source, ["id", "value"]));
    if (!id) {
      continue;
    }
    const name = toDisplayValue(getFirstDefinedValue(source, ["name", "label"]));
    if (!name) {
      continue;
    }
    if (!optionMap.has(id)) {
      optionMap.set(id, name);
    }
  }
  const options = Array.from(optionMap.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label));
  return [defaultOption, ...options];
}
export function mapTenderFormValues({
  source,
  defaults,
}: {
  source: Record<string, unknown> | null;
  defaults: Record<string, string>;
}): Record<string, string> {
    const rowSource = source ?? {};
    const mergedDefaults = { ...TENDER_INITIAL_FORM_VALUES, ...defaults };
    return {
      ...TENDER_INITIAL_FORM_VALUES,
      masterName:
        toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) || mergedDefaults.masterName,
      tndCompanyId:
        toDisplayValue(getFirstDefinedValue(rowSource, TENDER_COMPANY_ID_KEYS)) ||
        mergedDefaults.tndCompanyId,
      tndBranchId:
        toDisplayValue(getFirstDefinedValue(rowSource, TENDER_BRANCH_ID_KEYS)) ||
        mergedDefaults.tndBranchId,
      tndTypeId:
        toDisplayValue(getFirstDefinedValue(rowSource, TENDER_TYPE_ID_KEYS)) ||
        mergedDefaults.tndTypeId,
      tndShortName:
        toDisplayValue(getFirstDefinedValue(rowSource, TENDER_SHORT_NAME_KEYS)) ||
        mergedDefaults.tndShortName,
      tndLedgerId:
        toDisplayValue(getFirstDefinedValue(rowSource, TENDER_LEDGER_ID_KEYS)) ||
        mergedDefaults.tndLedgerId,
      tndSettlementLedgerId: toDisplayValue(
        getFirstDefinedValue(rowSource, TENDER_SETTLEMENT_LEDGER_ID_KEYS),
      ),
      tndSettlementDays:
        toDisplayValue(getFirstDefinedValue(rowSource, TENDER_SETTLEMENT_DAYS_KEYS)) ||
        mergedDefaults.tndSettlementDays,
      tndBankAccountId: toDisplayValue(
        getFirstDefinedValue(rowSource, TENDER_BANK_ACCOUNT_ID_KEYS),
      ),
      tndMinAmount:
        toDisplayValue(getFirstDefinedValue(rowSource, TENDER_MIN_AMOUNT_KEYS)) ||
        mergedDefaults.tndMinAmount,
      tndMaxAmount: toDisplayValue(getFirstDefinedValue(rowSource, TENDER_MAX_AMOUNT_KEYS)),
      tndDailyLimit: toDisplayValue(getFirstDefinedValue(rowSource, TENDER_DAILY_LIMIT_KEYS)),
      tndSurchargePerc:
        toDisplayValue(getFirstDefinedValue(rowSource, TENDER_SURCHARGE_KEYS)) ||
        mergedDefaults.tndSurchargePerc,
      tndSurchargeAmount:
        toDisplayValue(getFirstDefinedValue(rowSource, TENDER_SURCHARGE_AMOUNT_KEYS)) ||
        mergedDefaults.tndSurchargeAmount,
      tndSurchargeLedgerId: toDisplayValue(
        getFirstDefinedValue(rowSource, TENDER_SURCHARGE_LEDGER_ID_KEYS),
      ),
      tndEditSurcharge: toSelectBoolean(
        getFirstDefinedValue(rowSource, TENDER_EDIT_SURCHARGE_KEYS),
        "false",
      ),
      tndEditLedger: toSelectBoolean(
        getFirstDefinedValue(rowSource, TENDER_EDIT_LEDGER_KEYS),
        "false",
      ),
      tndUpiVpa: toDisplayValue(getFirstDefinedValue(rowSource, TENDER_UPI_VPA_KEYS)),
      tndUpiQrPayload: toDisplayValue(getFirstDefinedValue(rowSource, TENDER_UPI_QR_KEYS)),
      tndMerchantId: toDisplayValue(getFirstDefinedValue(rowSource, TENDER_MERCHANT_ID_KEYS)),
      tndTerminalId: toDisplayValue(getFirstDefinedValue(rowSource, TENDER_TERMINAL_ID_KEYS)),
      tndConversionRate:
        toDisplayValue(getFirstDefinedValue(rowSource, TENDER_CONVERSION_RATE_KEYS)) ||
        mergedDefaults.tndConversionRate,
      tndNeedsRef: toTriStateSelect(getFirstDefinedValue(rowSource, TENDER_NEEDS_REF_KEYS)),
      tndAllowChange: toTriStateSelect(
        getFirstDefinedValue(rowSource, TENDER_ALLOW_CHANGE_KEYS),
      ),
      tndAllowInReturn: toTriStateSelect(
        getFirstDefinedValue(rowSource, TENDER_ALLOW_IN_RETURN_KEYS),
      ),
      tndOpenCashDrawer: toSelectBoolean(
        getFirstDefinedValue(rowSource, TENDER_OPEN_CASH_DRAWER_KEYS),
        "false",
      ),
      tndIsDefault: toSelectBoolean(
        getFirstDefinedValue(rowSource, TENDER_IS_DEFAULT_KEYS),
        "false",
      ),
      position:
        toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.position)) || mergedDefaults.position,
      tndHotkey: toDisplayValue(getFirstDefinedValue(rowSource, TENDER_HOTKEY_KEYS)),
      tndColour: toDisplayValue(getFirstDefinedValue(rowSource, TENDER_COLOUR_KEYS)),
      tndEffectiveFrom: toDateInputValue(
        getFirstDefinedValue(rowSource, TENDER_EFFECTIVE_FROM_KEYS),
      ),
      tndEffectiveTo: toDateInputValue(
        getFirstDefinedValue(rowSource, TENDER_EFFECTIVE_TO_KEYS),
      ),
      tndIsActive: toSelectBoolean(getFirstDefinedValue(rowSource, TENDER_IS_ACTIVE_KEYS), "true"),
      masterDescription:
        toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.description)) ||
        mergedDefaults.masterDescription,
    };
}
export function buildTenderRequestPayload({
  values,
  shouldUpdate,
  editingItemId,
}: {
  values: Record<string, string>;
  shouldUpdate: boolean;
  editingItemId: string | number | null;
}): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      tndCompanyId: (values.tndCompanyId ?? "").trim(),
      // Blank branch = company-wide, which the API stores as NULL.
      tndBranchId: toNullableString(values.tndBranchId ?? ""),
      tndTypeId: (values.tndTypeId ?? "").trim(),
      tndName: (values.masterName ?? "").trim(),
      tndShortName: (values.tndShortName ?? "").trim(),
      tndLedgerId: (values.tndLedgerId ?? "").trim(),
      tndSettlementLedgerId: toNullableString(values.tndSettlementLedgerId ?? ""),
      tndSettlementDays: toNonNegativeInteger(values.tndSettlementDays ?? "0", 0),
      tndBankAccountId: toNullableString(values.tndBankAccountId ?? ""),
      tndMinAmount: toNonNegativeNumber(values.tndMinAmount ?? "0", 0),
      tndMaxAmount: toNullableNumber(values.tndMaxAmount ?? ""),
      tndDailyLimit: toNullableNumber(values.tndDailyLimit ?? ""),
      tndSurchargePerc: toNonNegativeNumber(values.tndSurchargePerc ?? "0", 0),
      tndSurchargeAmount: toNonNegativeNumber(values.tndSurchargeAmount ?? "0", 0),
      tndSurchargeLedgerId: toNullableString(values.tndSurchargeLedgerId ?? ""),
      tndEditSurcharge: (values.tndEditSurcharge ?? "false") === "true",
      tndEditLedger: (values.tndEditLedger ?? "false") === "true",
      tndUpiVpa: toNullableString(values.tndUpiVpa ?? ""),
      tndUpiQrPayload: toNullableString(values.tndUpiQrPayload ?? ""),
      tndMerchantId: toNullableString(values.tndMerchantId ?? ""),
      tndTerminalId: toNullableString(values.tndTerminalId ?? ""),
      tndConversionRate: toNonNegativeNumber(values.tndConversionRate ?? "1", 1),
      // null on these three = inherit the tender type's flag.
      tndNeedsRef: toNullableBoolean(values.tndNeedsRef ?? ""),
      tndAllowChange: toNullableBoolean(values.tndAllowChange ?? ""),
      tndAllowInReturn: toNullableBoolean(values.tndAllowInReturn ?? ""),
      tndOpenCashDrawer: (values.tndOpenCashDrawer ?? "false") === "true",
      tndIsDefault: (values.tndIsDefault ?? "false") === "true",
      tndDisplayPosition: toNonNegativeInteger(values.position ?? "0", 0),
      tndHotkey: toNullableString(values.tndHotkey ?? ""),
      tndColour: toNullableString(values.tndColour ?? ""),
      tndEffectiveFrom: toNullableDate(values.tndEffectiveFrom ?? ""),
      tndEffectiveTo: toNullableDate(values.tndEffectiveTo ?? ""),
      tndIsActive: (values.tndIsActive ?? "true") === "true",
      tndRemarks: toNullableString(values.masterDescription ?? ""),
    };
    // tndShortName is optional server-side and derived from the name when
    // absent — send it only when the user actually typed one.
    if (!payload.tndShortName) {
      delete payload.tndShortName;
    }
    if (shouldUpdate && editingItemId !== null) {
      payload.tndId = toUpdateId(editingItemId);
    }
    return payload;
}
