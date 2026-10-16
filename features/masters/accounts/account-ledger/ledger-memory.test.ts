import { describe, expect, it } from "vitest";
import { createEmptyBankAccountRow } from "./bank-accounts";
import { createInitialLedgerFormValues } from "./form-builder";
import {
  bankAccountsChanged,
  isLedgerEntryWorthRemembering,
  ledgerValuesChanged,
} from "./ledger-memory";

function entry(overrides: Partial<Parameters<typeof isLedgerEntryWorthRemembering>[0]> = {}) {
  const values = createInitialLedgerFormValues();
  return {
    open: true,
    mode: "create" as const,
    formValues: values,
    openingValues: values,
    bankAccounts: [],
    openingBankAccounts: [],
    ...overrides,
  };
}

describe("screen memory", () => {
  it("tells a typed change from none, leaving out the derived Ledger Type", () => {
    const opening = createInitialLedgerFormValues();
    expect(ledgerValuesChanged({ ...opening }, opening)).toBe(false);
    expect(ledgerValuesChanged({ ...opening, masterName: "CASH IN HAND" }, opening)).toBe(true);
    // The group profile resolving after a load rewrites the Ledger Type.
    expect(ledgerValuesChanged({ ...opening, ledLedgerType: "PARTY" }, opening)).toBe(false);
  });

  it("tells a bank-account edit from a re-keyed copy of the same rows", () => {
    const row = { ...createEmptyBankAccountRow(), lbaId: "lba-1", lbaBankName: "SBI" };
    expect(bankAccountsChanged([], [])).toBe(false);
    expect(bankAccountsChanged([{ ...row, rowKey: "other" }], [row])).toBe(false);
    expect(bankAccountsChanged([{ ...row, lbaIfscCode: "SBIN0000001" }], [row])).toBe(true);
    expect(bankAccountsChanged([row, createEmptyBankAccountRow()], [row])).toBe(true);
    expect(bankAccountsChanged([], [row])).toBe(true);
  });

  it("keeps the popup only while it is open in Create or Edit with a change", () => {
    const opening = createInitialLedgerFormValues();
    const typed = { ...opening, masterName: "CASH IN HAND" };
    expect(isLedgerEntryWorthRemembering(entry())).toBe(false);
    expect(isLedgerEntryWorthRemembering(entry({ formValues: typed }))).toBe(true);
    expect(isLedgerEntryWorthRemembering(entry({ mode: "update", formValues: typed }))).toBe(true);
    // Closed (saved, cancelled) or read-only: nothing to bring back.
    expect(isLedgerEntryWorthRemembering(entry({ open: false, formValues: typed }))).toBe(false);
    expect(isLedgerEntryWorthRemembering(entry({ mode: "view", formValues: typed }))).toBe(false);
    // A bank account added on its own is a change.
    expect(
      isLedgerEntryWorthRemembering(entry({ bankAccounts: [createEmptyBankAccountRow()] })),
    ).toBe(true);
  });
});
