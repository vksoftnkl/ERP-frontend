/**
 * Sale Tender — the gate list (the plan's §12 and §15).
 */
import { describe, expect, it } from "vitest";
import type { TenderDraftRow } from "../sale-order.types";
import { validateTenderRows } from "./validate";

function row(overrides: Partial<TenderDraftRow> = {}): TenderDraftRow {
  return {
    key: "t-1",
    tdId: null,
    tenderId: "tnd-cash",
    tenderTypeId: 1,
    typeCode: "CASH",
    tenderName: "CASH",
    tenderLedgerId: "led-cash",
    settleLedgerId: null,
    surchargeLedgerId: null,
    surchargePerc: 0,
    surchargeFlat: 0,
    settlementDays: 0,
    minAmount: 0,
    maxAmount: null,
    conversionRate: 1,
    editSurcharge: false,
    allowChange: true,
    needsRef: false,
    hotkey: "A",
    keyed: 0,
    settleStatus: "NA",
    refNo: null,
    authCode: null,
    bankName: null,
    cardDigits: null,
    instrumentDate: null,
    notes: null,
    ...overrides,
  };
}

const SETTLE = { purpose: "settlement" as const, documentAmount: 1500, documentDate: "2026-08-11" };
const ADVANCE = { purpose: "advance" as const, documentAmount: 1500, documentDate: "2026-08-11" };

describe("gate 1 — coverage", () => {
  it("refuses a bill that is not fully tendered", () => {
    const violation = validateTenderRows([row({ keyed: 500 })], SETTLE);
    expect(violation?.message).toBe("The bill is not fully tendered.");
  });

  it("an advance is partial by definition and skips it", () => {
    expect(validateTenderRows([row({ keyed: 500 })], ADVANCE)).toBeNull();
  });
});

describe("gate 2 — the master's floor", () => {
  it("refuses a row under its minimum", () => {
    const card = row({
      tenderId: "tnd-card",
      typeCode: "CARD",
      tenderName: "CARD",
      allowChange: false,
      needsRef: false,
      minAmount: 100,
      keyed: 50,
    });
    const violation = validateTenderRows([card, row({ key: "t-2", keyed: 1450 })], SETTLE);
    expect(violation?.message).toBe("CARD needs at least 100.00.");
    expect(violation?.focusRow).toBe("t-1");
  });
});

describe("gate 3 — a tender that cannot give change may not exceed the document", () => {
  it("refuses an over-tendered card", () => {
    const card = row({
      key: "t-card",
      tenderId: "tnd-card",
      typeCode: "CARD",
      tenderName: "CARD",
      allowChange: false,
      keyed: 2000,
    });
    expect(validateTenderRows([card], SETTLE)?.message).toContain("cannot exceed the bill amount");
  });

  it("PASSES a card that settles the full bill and carries a fee (the ported bug)", () => {
    // Gross 1,515 against a 1,500 bill — the fee is the bank's, not the shop's,
    // so the comparison is made on the 1,500 base.
    const card = row({
      key: "t-card",
      tenderId: "tnd-card",
      typeCode: "CARD",
      tenderName: "CARD",
      allowChange: false,
      surchargePerc: 1,
      keyed: 1500,
    });
    expect(validateTenderRows([card], SETTLE)).toBeNull();
  });

  it("the excess-tender setting lifts the gate", () => {
    const card = row({
      key: "t-card",
      tenderId: "tnd-card",
      typeCode: "CARD",
      tenderName: "CARD",
      allowChange: false,
      keyed: 2000,
    });
    expect(validateTenderRows([card], { ...SETTLE, allowExcessTender: true })).toBeNull();
  });

  it("never applies to cash — the drawer gives change", () => {
    expect(validateTenderRows([row({ keyed: 2000 })], SETTLE)).toBeNull();
  });
});

describe("gates 4 and 5 — instruments", () => {
  it("asks for the reference by its own label", () => {
    const upi = row({
      tenderId: "tnd-upi",
      typeCode: "UPI",
      tenderName: "UPI",
      allowChange: false,
      needsRef: true,
      keyed: 1500,
    });
    const violation = validateTenderRows([upi], SETTLE);
    expect(violation?.message).toBe("UPI needs its UTR number.");
    expect(violation?.focusField).toBe("refNo");
  });

  it("a cheque is never exempt from its number, even with needsRef off", () => {
    const cheque = row({
      tenderId: "tnd-chq",
      typeCode: "CHEQUE",
      tenderName: "CHEQUE",
      allowChange: false,
      needsRef: false,
      keyed: 1500,
    });
    expect(validateTenderRows([cheque], SETTLE)?.message).toBe("CHEQUE needs its cheque number.");
  });

  it("a cheque nobody can present is not a settlement", () => {
    const cheque = row({
      tenderId: "tnd-chq",
      typeCode: "CHEQUE",
      tenderName: "CHEQUE",
      allowChange: false,
      keyed: 1500,
      refNo: "774411",
    });
    const violation = validateTenderRows([cheque], SETTLE);
    expect(violation?.message).toBe("CHEQUE needs the bank the cheque is drawn on.");
    expect(violation?.focusField).toBe("bank");
    const banked = { ...cheque, bankName: "SBI" };
    expect(validateTenderRows([banked], SETTLE)?.message).toBe("CHEQUE needs its cheque date.");
    const dated = { ...banked, instrumentDate: "2026-08-01" };
    expect(validateTenderRows([dated], SETTLE)?.message).toContain("cannot be dated before");
    expect(validateTenderRows([{ ...banked, instrumentDate: "2026-09-01" }], SETTLE)).toBeNull();
  });
});

describe("rows with nothing behind them", () => {
  it("refuses money keyed on a seeded fallback row", () => {
    const seeded = row({ tenderId: "", keyed: 1500 });
    expect(validateTenderRows([seeded], SETTLE)?.message).toContain(
      "not backed by the tender master",
    );
  });

  it("refuses money keyed onto a panel-owned row while its panel is unbuilt", () => {
    const rrn = row({
      tenderId: "tnd-rrn",
      typeCode: "RRN",
      tenderName: "RRN",
      allowChange: false,
      needsRef: false,
      keyed: 1500,
    });
    expect(validateTenderRows([rrn], SETTLE)?.message).toContain("own panel");
  });

  it("an untouched row is not a failure", () => {
    const untouched = row({ key: "t-card", typeCode: "CARD", minAmount: 100, keyed: 0 });
    expect(validateTenderRows([untouched, row({ key: "t-cash", keyed: 1500 })], SETTLE)).toBeNull();
  });
});
