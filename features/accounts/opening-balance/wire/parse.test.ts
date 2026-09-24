import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpeningBillDto, OpeningRowDto } from "../opening-balance.types";
import {
  blankBillRow,
  blankLedgerRow,
  nextRowKey,
  parseBillRow,
  parseBillRows,
  parseLedgerRow,
  parseLedgerRows,
} from "./parse";

afterEach(() => {
  vi.useRealTimers();
});

function ledgerDto(partial: Partial<OpeningRowDto> = {}): OpeningRowDto {
  return {
    opId: "op-1",
    ledId: "led-1",
    ledName: "Deepan",
    groupName: "Sundry Debtors",
    groupNature: "Assets",
    ledIsBillByBill: false,
    opAmount: 5000,
    opDrCr: "D",
    opSource: null,
    opIsStale: false,
    opStaleSince: null,
    opStaleReason: null,
    opRemarks: null,
    priorClosingAmount: null,
    priorClosingDrCr: null,
    billCount: 0,
    ...partial,
  };
}

function billDto(partial: Partial<OpeningBillDto> = {}): OpeningBillDto {
  return {
    ablId: "abl-1",
    ablDocRefno: "INV/1",
    ablDocDate: "2026-03-10T00:00:00Z",
    ablDueDate: null,
    ablCreditDays: 30,
    ablGraceDays: 5,
    ablDrCr: "DR",
    ablBillAmount: 1200,
    ablAllocAmount: 200,
    ablDiscAmount: 0,
    ablWriteoffAmount: 0,
    ablPendingAmount: 1000,
    ablStatus: "PARTIAL",
    ablNarration: null,
    isFrozen: false,
    ...partial,
  };
}

describe("nextRowKey", () => {
  it("never repeats", () => {
    expect(nextRowKey("led")).not.toBe(nextRowKey("led"));
  });
});

describe("parseLedgerRow", () => {
  it("maps the wire onto the grid row", () => {
    const row = parseLedgerRow(ledgerDto({ opRemarks: "carried", opDrCr: "C", billCount: 3 }));
    expect(row).toMatchObject({
      ledId: "led-1",
      opId: "op-1",
      amount: 5000,
      drCr: "Cr",
      remarks: "carried",
      loadedRemarks: "carried",
      billCount: 3,
    });
    expect(row.key).toMatch(/^led-/);
  });

  it("records the remark that arrived, so an emptied cell can be told apart", () => {
    const row = parseLedgerRow(ledgerDto({ opRemarks: null }));
    expect(row.remarks).toBe("");
    expect(row.loadedRemarks).toBe("");
  });

  it("coerces a numeric string and garbage safely", () => {
    const row = parseLedgerRow(
      ledgerDto({ opAmount: "1500.50" as unknown as number, billCount: undefined as unknown as number }),
    );
    expect(row.amount).toBe(1500.5);
    expect(row.billCount).toBe(0);
    expect(parseLedgerRow(ledgerDto({ opAmount: Number.NaN })).amount).toBe(0);
  });

  it("reads flags strictly", () => {
    const row = parseLedgerRow(
      ledgerDto({ ledIsBillByBill: "yes" as unknown as boolean, opIsStale: true }),
    );
    expect(row.isBillWise).toBe(false);
    expect(row.isStale).toBe(true);
  });

  it("keeps a prior closing only when it is a number", () => {
    expect(parseLedgerRow(ledgerDto({ priorClosingAmount: 0, priorClosingDrCr: "D" }))).toMatchObject({
      priorClosingAmount: 0,
      priorClosingSide: "Dr",
    });
    expect(
      parseLedgerRow(ledgerDto({ priorClosingAmount: "12" as unknown as number })).priorClosingAmount,
    ).toBeNull();
  });

  it("shows no side for a missing side", () => {
    expect(parseLedgerRow(ledgerDto({ opDrCr: null })).drCr).toBe("");
  });
});

describe("parseLedgerRows", () => {
  it("keeps every loaded opening and appends exactly one blank picker row", () => {
    const rows = parseLedgerRows([ledgerDto({ ledId: "a" }), ledgerDto({ ledId: "b" })]);
    expect(rows.map((row) => row.ledId)).toEqual(["a", "b", ""]);
    expect(rows[2]).toMatchObject({ ...blankLedgerRow(), key: rows[2].key });
  });

  it("an empty set is just the blank row", () => {
    expect(parseLedgerRows([])).toHaveLength(1);
  });

  it("gives every row a distinct key", () => {
    const rows = parseLedgerRows([ledgerDto(), ledgerDto()]);
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
  });
});

describe("parseBillRow", () => {
  it("maps the wire onto the breakup row", () => {
    expect(parseBillRow(billDto())).toMatchObject({
      ablId: "abl-1",
      docRefno: "INV/1",
      docDate: "2026-03-10",
      dueDate: "",
      creditDays: 30,
      graceDays: 5,
      drCr: "Dr",
      amount: 1200,
      allocated: 200,
      pending: 1000,
      status: "PARTIAL",
      narration: "",
      isFrozen: false,
    });
  });

  it("reads Cr, and defaults any other side to Dr", () => {
    expect(parseBillRow(billDto({ ablDrCr: "CR" })).drCr).toBe("Cr");
    expect(parseBillRow(billDto({ ablDrCr: "" as "DR" })).drCr).toBe("Dr");
  });

  it("reads isFrozen strictly", () => {
    expect(parseBillRow(billDto({ isFrozen: true })).isFrozen).toBe(true);
    expect(parseBillRow(billDto({ isFrozen: 1 as unknown as boolean })).isFrozen).toBe(false);
  });

  it("blanks an impossible date rather than passing it on", () => {
    expect(parseBillRow(billDto({ ablDocDate: "2026-02-31" })).docDate).toBe("");
  });
});

describe("blank rows", () => {
  it("a new bill starts today, on the debit side", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 24, 12, 0));
    expect(blankBillRow()).toMatchObject({
      ablId: null,
      docDate: "2026-09-24",
      dueDate: "",
      drCr: "Dr",
      amount: 0,
      isFrozen: false,
    });
  });

  it("the blank ledger row names no ledger and no side", () => {
    expect(blankLedgerRow()).toMatchObject({ ledId: "", opId: null, drCr: "", amount: 0 });
  });
});

describe("parseBillRows", () => {
  it("appends one blank bill after the loaded ones", () => {
    const rows = parseBillRows([billDto({ ablId: "x" })]);
    expect(rows.map((row) => row.ablId)).toEqual(["x", null]);
  });
});
