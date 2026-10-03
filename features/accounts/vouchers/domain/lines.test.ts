import { describe, expect, it } from "vitest";
import {
  adoptNames,
  amountPaise,
  blankLine,
  buildHeader,
  buildLines,
  formatPaise,
  isSendable,
  linesFromDraft,
  linesFromLegs,
  linesTotals,
  paiseText,
  typeAmount,
  withTrailingLine,
  type VoucherLine,
} from "./lines";

function aLine(partial: Partial<VoucherLine> = {}): VoucherLine {
  return { ...blankLine(), ledgerId: "led-cash", ledgerName: "Cash", groupName: "Cash-in-Hand", ...partial };
}

describe("amounts", () => {
  it("reads what is typed into paise, exactly", () => {
    expect(amountPaise("25,000.5")).toBe(2500050);
    expect(amountPaise("0.1")).toBe(10);
    expect(amountPaise(".25")).toBe(25);
    expect(amountPaise("")).toBe(0);
    expect(amountPaise("1.234")).toBeNaN();
    expect(amountPaise("abc")).toBeNaN();
  });

  it("writes the wire's decimal string", () => {
    expect(paiseText(2500050)).toBe("25000.50");
    expect(paiseText(7)).toBe("0.07");
    expect(formatPaise(2500050)).toBe("25,000.50");
  });
});

describe("lines", () => {
  it("keeps exactly one blank line at the bottom", () => {
    expect(withTrailingLine([])).toHaveLength(1);
    const typed = aLine({ amount: "100" });
    const lines = withTrailingLine([typed]);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(typed);
    expect(withTrailingLine([typed, blankLine(), blankLine()])).toHaveLength(2);
  });

  it("sends only a complete line — a ledger and an amount above zero", () => {
    expect(isSendable(aLine({ amount: "100" }))).toBe(true);
    expect(isSendable(aLine({ amount: "" }))).toBe(false);
    expect(isSendable(aLine({ amount: "0" }))).toBe(false);
    expect(isSendable(aLine({ ledgerId: "", amount: "100" }))).toBe(false);
  });

  it("moves a line to the column a figure is typed in", () => {
    const line = aLine({ drCr: "DR", amount: "100" });
    expect(typeAmount(line, "CR", "250")).toMatchObject({ drCr: "CR", amount: "250" });
    expect(typeAmount(line, "CR", "")).toBe(line);
    expect(typeAmount(line, "DR", "")).toMatchObject({ drCr: "DR", amount: "" });
  });

  it("totals the sendable lines in paise", () => {
    const lines = [
      aLine({ drCr: "DR", amount: "1500" }),
      aLine({ drCr: "CR", amount: "1499.99" }),
      aLine({ drCr: "CR", amount: "", ledgerId: "x" }),
      blankLine(),
    ];
    expect(linesTotals(lines)).toEqual({ debit: 150000, credit: 149999, difference: 1 });
  });
});

describe("the payload", () => {
  it("numbers the sendable lines 1… and remembers which screen line each is", () => {
    const first = aLine({ drCr: "DR", ledgerId: "kvb", amount: "1,500", remarks: " withdrawn " });
    const half = aLine({ drCr: "CR", ledgerId: "", amount: "9" });
    const second = aLine({ drCr: "CR", ledgerId: "cash", amount: "1500" });
    const { lines, keyOfRow } = buildLines([first, half, second, blankLine()]);
    expect(lines).toEqual([
      { rowNo: 1, drCr: "DR", ledgerId: "kvb", amount: "1500.00", remarks: "withdrawn" },
      { rowNo: 2, drCr: "CR", ledgerId: "cash", amount: "1500.00" },
    ]);
    expect(keyOfRow.get(2)).toBe(second.key);
  });

  it("sends the header's optional fields only when they say something", () => {
    expect(
      buildHeader({
        voucherId: null,
        companyId: "co",
        branchId: "br",
        accYear: "2026-2027",
        typeCode: "Con",
        date: "2026-10-03",
        docRefno: "  ",
        docDate: "",
        remarks: "",
        employeeId: "",
        partyId: "party",
        partyName: "",
        posStcd: "",
        reverseCharge: false,
        dueDays: null,
      }),
    ).toEqual({ companyId: "co", branchId: "br", accYear: "2026-2027", typeCode: "Con", date: "2026-10-03" });
  });
});

describe("reading a voucher back", () => {
  it("rebuilds a posted voucher from its typed legs", () => {
    const lines = linesFromLegs([
      { avId: "2", rowNo: 2, drCr: "CR", ledgerId: "kvb", ledgerName: "Kvb Current A/c", groupName: "Bank Accounts", amount: 1500, role: null, generated: false, remarks: null },
      { avId: "1", rowNo: 1, drCr: "DR", ledgerId: "cash", ledgerName: "Cashin Hand", groupName: "Cash-in-Hand", amount: 1500, role: null, generated: false, remarks: "petty" },
    ]);
    expect(lines.map((line) => [line.drCr, line.ledgerName, line.amount, line.remarks])).toEqual([
      ["DR", "Cashin Hand", "1500.00", "petty"],
      ["CR", "Kvb Current A/c", "1500.00", ""],
    ]);
  });

  it("rebuilds a draft from its stored payload, and names it from the work-out", () => {
    const lines = linesFromDraft({
      lines: [
        { rowNo: 1, drCr: "DR", ledgerId: "cash", amount: "1500.00" },
        { rowNo: 2, drCr: "CR", ledgerId: "kvb", amount: 1500 },
      ],
    });
    expect(lines.map((line) => [line.drCr, line.ledgerId, line.amount, line.ledgerName])).toEqual([
      ["DR", "cash", "1500.00", ""],
      ["CR", "kvb", "1500.00", ""],
    ]);
    const { keyOfRow } = buildLines(lines);
    const named = adoptNames(
      lines,
      [
        { lineRowNo: 1, ledgerId: "cash", ledgerName: "Cashin Hand", groupName: "Cash-in-Hand" },
        { lineRowNo: 2, ledgerId: "kvb", ledgerName: "Kvb Current A/c", groupName: "Bank Accounts" },
      ],
      keyOfRow,
    );
    expect(named.map((line) => line.ledgerName)).toEqual(["Cashin Hand", "Kvb Current A/c"]);
    // Nothing new to adopt: the same array comes back, so nothing re-renders.
    expect(adoptNames(named, [], keyOfRow)).toBe(named);
  });
});
