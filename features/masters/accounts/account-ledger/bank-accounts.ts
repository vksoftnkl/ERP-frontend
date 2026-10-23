import type { ERPDynamicSelectOption } from "@/components/design-system/ui/dynamic-modal-form";
import {
  toDisplayValue,
  getFirstDefinedValue,
  toNullableString,
  toUpperNullable,
} from "./transformers";
// Mirrors the server BankAccountType enum (acc_ledger_bank_accounts.lba_account_type
// is a plain VarChar validated in the app layer). Qt's account popup also offers
// "Fixed Deposit"; the server enum has no such member and refuses it, so it is
// not offered here.
export const BANK_ACCOUNT_TYPE_OPTIONS: ERPDynamicSelectOption[] = [
  { label: "", value: "" },
  { label: "Savings", value: "SAVINGS" },
  { label: "Current", value: "CURRENT" },
  { label: "Cash Credit", value: "CASH_CREDIT" },
  { label: "Overdraft", value: "OVERDRAFT" },
];
const BANK_ACCOUNT_TYPE_VALUES = new Set(
  BANK_ACCOUNT_TYPE_OPTIONS.map((option) => option.value).filter(Boolean),
);
/**
 * A stored account type as the form holds it: a known type as its enum value
 * ("Cash Credit", Qt's word, is CASH_CREDIT), anything else KEPT as stored —
 * the popup offers it as one more choice instead of blanking it (Qt
 * NexBankAccountDialog keeps a stored value outside its list).
 */
export function normalizeBankAccountType(raw: string): string {
  const trimmed = raw.trim();
  const asEnum = trimmed.toUpperCase().replace(/[\s-]+/g, "_");
  return BANK_ACCOUNT_TYPE_VALUES.has(asEnum) ? asEnum : trimmed;
}
/** The popup's choices: the known types, plus a stored one outside them. */
export function bankAccountTypeOptions(current: string): ERPDynamicSelectOption[] {
  const value = current.trim();
  if (!value || BANK_ACCOUNT_TYPE_VALUES.has(value)) {
    return BANK_ACCOUNT_TYPE_OPTIONS;
  }
  return [...BANK_ACCOUNT_TYPE_OPTIONS, { label: value, value }];
}
/** What the list shows for a type: its label, or a kept value as stored. */
export function bankAccountTypeLabel(value: string): string {
  return BANK_ACCOUNT_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}
// One editable bank-account row in the ledger modal. `rowKey` is a stable client-only
// key; `lbaId` is the persisted id (null for rows added in this session).
export type LedgerBankAccountFormRow = {
  rowKey: string;
  lbaId: string | null;
  lbaAccountHolder: string;
  lbaBankName: string;
  lbaBranchName: string;
  lbaAccountNo: string;
  lbaIfscCode: string;
  lbaMicrCode: string;
  lbaAccountType: string;
  lbaUpiId: string;
  lbaChequeName: string;
  lbaIsDefault: boolean;
  lbaIsActive: boolean;
  lbaRemarks: string;
};
// The free-text / select fields rendered as inputs (excludes the boolean toggles and ids).
export type LedgerBankAccountFieldName =
  | "lbaAccountHolder"
  | "lbaBankName"
  | "lbaBranchName"
  | "lbaAccountNo"
  | "lbaIfscCode"
  | "lbaMicrCode"
  | "lbaAccountType"
  | "lbaUpiId"
  | "lbaChequeName"
  | "lbaRemarks";

let bankAccountRowKeySeq = 0;
function nextBankAccountRowKey(): string {
  bankAccountRowKeySeq += 1;
  return `lba-row-${bankAccountRowKeySeq}`;
}
export function createEmptyBankAccountRow(): LedgerBankAccountFormRow {
  return {
    rowKey: nextBankAccountRowKey(),
    lbaId: null,
    lbaAccountHolder: "",
    lbaBankName: "",
    lbaBranchName: "",
    lbaAccountNo: "",
    lbaIfscCode: "",
    lbaMicrCode: "",
    lbaAccountType: "",
    lbaUpiId: "",
    lbaChequeName: "",
    lbaIsDefault: false,
    lbaIsActive: true,
    lbaRemarks: "",
  };
}
function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = toDisplayValue(value).toLowerCase();
  if (["1", "true", "yes", "active"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "inactive"].includes(normalized)) {
    return false;
  }
  return fallback;
}
function readField(source: Record<string, unknown>, camel: string, snake: string): string {
  return toDisplayValue(getFirstDefinedValue(source, [camel, snake]));
}
// Read the nested `ledgerBankAccount` array off a fetched ledger record into editable rows.
export function extractLedgerBankAccountRows(
  source: Record<string, unknown> | null,
): LedgerBankAccountFormRow[] {
  if (!source) {
    return [];
  }
  const raw = getFirstDefinedValue(source, [
    "ledgerBankAccount",
    "ledger_bank_account",
    "bankAccounts",
    "bank_accounts",
  ]);
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter((item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item),
    )
    .map((item) => {
      const accountType = normalizeBankAccountType(
        readField(item, "lbaAccountType", "lba_account_type"),
      );
      return {
        rowKey: nextBankAccountRowKey(),
        lbaId: readField(item, "lbaId", "lba_id") || null,
        lbaAccountHolder: readField(item, "lbaAccountHolder", "lba_account_holder"),
        lbaBankName: readField(item, "lbaBankName", "lba_bank_name"),
        lbaBranchName: readField(item, "lbaBranchName", "lba_branch_name"),
        lbaAccountNo: readField(item, "lbaAccountNo", "lba_account_no"),
        lbaIfscCode: readField(item, "lbaIfscCode", "lba_ifsc_code"),
        lbaMicrCode: readField(item, "lbaMicrCode", "lba_micr_code"),
        lbaAccountType: accountType,
        lbaUpiId: readField(item, "lbaUpiId", "lba_upi_id"),
        lbaChequeName: readField(item, "lbaChequeName", "lba_cheque_name"),
        lbaIsDefault: toBoolean(getFirstDefinedValue(item, ["lbaIsDefault", "lba_is_default"]), false),
        lbaIsActive: toBoolean(getFirstDefinedValue(item, ["lbaIsActive", "lba_is_active"]), true),
        lbaRemarks: readField(item, "lbaRemarks", "lba_remarks"),
      };
    });
}
// A row with no holder, bank, or account number is treated as a blank placeholder and dropped.
function isBlankBankAccountRow(row: LedgerBankAccountFormRow): boolean {
  return (
    !row.lbaAccountHolder.trim() &&
    !row.lbaBankName.trim() &&
    !row.lbaAccountNo.trim()
  );
}
export type LedgerBankAccountRequestItem = {
  lbaId?: string;
  lbaAccountHolder: string;
  lbaBankName: string;
  lbaBranchName: string | null;
  lbaAccountNo: string;
  lbaIfscCode: string | null;
  lbaMicrCode: string | null;
  lbaAccountType: string | null;
  lbaUpiId: string | null;
  lbaChequeName: string | null;
  lbaIsDefault: boolean;
  lbaIsActive: boolean;
  lbaRemarks: string | null;
};
// Map editable rows to the nested `ledgerBankAccount` request items (server injects lbaLedgerId).
export function buildLedgerBankAccountPayload(
  rows: LedgerBankAccountFormRow[],
): LedgerBankAccountRequestItem[] {
  return rows
    .filter((row) => !isBlankBankAccountRow(row))
    .map((row) => {
      // A kept type outside the list goes back as stored, as Qt sends it.
      const accountType = normalizeBankAccountType(row.lbaAccountType);
      const item: LedgerBankAccountRequestItem = {
        lbaAccountHolder: row.lbaAccountHolder.trim(),
        lbaBankName: row.lbaBankName.trim(),
        lbaBranchName: toNullableString(row.lbaBranchName),
        lbaAccountNo: row.lbaAccountNo.trim(),
        lbaIfscCode: toUpperNullable(row.lbaIfscCode),
        lbaMicrCode: toNullableString(row.lbaMicrCode),
        lbaAccountType: accountType || null,
        lbaUpiId: toNullableString(row.lbaUpiId),
        lbaChequeName: toNullableString(row.lbaChequeName),
        lbaIsDefault: row.lbaIsDefault,
        lbaIsActive: row.lbaIsActive,
        lbaRemarks: toNullableString(row.lbaRemarks),
      };
      if (row.lbaId) {
        item.lbaId = row.lbaId;
      }
      return item;
    });
}
// Validate the non-blank rows; mirrors the server's required fields and IFSC length rule.
export function getBankAccountValidationError(
  rows: LedgerBankAccountFormRow[],
): { rowKey: string; field: LedgerBankAccountFieldName; message: string } | null {
  let defaultCount = 0;
  for (const row of rows) {
    if (isBlankBankAccountRow(row)) {
      continue;
    }
    if (row.lbaIsDefault) {
      defaultCount += 1;
    }
    if (!row.lbaAccountHolder.trim()) {
      return { rowKey: row.rowKey, field: "lbaAccountHolder", message: "Account holder is required." };
    }
    if (!row.lbaBankName.trim()) {
      return { rowKey: row.rowKey, field: "lbaBankName", message: "Bank name is required." };
    }
    if (!row.lbaAccountNo.trim()) {
      return { rowKey: row.rowKey, field: "lbaAccountNo", message: "Account number is required." };
    }
    const ifsc = row.lbaIfscCode.trim();
    if (ifsc && ifsc.length !== 11) {
      return { rowKey: row.rowKey, field: "lbaIfscCode", message: "IFSC must be 11 characters." };
    }
  }
  if (defaultCount > 1) {
    const offending = rows.find((row) => !isBlankBankAccountRow(row) && row.lbaIsDefault);
    return {
      rowKey: offending?.rowKey ?? "",
      field: "lbaAccountHolder",
      message: "Only one bank account can be the default.",
    };
  }
  return null;
}
// ── The account popup (Qt NexBankAccountDialog, 4ae6575) ────────────────────
// The table only LISTS the accounts: Add / Edit (or a double-click / Enter on a
// row) open a popup with every field, and OK hands the whole account back.
// Nothing reaches the server from the popup — the accounts are saved with the
// ledger (or supplier), as before.

export type BankAccountListRules = {
  /**
   * A bank-profile ledger's one account, always the default (Qt
   * `NexBankGrid::setSingleMandatory`): Add is off once there is one, and the
   * popup's Default is ticked and locked.
   */
  singleMandatory?: boolean;
};

/** Add: a blank account; the first one starts as the default. */
export function createBankAccountDraft(
  rows: readonly LedgerBankAccountFormRow[],
  { singleMandatory = false }: BankAccountListRules = {},
): LedgerBankAccountFormRow {
  return { ...createEmptyBankAccountRow(), lbaIsDefault: singleMandatory || rows.length === 0 };
}

/** Add is refused once a single-mandatory list holds its one account. */
export function canAddBankAccount(
  rows: readonly LedgerBankAccountFormRow[],
  { singleMandatory = false }: BankAccountListRules = {},
): boolean {
  return !(singleMandatory && rows.length >= 1);
}

export type BankAccountDraftError = {
  field: LedgerBankAccountFieldName;
  message: string;
};

/**
 * OK in the popup: the three required fields, in the popup's order, in Qt's
 * words ("Enter the …"); then the IFSC length the server holds it to.
 */
export function validateBankAccountDraft(row: LedgerBankAccountFormRow): BankAccountDraftError | null {
  const required: Array<[LedgerBankAccountFieldName, string]> = [
    ["lbaAccountNo", "account number"],
    ["lbaAccountHolder", "account holder"],
    ["lbaBankName", "bank name"],
  ];
  for (const [field, name] of required) {
    if (!row[field].trim()) {
      return { field, message: `Enter the ${name}.` };
    }
  }
  const ifsc = row.lbaIfscCode.trim();
  if (ifsc && ifsc.length !== 11) {
    return { field: "lbaIfscCode", message: "IFSC must be 11 characters." };
  }
  return null;
}

/** What OK hands back: trimmed, IFSC upper case, a locked default kept on. */
export function finishBankAccountDraft(
  row: LedgerBankAccountFormRow,
  { singleMandatory = false }: BankAccountListRules = {},
): LedgerBankAccountFormRow {
  return {
    ...row,
    lbaAccountNo: row.lbaAccountNo.trim(),
    lbaAccountHolder: row.lbaAccountHolder.trim(),
    lbaBankName: row.lbaBankName.trim(),
    lbaBranchName: row.lbaBranchName.trim(),
    lbaIfscCode: row.lbaIfscCode.trim().toUpperCase(),
    lbaMicrCode: row.lbaMicrCode.trim(),
    lbaAccountType: row.lbaAccountType.trim(),
    lbaUpiId: row.lbaUpiId.trim(),
    lbaChequeName: row.lbaChequeName.trim(),
    lbaRemarks: row.lbaRemarks.trim(),
    lbaIsDefault: singleMandatory || row.lbaIsDefault,
  };
}

/**
 * An account back from the popup onto the list: replaces its row (same
 * `rowKey`) or joins the end. One default: an account ticked Default clears it
 * on every other row.
 */
export function commitBankAccountRow(
  rows: readonly LedgerBankAccountFormRow[],
  row: LedgerBankAccountFormRow,
): LedgerBankAccountFormRow[] {
  const exists = rows.some((current) => current.rowKey === row.rowKey);
  const next = exists
    ? rows.map((current) => (current.rowKey === row.rowKey ? row : current))
    : [...rows, row];
  if (!row.lbaIsDefault) {
    return next;
  }
  return next.map((current) =>
    current.rowKey === row.rowKey || !current.lbaIsDefault
      ? current
      : { ...current, lbaIsDefault: false },
  );
}
