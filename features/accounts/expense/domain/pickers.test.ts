import { describe, expect, it } from "vitest";
import { emptyLine, emptyTender } from "./draft";
import { BRANCH, CASH_ID, COMPANY, OTHER, TENDERS, TODAY, UPI_ID, master } from "./fixtures";
import {
  cashTenderOf,
  expenseTenderOptions,
  isCashTender,
  ledgerChoices,
  ledgersFromPick,
  reasonChoices,
  reasonsFromGridRows,
  reasonsFromQuickReasons,
  tenderChoices,
} from "./pickers";

describe("reasons", () => {
  it("maps grid 134 rows to the quick-reasons' shape (Qt loadPickers)", () => {
    const reasons = reasonsFromGridRows([
      {
        trs_id: "r1",
        trs_code: "TEA",
        trs_name: "Tea",
        trs_category: "EXPENSE",
        trs_ledger_id: "led-1",
        ledger_name: "Staff Welfare",
        trs_needs_note: true,
        trs_needs_ref: "f",
        trs_max_amount: "500.00",
      },
      // A ledger since deleted: the grid's name is blank, so no ledger.
      { trs_id: "r2", trs_code: "X", trs_name: "Repair", trs_ledger_id: "led-gone", ledger_name: "", trs_max_amount: 0 },
      { trs_id: "r3", trs_category: "PAID_IN", trs_name: "Not an expense" },
      { trs_id: "", trs_name: "no id" },
    ]);
    expect(reasons).toEqual([
      {
        reasonId: "r1",
        code: "TEA",
        name: "Tea",
        ledgerId: "led-1",
        ledgerName: "Staff Welfare",
        needsNote: true,
        needsRef: false,
        maxAmount: 500,
      },
      {
        reasonId: "r2",
        code: "X",
        name: "Repair",
        ledgerId: null,
        ledgerName: null,
        needsNote: false,
        needsRef: false,
        maxAmount: null,
      },
    ]);
  });

  it("reads the quick-reasons route as the fallback", () => {
    expect(
      reasonsFromQuickReasons([{ reasonId: "r1", code: "C", name: "Courier", ledgerId: "l", ledgerName: "Courier", maxAmount: null }]),
    ).toEqual([
      { reasonId: "r1", code: "C", name: "Courier", ledgerId: "l", ledgerName: "Courier", needsNote: false, needsRef: false, maxAmount: null },
    ]);
  });

  it("offers '—', the reasons, and a saved reason the list lacks", () => {
    const reasons = reasonsFromQuickReasons([{ reasonId: "r1", name: "Tea" }]);
    expect(reasonChoices(reasons, emptyLine())).toEqual([
      { value: "", label: "—" },
      { value: "r1", label: "Tea" },
    ]);
    expect(reasonChoices(reasons, { ...emptyLine(), reasonId: "r-old" }).at(-1)).toEqual({
      value: "r-old",
      label: "(saved reason)",
    });
  });
});

describe("ledgers", () => {
  it("reads ledger-pick rows", () => {
    expect(ledgersFromPick([{ ledgerId: "l1", name: "Repairs", groupName: "Indirect Expenses", taxId: null }, { name: "x" }])).toEqual([
      { ledgerId: "l1", name: "Repairs", groupName: "Indirect Expenses", taxId: null, itcEligibility: null },
    ]);
  });

  it("keeps a loaded line's ledger the list does not hold", () => {
    const ledgers = ledgersFromPick([{ ledgerId: "l1", name: "Repairs" }]);
    expect(ledgerChoices(ledgers, emptyLine())).toEqual([{ value: "l1", label: "Repairs" }]);
    expect(ledgerChoices(ledgers, { ...emptyLine(), ledgerId: "l9", ledgerName: "Old Head" }).at(-1)).toEqual({
      value: "l9",
      label: "Old Head",
    });
  });
});

describe("tenders", () => {
  const masters = [
    master({ tndId: "upi", tndTypeId: "3", tndTypeName: "UPI", tndName: "UPI", tndDisplayPosition: 3 }),
    master({ tndId: "cash", tndTypeId: "1", tndTypeName: "CASH", tndName: "Cash", tndDisplayPosition: 1 }),
    master({ tndId: "chq", tndTypeId: "5", tndTypeName: "CHEQUE", tndName: "Cheque", tndDisplayPosition: 2 }),
    master({ tndId: "card", tndTypeId: "2", tndTypeName: "CARD", tndName: "Card" }),
    master({ tndId: "neft", tndTypeId: "6", tndTypeName: null, tndName: "NEFT", tndDisplayPosition: 4 }),
    master({ tndId: "old", tndName: "Old cash", tndEffectiveTo: "2026-01-01" }),
    master({ tndId: "off", tndName: "Inactive", tndIsActive: false }),
    master({ tndId: "elsewhere", tndName: "Other branch", tndBranchId: OTHER }),
    master({ tndId: "theirs", tndName: "Other company", tndCompanyId: OTHER }),
  ];

  it("offers CASH, BANK and UPI live on the date, here, in display order — never a cheque or a card", () => {
    const options = expenseTenderOptions(masters, TODAY, COMPANY, BRANCH);
    expect(options.map((option) => [option.tenderId, option.typeCode, option.typeId])).toEqual([
      ["cash", "CASH", 1],
      ["upi", "UPI", 3],
      ["neft", "BANK", 6],
    ]);
    expect(options[0].ledgerName).toBe("Cash in hand");
  });

  it("a back-dated voucher sees the tenders live that day", () => {
    const options = expenseTenderOptions(masters, "2025-12-31", COMPANY, BRANCH);
    expect(options.map((option) => option.tenderId)).toContain("old");
  });

  it("starts on cash", () => {
    expect(cashTenderOf(TENDERS)?.tenderId).toBe(CASH_ID);
    expect(cashTenderOf([])).toBeNull();
    expect(isCashTender(TENDERS, CASH_ID)).toBe(true);
    expect(isCashTender(TENDERS, UPI_ID)).toBe(false);
  });

  it("a saved row keeps its own tender when it is no longer offered", () => {
    expect(tenderChoices(TENDERS, emptyTender(CASH_ID))).toHaveLength(2);
    expect(tenderChoices(TENDERS, { ...emptyTender("gone"), tenderName: "Old UPI" }).at(-1)).toEqual({
      value: "gone",
      label: "Old UPI",
    });
  });
});
