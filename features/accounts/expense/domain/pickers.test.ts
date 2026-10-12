import { describe, expect, it } from "vitest";
import { emptyTender } from "./draft";
import { BRANCH, CASH_ID, COMPANY, OTHER, TENDERS, TODAY, UPI_ID, master } from "./fixtures";
import {
  cashTenderOf,
  expenseTenderOptions,
  isCashTender,
  placeOfSupplyOf,
  rateOptions,
  readLedgerPick,
  readReasonPick,
  reasonLabel,
  reasonNamesFromRows,
  stateLabel,
  stateNamesFromRows,
  stateOfGstin,
  tenderChoices,
} from "./pickers";

describe("the popup rows (grids 155 / 156)", () => {
  it("reads a reason with its ledger and the ledger's GST facts", () => {
    expect(
      readReasonPick({
        trs_id: "r1",
        trs_name: "Tea & Refreshments",
        ledger_name: "Staff Welfare",
        trs_ledger_id: "led-1",
        trs_code: "TEA",
        led_tax_id: "",
        tax_name: "",
        led_hsn_sac: "",
        trs_max_amount: "0",
      }),
    ).toEqual({
      reasonId: "r1",
      name: "Tea & Refreshments",
      ledgerId: "led-1",
      ledgerName: "Staff Welfare",
      taxId: "",
      taxName: "",
      hsn: "",
    });
  });

  it("a reason whose ledger is gone (blank id) carries no ledger facts; a row with no id is nothing", () => {
    expect(readReasonPick({ trs_id: "r2", trs_name: "Repair", trs_ledger_id: "", ledger_name: "", tax_name: "GST 18%" }))
      .toMatchObject({ ledgerId: "", ledgerName: "", taxName: "" });
    expect(readReasonPick({ trs_name: "no id" })).toBeNull();
  });

  it("reads a ledger with its rate and HSN/SAC", () => {
    expect(
      readLedgerPick({ led_id: "l1", led_name: "Bank Charges", group_name: "Indirect Expenses", led_tax_id: "t18", tax_name: "GST 18%", led_hsn_sac: "997113" }),
    ).toEqual({ ledgerId: "l1", name: "Bank Charges", taxId: "t18", taxName: "GST 18%", hsn: "997113" });
    expect(readLedgerPick({ led_name: "x" })).toBeNull();
  });

  it("names a loaded line's reason from the grid, else Qt's \"(saved reason)\"", () => {
    const names = reasonNamesFromRows([{ trs_id: "r1", trs_name: "Tea" }, { trs_name: "orphan" }]);
    expect([...names]).toEqual([["r1", "Tea"]]);
    expect(reasonLabel({ reasonId: "r1", reasonName: "" }, names)).toBe("Tea");
    expect(reasonLabel({ reasonId: "r1", reasonName: "Picked" }, names)).toBe("Picked");
    expect(reasonLabel({ reasonId: "r9", reasonName: "" }, names)).toBe("(saved reason)");
    expect(reasonLabel({ reasonId: "", reasonName: "" }, names)).toBe("");
  });
});

describe("GST rates and the place of supply", () => {
  it("reads /vouchers/tax-rates", () => {
    expect(rateOptions([{ taxId: "t18", name: "GST 18%" }, { name: "no id" }])).toEqual([{ taxId: "t18", name: "GST 18%" }]);
    expect(rateOptions(undefined)).toEqual([]);
  });

  it("the state is the GSTIN's first two digits", () => {
    expect(stateOfGstin("29AACCG0527D1Z0")).toBe("29");
    expect(stateOfGstin(" 33")).toBe("33");
    expect(stateOfGstin("A9")).toBe("");
    expect(stateOfGstin("")).toBe("");
  });

  it("follows the GSTIN until the operator picks one", () => {
    const header = { supplierGstin: "29AACCG0527D1Z0", placeOfSupply: "", placeOfSupplyPicked: false };
    expect(placeOfSupplyOf(header)).toBe("29");
    expect(placeOfSupplyOf({ ...header, placeOfSupply: "33", placeOfSupplyPicked: true })).toBe("33");
    expect(placeOfSupplyOf({ ...header, supplierGstin: "" })).toBe("");
  });

  it("labels a state \"33 - Tamil Nadu\", or by its code before the names load", () => {
    const names = stateNamesFromRows([{ state_code: "33", state_name: "Tamil Nadu" }, { state_name: "x" }]);
    expect(stateLabel("33", names)).toBe("33 - Tamil Nadu");
    expect(stateLabel("29", names)).toBe("29");
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
