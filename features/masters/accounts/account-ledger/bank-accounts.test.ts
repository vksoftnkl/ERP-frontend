import { describe, expect, it } from "vitest";
import {
  bankAccountTypeLabel,
  bankAccountTypeOptions,
  buildLedgerBankAccountPayload,
  canAddBankAccount,
  commitBankAccountRow,
  createBankAccountDraft,
  createEmptyBankAccountRow,
  extractLedgerBankAccountRows,
  finishBankAccountDraft,
  normalizeBankAccountType,
  validateBankAccountDraft,
  type LedgerBankAccountFormRow,
} from "./bank-accounts";

function account(overrides: Partial<LedgerBankAccountFormRow> = {}): LedgerBankAccountFormRow {
  return {
    ...createEmptyBankAccountRow(),
    lbaAccountNo: "1234567890",
    lbaAccountHolder: "ZT Holder",
    lbaBankName: "SBI",
    ...overrides,
  };
}

describe("account popup — Add", () => {
  it("starts the first account as the default, a later one not", () => {
    expect(createBankAccountDraft([]).lbaIsDefault).toBe(true);
    expect(createBankAccountDraft([account()]).lbaIsDefault).toBe(false);
  });

  it("a single-mandatory list: default always, no second account", () => {
    expect(createBankAccountDraft([], { singleMandatory: true }).lbaIsDefault).toBe(true);
    expect(canAddBankAccount([], { singleMandatory: true })).toBe(true);
    expect(canAddBankAccount([account()], { singleMandatory: true })).toBe(false);
    expect(canAddBankAccount([account(), account()])).toBe(true);
  });
});

describe("validateBankAccountDraft", () => {
  it("asks for the three required fields in the popup's order, in Qt's words", () => {
    expect(validateBankAccountDraft(account({ lbaAccountNo: " ", lbaBankName: "" }))).toEqual({
      field: "lbaAccountNo",
      message: "Enter the account number.",
    });
    expect(validateBankAccountDraft(account({ lbaAccountHolder: "" }))).toEqual({
      field: "lbaAccountHolder",
      message: "Enter the account holder.",
    });
    expect(validateBankAccountDraft(account({ lbaBankName: "" }))).toEqual({
      field: "lbaBankName",
      message: "Enter the bank name.",
    });
  });

  it("holds IFSC to the server's 11 characters, and passes a complete account", () => {
    expect(validateBankAccountDraft(account({ lbaIfscCode: "SBIN001" }))?.field).toBe("lbaIfscCode");
    expect(validateBankAccountDraft(account({ lbaIfscCode: "SBIN0001234" }))).toBeNull();
    expect(validateBankAccountDraft(account())).toBeNull();
  });
});

describe("finishBankAccountDraft", () => {
  it("trims, upper-cases IFSC and keeps a locked default on", () => {
    const done = finishBankAccountDraft(
      account({ lbaAccountNo: " 99 ", lbaIfscCode: " sbin0001234 ", lbaIsDefault: false }),
      { singleMandatory: true },
    );
    expect(done.lbaAccountNo).toBe("99");
    expect(done.lbaIfscCode).toBe("SBIN0001234");
    expect(done.lbaIsDefault).toBe(true);
  });
});

describe("commitBankAccountRow", () => {
  it("adds a new account at the end and writes an edited one back in place", () => {
    const first = account({ lbaIsDefault: true });
    const second = account({ lbaAccountNo: "555" });
    const added = commitBankAccountRow([first], second);
    expect(added.map((row) => row.rowKey)).toEqual([first.rowKey, second.rowKey]);
    const edited = commitBankAccountRow(added, { ...first, lbaBranchName: "Coimbatore" });
    expect(edited).toHaveLength(2);
    expect(edited[0].lbaBranchName).toBe("Coimbatore");
    expect(edited[0].lbaIsDefault).toBe(true);
  });

  it("ticking Default in the popup moves it: one default", () => {
    const first = account({ lbaIsDefault: true });
    const second = account({ lbaAccountNo: "555" });
    const next = commitBankAccountRow([first], { ...second, lbaIsDefault: true });
    expect(next.map((row) => row.lbaIsDefault)).toEqual([false, true]);
  });

  it("unticking the default leaves the others as they were", () => {
    const first = account({ lbaIsDefault: true });
    const second = account({ lbaAccountNo: "555" });
    const next = commitBankAccountRow([first, second], { ...first, lbaIsDefault: false });
    expect(next.map((row) => row.lbaIsDefault)).toEqual([false, false]);
  });
});

describe("account type", () => {
  it("reads a known type as its enum value, Qt's words included", () => {
    expect(normalizeBankAccountType("SAVINGS")).toBe("SAVINGS");
    expect(normalizeBankAccountType("Savings")).toBe("SAVINGS");
    expect(normalizeBankAccountType("Cash Credit")).toBe("CASH_CREDIT");
    expect(normalizeBankAccountType("")).toBe("");
  });

  it("keeps a stored type outside the list, offered as one more choice", () => {
    expect(normalizeBankAccountType(" Fixed Deposit ")).toBe("Fixed Deposit");
    const options = bankAccountTypeOptions("Fixed Deposit");
    expect(options.at(-1)).toEqual({ label: "Fixed Deposit", value: "Fixed Deposit" });
    expect(bankAccountTypeOptions("CURRENT").some((option) => option.value === "Fixed Deposit")).toBe(false);
    expect(bankAccountTypeLabel("CASH_CREDIT")).toBe("Cash Credit");
    expect(bankAccountTypeLabel("Fixed Deposit")).toBe("Fixed Deposit");
  });

  it("loads and saves a kept type unchanged instead of blanking it", () => {
    const [row] = extractLedgerBankAccountRows({
      ledgerBankAccount: [
        { lbaAccountNo: "1", lbaAccountHolder: "A", lbaBankName: "B", lbaAccountType: "Fixed Deposit" },
      ],
    });
    expect(row.lbaAccountType).toBe("Fixed Deposit");
    const [item] = buildLedgerBankAccountPayload([row]);
    expect(item.lbaAccountType).toBe("Fixed Deposit");
    const [known] = buildLedgerBankAccountPayload([{ ...row, lbaAccountType: "savings" }]);
    expect(known.lbaAccountType).toBe("SAVINGS");
  });
});
