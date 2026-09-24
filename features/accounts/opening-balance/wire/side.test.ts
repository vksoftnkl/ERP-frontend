import { describe, expect, it } from "vitest";
import { flipSide, fromWire, sign, toBillWire, toLedgerWire } from "./side";

describe("Dr/Cr spellings", () => {
  it("writes ONE character for a ledger opening", () => {
    expect(toLedgerWire("Dr")).toBe("D");
    expect(toLedgerWire("Cr")).toBe("C");
  });

  it("writes TWO characters for an opening bill", () => {
    // `acc_bill_balance.abl_dr_cr` is char(2). Sending 'C' here is a 400.
    expect(toBillWire("Dr")).toBe("DR");
    expect(toBillWire("Cr")).toBe("CR");
  });

  it("has no side to write when there is no opening", () => {
    expect(toLedgerWire("")).toBeNull();
    expect(toBillWire("")).toBeNull();
  });

  it("reads both spellings, and reads NOTHING as nothing", () => {
    expect(fromWire("D")).toBe("Dr");
    expect(fromWire("C")).toBe("Cr");
    expect(fromWire("DR")).toBe("Dr");
    expect(fromWire("CR")).toBe("Cr");
    // The whole point: a ledger with no opening has no side, and painting "Dr"
    // there invents a figure the server never wrote.
    expect(fromWire(null)).toBe("");
    expect(fromWire(undefined)).toBe("");
  });

  it("signs a sum without ever signing a stored amount", () => {
    expect(sign("Dr")).toBe(1);
    expect(sign("Cr")).toBe(-1);
    expect(sign("CR")).toBe(-1);
    expect(sign("D")).toBe(1);
  });

  it("flips", () => {
    expect(flipSide("Dr")).toBe("Cr");
    expect(flipSide("Cr")).toBe("Dr");
  });
});
