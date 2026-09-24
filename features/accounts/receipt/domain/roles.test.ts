import { describe, expect, it } from "vitest";
import type { ReceiptRole } from "../receipt.types";
import { billColumnOf } from "./adj-type";
import { aLine } from "./fixtures";
import {
  PICKABLE_ROLES,
  ROLE_LABELS,
  defaultsForRole,
  isAddition,
  isCreditSide,
  isLegSplit,
  isMirroredByBillColumn,
  isSettlingDeduction,
  isUnmirroredDeduction,
  linesThatTravel,
  roleIsLegSplit,
  roleIsMirroredByBillColumn,
} from "./roles";

const ALL_ROLES = Object.keys(ROLE_LABELS) as ReceiptRole[];

describe("role classification", () => {
  it("marks exactly the three bill-grid columns as mirrored", () => {
    const mirrored = ALL_ROLES.filter(roleIsMirroredByBillColumn);
    expect(mirrored.sort()).toEqual(["DISCOUNT_ALLOWED", "ROUND_OFF", "WRITE_OFF"]);
  });

  it("treats BANK_CHARGES as a leg split and nothing else", () => {
    expect(ALL_ROLES.filter(roleIsLegSplit)).toEqual(["BANK_CHARGES"]);
  });

  it("puts income and tax payable on the credit side", () => {
    expect(ALL_ROLES.filter(isCreditSide).sort()).toEqual([
      "INTEREST_INCOME",
      "SURCHARGE_RECOVERED",
      "TCS_PAYABLE",
    ]);
  });

  it("answers false for a line with no role", () => {
    expect(roleIsMirroredByBillColumn(null)).toBe(false);
    expect(roleIsLegSplit(null)).toBe(false);
    expect(isCreditSide(null)).toBe(false);
  });

  it("asks the same question of a line as of its role", () => {
    expect(isMirroredByBillColumn(aLine("WRITE_OFF"))).toBe(true);
    expect(isLegSplit(aLine("BANK_CHARGES"))).toBe(true);
    expect(isLegSplit(aLine("TDS_RECEIVABLE"))).toBe(false);
  });
});

describe("line arithmetic roles", () => {
  it("a settling TDS line is a deduction the bills grid does not carry", () => {
    const tds = aLine("TDS_RECEIVABLE", { settlesBill: true });
    expect(isSettlingDeduction(tds)).toBe(true);
    expect(isUnmirroredDeduction(tds)).toBe(true);
    expect(isAddition(tds)).toBe(false);
  });

  it("a settlement discount is a deduction the grid already carries", () => {
    const discount = aLine("DISCOUNT_ALLOWED", { settlesBill: true });
    expect(isSettlingDeduction(discount)).toBe(true);
    expect(isUnmirroredDeduction(discount)).toBe(false);
  });

  it("interest paid on top is an addition", () => {
    const interest = aLine("INTEREST_INCOME", { settlesBill: false, drCr: "CR" });
    expect(isAddition(interest)).toBe(true);
    expect(isSettlingDeduction(interest)).toBe(false);
  });

  it("bank charges sit on neither side, whatever settlesBill says", () => {
    for (const settlesBill of [true, false]) {
      const mdr = aLine("BANK_CHARGES", { settlesBill });
      expect(isSettlingDeduction(mdr)).toBe(false);
      expect(isAddition(mdr)).toBe(false);
    }
  });
});

describe("linesThatTravel", () => {
  it("drops the mirrored lines and keeps the rest in order", () => {
    const tds = aLine("TDS_RECEIVABLE");
    const discount = aLine("DISCOUNT_ALLOWED");
    const mdr = aLine("BANK_CHARGES");
    const writeOff = aLine("WRITE_OFF");
    const ledgerOnly = aLine("CLAIMS_ALLOWED", { role: null, ledgerId: "led-x" });
    expect(linesThatTravel([tds, discount, mdr, writeOff, ledgerOnly])).toEqual([
      tds,
      mdr,
      ledgerOnly,
    ]);
  });
});

describe("defaultsForRole", () => {
  it("credit-side roles default to CR and do not settle a bill", () => {
    expect(defaultsForRole("TCS_PAYABLE")).toEqual({ drCr: "CR", settlesBill: false });
    expect(defaultsForRole("INTEREST_INCOME")).toEqual({ drCr: "CR", settlesBill: false });
  });

  it("bank charges and round-off are DR but never claim the settlement", () => {
    expect(defaultsForRole("BANK_CHARGES")).toEqual({ drCr: "DR", settlesBill: false });
    expect(defaultsForRole("ROUND_OFF")).toEqual({ drCr: "DR", settlesBill: false });
  });

  it("every other deduction is DR and settles", () => {
    expect(defaultsForRole("TDS_RECEIVABLE")).toEqual({ drCr: "DR", settlesBill: true });
    expect(defaultsForRole("CLAIMS_ALLOWED")).toEqual({ drCr: "DR", settlesBill: true });
    expect(defaultsForRole("DISCOUNT_ALLOWED")).toEqual({ drCr: "DR", settlesBill: true });
  });
});

describe("PICKABLE_ROLES", () => {
  it("offers no derived role by hand", () => {
    for (const role of PICKABLE_ROLES) {
      expect(roleIsMirroredByBillColumn(role)).toBe(false);
      expect(roleIsLegSplit(role)).toBe(false);
    }
  });

  it("labels every role", () => {
    for (const role of ALL_ROLES) {
      expect(ROLE_LABELS[role]).toBeTruthy();
    }
  });
});

describe("billColumnOf", () => {
  it("routes every way money lands on a bill to Receive", () => {
    for (const adj of ["ALLOCATION", "ADVANCE_ADJUST", "NOTE_ADJUST", "TRANSFER"]) {
      expect(billColumnOf(adj)).toBe("receive");
    }
  });

  it("treats a missing type as Receive", () => {
    expect(billColumnOf(null)).toBe("receive");
    expect(billColumnOf(undefined)).toBe("receive");
    expect(billColumnOf("")).toBe("receive");
  });

  it("routes the settlement types to their own columns", () => {
    expect(billColumnOf("DISCOUNT")).toBe("discount");
    expect(billColumnOf("WRITEOFF")).toBe("writeOff");
    expect(billColumnOf("ROUND_OFF")).toBe("roundOff");
  });

  it("is case- and whitespace-tolerant", () => {
    expect(billColumnOf("  discount ")).toBe("discount");
  });

  it("skips an unknown type rather than folding it into Receive", () => {
    expect(billColumnOf("SOMETHING_NEW")).toBeNull();
  });
});
