// Screen memory (lib/screen-memory) for the Account Ledger popup: a ledger left
// open with unsaved changes when the operator went to another menu screen comes
// back open on those changes.
import type { ERPDynamicSelectOption } from "@/components/design-system/ui/dynamic-modal-form";
import type { ScreenScope } from "@/lib/screen-memory";
import type { LedgerBankAccountFormRow } from "./bank-accounts";
import { LEDGER_DERIVED_LOCKED_FIELDS, type LedgerProfile } from "./profile";
import type { LedgerFormFieldName, LedgerFormValues, ModalMode } from "./types";

// The slot an unsaved ledger waits in.
export const ACCOUNT_LEDGER_MEMORY_KEY = "masters/account-ledger";

// The lazy dropdowns' option lists as they stood. A select only shows a label for
// a value found in its options, and these are fetched on open, so a restored
// company / group / state / tax id would otherwise show blank.
export type LedgerDropdownOptions = {
  company: ERPDynamicSelectOption[];
  branch: ERPDynamicSelectOption[];
  accountGroup: ERPDynamicSelectOption[];
  stateName: ERPDynamicSelectOption[];
  taxRate: ERPDynamicSelectOption[];
  stateCodeByName: Record<string, string>;
  stateNameByCode: Record<string, string>;
};

export type LedgerEntrySnapshot = {
  // The header's tenant when it was taken.
  tenant: ScreenScope;
  open: boolean;
  mode: ModalMode;
  editingId: string | number | null;
  formValues: LedgerFormValues;
  // What the popup opened on: the loaded record, or the create defaults.
  openingValues: LedgerFormValues;
  activeSection: string;
  // The group's profile: it decides which tabs show, so it comes back with the tab.
  profile: LedgerProfile;
  bankAccounts: LedgerBankAccountFormRow[];
  openingBankAccounts: LedgerBankAccountFormRow[];
  removedBankAccountIds: string[];
  options: LedgerDropdownOptions;
};

// Whether the operator changed a field. Fields the form derives from the group
// (Ledger Type) are left out: they move when the profile resolves after a load,
// and a changed group already counts on its own.
export function ledgerValuesChanged(
  current: LedgerFormValues,
  opening: LedgerFormValues,
): boolean {
  return (Object.keys(current) as LedgerFormFieldName[]).some(
    (fieldName) =>
      !LEDGER_DERIVED_LOCKED_FIELDS.has(fieldName) &&
      (current[fieldName] ?? "") !== (opening[fieldName] ?? ""),
  );
}

// Whether the bank-account grid differs from what it opened on: a row added or
// removed, or any field edited. The client-only row key is not data.
export function bankAccountsChanged(
  current: readonly LedgerBankAccountFormRow[],
  opening: readonly LedgerBankAccountFormRow[],
): boolean {
  if (current.length !== opening.length) {
    return true;
  }
  return current.some((row, index) => {
    const before = opening[index];
    return (Object.keys(row) as Array<keyof LedgerBankAccountFormRow>).some(
      (field) => field !== "rowKey" && row[field] !== before[field],
    );
  });
}

// Kept while the popup is open in Create or Edit and holds a change; a save, a
// Cancel / close, or typing the values back lets it go.
export function isLedgerEntryWorthRemembering(
  snapshot: Pick<
    LedgerEntrySnapshot,
    "open" | "mode" | "formValues" | "openingValues" | "bankAccounts" | "openingBankAccounts"
  >,
): boolean {
  if (!snapshot.open || snapshot.mode === "view") {
    return false;
  }
  return (
    ledgerValuesChanged(snapshot.formValues, snapshot.openingValues) ||
    bankAccountsChanged(snapshot.bankAccounts, snapshot.openingBankAccounts)
  );
}
