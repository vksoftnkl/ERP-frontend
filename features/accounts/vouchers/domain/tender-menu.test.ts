import { describe, expect, it } from "vitest";
import type { InstrumentTenderRow, VoucherTypeRules } from "../vouchers.types";
import { emptyInstrument } from "./instruments";
import { blankLine, buildLines, handDifference, linesTotals, newLineSide, withTrailingLine, type VoucherLine } from "./lines";
import {
  applyMoneyTender,
  instrumentOfTender,
  isMoneyRow,
  noTenderMessage,
  openPartyLines,
  opensTenderMenu,
  settleMoneyLine,
  tenderLabel,
  tenderMenu,
  tenderNeedsDetails,
  typedSide,
} from "./tender-menu";

type Rules = Pick<VoucherTypeRules, "typeCode" | "partyMode" | "partySide" | "instruments">;
const RCPV: Rules = { typeCode: "RcpV", partyMode: "MANY", partySide: "CR", instruments: true };
const PMTV: Rules = { typeCode: "PmtV", partyMode: "MANY", partySide: "DR", instruments: true };
const CONTRA: Rules = { typeCode: "Con", partyMode: "NONE", partySide: "ANY", instruments: false };
const JOURNAL: Rules = { typeCode: "Jrl", partyMode: "NONE", partySide: "ANY", instruments: false };

function tender(partial: Partial<InstrumentTenderRow>): InstrumentTenderRow {
  return {
    tenderId: "t",
    name: "T",
    shortName: null,
    typeId: 1,
    typeName: "CASH",
    ledgerId: "led-t",
    ledgerName: "T ledger",
    settlementLedgerId: null,
    isCash: false,
    isCheque: false,
    needsRef: false,
    hotkey: null,
    displayPosition: 1,
    ...partial,
  };
}

const CASH = tender({ tenderId: "cash", name: "CASH", typeName: "CASH", isCash: true, ledgerId: "led-cash", ledgerName: "Cash In Hand" });
const UPI = tender({ tenderId: "upi", name: "UPI", typeId: 3, typeName: "UPI", needsRef: true, ledgerId: "led-kvb", ledgerName: "Kvb Current A/c" });
const BANK = tender({ tenderId: "bank", name: "KVB NEFT", typeId: 6, typeName: "BANK", ledgerId: "led-kvb", ledgerName: "Kvb Current A/c" });
const CHEQUE = tender({ tenderId: "chq", name: "CHEQUE", typeId: 5, typeName: "CHEQUE", isCheque: true, ledgerId: "led-cih", ledgerName: "Cheques In Hand" });
const CREDIT = tender({ tenderId: "credit", name: "CREDIT", typeId: 2, typeName: "CREDIT", ledgerId: "", ledgerName: "" });
const TENDERS = [CASH, UPI, BANK, CHEQUE, CREDIT];

const sideOf = (rules: Rules) => (current: readonly VoucherLine[]) => newLineSide(current, rules);

/** Party lines with their amounts, then the blank line the way the grid keeps it. */
function partyFirst(rules: Rules, ...amounts: string[]): VoucherLine[] {
  const party = rules.partySide === "DR" ? "DR" : "CR";
  const lines = amounts.map((amount, index) => ({
    ...blankLine(party),
    ledgerId: `led-party-${index + 1}`,
    ledgerName: `Party ${index + 1}`,
    flags: { isParty: true, isBillByBill: false, isTdsApplicable: false },
    amount,
  }));
  return withTrailingLine(lines, sideOf(rules));
}

describe("notes 130 · the money side of a receipt / payment is a tender list", () => {
  it("is the typed (non-party) side of a type that takes instruments", () => {
    expect(typedSide("CR")).toBe("DR");
    expect(typedSide("DR")).toBe("CR");
    expect(typedSide("ANY")).toBe("DR");
    expect(isMoneyRow(RCPV, { drCr: "DR" })).toBe(true);
    expect(isMoneyRow(RCPV, { drCr: "CR" })).toBe(false);
    expect(isMoneyRow(PMTV, { drCr: "CR" })).toBe(true);
    expect(isMoneyRow(PMTV, { drCr: "DR" })).toBe(false);
    // No instruments, or no party side: never.
    expect(isMoneyRow({ ...RCPV, instruments: false }, { drCr: "DR" })).toBe(false);
    expect(isMoneyRow(CONTRA, { drCr: "DR" })).toBe(false);
    expect(isMoneyRow(null, { drCr: "DR" })).toBe(false);
    expect(isMoneyRow(RCPV, null)).toBe(false);
  });

  it("opens the tender list on every Contra line and on the money line only", () => {
    expect(opensTenderMenu(CONTRA, { drCr: "DR" })).toBe(true);
    expect(opensTenderMenu(CONTRA, { drCr: "CR" })).toBe(true);
    expect(opensTenderMenu(RCPV, { drCr: "DR" })).toBe(true);
    expect(opensTenderMenu(RCPV, { drCr: "CR" })).toBe(false);
    expect(opensTenderMenu(PMTV, { drCr: "CR" })).toBe(true);
    expect(opensTenderMenu(JOURNAL, { drCr: "DR" })).toBe(false);
  });

  it("lists every tender the type takes on a money line; a Contra keeps its CASH + BANK-with-ledger", () => {
    expect(tenderMenu(TENDERS, false).map((row) => row.tenderId)).toEqual(["cash", "upi", "bank", "chq", "credit"]);
    expect(tenderMenu(TENDERS, true).map((row) => row.tenderId)).toEqual(["cash", "bank"]);
    expect(noTenderMessage(true)).toBe("There is no Cash or Bank tender to pick. Create one in Tender Master.");
    expect(noTenderMessage(false)).toBe("The tender list has not loaded — the server did not answer.");
  });

  it("reads tender → ledger, except a payment's non-cash tender and a tender with no ledger", () => {
    const receipt = { contra: false, paying: false };
    const payment = { contra: false, paying: true };
    expect(tenderLabel(CASH, receipt)).toBe("CASH  →  Cash In Hand");
    expect(tenderLabel(UPI, receipt)).toBe("UPI  →  Kvb Current A/c");
    expect(tenderLabel(CHEQUE, receipt)).toBe("CHEQUE  →  Cheques In Hand");
    expect(tenderLabel(CASH, payment)).toBe("CASH  →  Cash In Hand");
    // Drawn on the bank picked in its popup: the tender's own ledger would mislead.
    expect(tenderLabel(BANK, payment)).toBe("KVB NEFT");
    expect(tenderLabel(CHEQUE, payment)).toBe("CHEQUE");
    expect(tenderLabel(CREDIT, receipt)).toBe("CREDIT");
    // A Contra always names the ledger it posts to.
    expect(tenderLabel(BANK, { contra: true, paying: true })).toBe("KVB NEFT  →  Kvb Current A/c");
  });

  it("asks for details: receiving a cheque or a reference; paying anything but cash", () => {
    expect([CASH, UPI, BANK, CHEQUE].map((row) => tenderNeedsDetails(row, false))).toEqual([false, true, false, true]);
    expect([CASH, UPI, BANK, CHEQUE].map((row) => tenderNeedsDetails(row, true))).toEqual([false, true, true, true]);
    expect(instrumentOfTender(CHEQUE)).toEqual({
      ...emptyInstrument(),
      tenderId: "chq",
      tenderName: "CHEQUE",
      typeName: "CHEQUE",
      isCheque: true,
    });
  });
});

// Qt tests/register/test_register.cpp `money126`, its pure parts.
describe.each([
  ["RcpV", RCPV, "DR", "CR"],
  ["PmtV", PMTV, "CR", "DR"],
] as const)("money126 · %s: the tender goes on the party line", (_code, rules, moneySide, partySide) => {
  it("opens the next line on the money side, and the cash pick covers the party line", () => {
    const lines = partyFirst(rules, "10");
    expect(lines).toHaveLength(2);
    expect(lines[1].drCr).toBe(moneySide);
    expect(isMoneyRow(rules, lines[1])).toBe(true);

    const picked = applyMoneyTender(lines, lines[1].key, CASH, rules);
    expect(picked && "lines" in picked).toBe(true);
    if (!picked || !("lines" in picked)) return;
    // Cash goes straight on — nothing to ask.
    expect(picked.ask).toEqual([]);
    expect(picked.lines[0].instrument?.tenderId).toBe("cash");
    // The money line is gone; the blank line is back on the party side.
    expect(picked.lines).toHaveLength(2);
    expect(picked.lines[1]).toMatchObject({ ledgerId: "", amount: "", drCr: partySide });
    expect(picked.lines[1].key).not.toBe(lines[1].key);
    expect(isMoneyRow(rules, picked.lines[1])).toBe(false);
    // One line sent, with its instrument; the money leg is the server's.
    const sent = buildLines(picked.lines).lines;
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ drCr: partySide, ledgerId: "led-party-1", amount: "10.00", instrument: { tenderId: "cash" } });
  });

  it("refuses with no open party line above — and says who to type", () => {
    const who = rules.partySide === "DR" ? "supplier" : "customer";
    const blank = [blankLine(moneySide)];
    expect(applyMoneyTender(blank, blank[0].key, CASH, rules)).toEqual({
      refused: `Type the ${who} and amount first; the tender goes on its line. To change a line's tender, press Ctrl+Q on it.`,
    });
    // A line that already has its instrument is not open.
    const lines = partyFirst(rules, "10").map((line, index) =>
      index === 0 ? { ...line, instrument: instrumentOfTender(UPI) } : line,
    );
    const money = { ...blankLine(moneySide), sideChosen: true };
    const withMoney = [...lines.slice(0, -1), money];
    expect(openPartyLines(withMoney, money.key, partySide)).toEqual([]);
    expect(applyMoneyTender(withMoney, money.key, CASH, rules)).toHaveProperty("refused");
    // A money line no longer there: nothing.
    expect(applyMoneyTender(lines, "gone", CASH, rules)).toBeNull();
  });

  it("covers only the open party lines ABOVE the money line", () => {
    const lines = partyFirst(rules, "10", "5");
    // Two customers, then the money line: both open.
    expect(lines.map((line) => line.drCr)).toEqual([partySide, partySide, moneySide]);
    const moneyKey = lines[2].key;
    expect(openPartyLines(lines, moneyKey, partySide)).toEqual([lines[0].key, lines[1].key]);
    // Half-keyed (no amount) and lines below the money line are not.
    const below = { ...blankLine(partySide), ledgerId: "led-late", amount: "3", sideChosen: true };
    const halfKeyed = { ...lines[1], amount: "" };
    expect(openPartyLines([lines[0], halfKeyed, lines[2], below], moneyKey, partySide)).toEqual([lines[0].key]);
  });

  it("a tender with details: each open line is asked in turn, then the money line goes", () => {
    const lines = partyFirst(rules, "10", "5");
    const moneyKey = lines[2].key;
    const picked = applyMoneyTender(lines, moneyKey, CHEQUE, rules);
    if (!picked || !("lines" in picked)) throw new Error("expected a pick");
    expect(picked.ask).toEqual([lines[0].key, lines[1].key]);
    expect(picked.open).toEqual(picked.ask);
    expect(picked.start).toMatchObject({ tenderId: "chq", isCheque: true });
    // Nothing put on until the popup says.
    expect(picked.lines.map((line) => line.instrument)).toEqual([null, null, null]);

    // The first line's popup accepted (the grid re-sides its blank line).
    const cheque = { ...instrumentOfTender(CHEQUE), refNo: "004512", instrumentDate: "2026-10-17", bankName: "HDFC BANK" };
    let now = withTrailingLine(
      picked.lines.map((line) => (line.key === lines[0].key ? { ...line, instrument: cheque } : line)),
      sideOf(rules),
    );
    // One line still open: the money line stays for it.
    expect(isMoneyRow(rules, now[2])).toBe(true);
    expect(settleMoneyLine(now, moneyKey, picked.open, rules)).toBe(now);

    // The second accepted: the trailing money line re-sides, and settling replaces it.
    now = withTrailingLine(
      now.map((line) => (line.key === lines[1].key ? { ...line, instrument: { ...cheque, refNo: "004513" } } : line)),
      sideOf(rules),
    );
    expect(now[2].drCr).toBe(partySide);
    const settled = settleMoneyLine(now, moneyKey, picked.open, rules);
    expect(settled).toHaveLength(3);
    expect(settled.some((line) => line.key === moneyKey)).toBe(false);
    expect(settled[2]).toMatchObject({ ledgerId: "", drCr: partySide });
    expect(buildLines(settled).lines.map((line) => line.instrument?.refNo)).toEqual(["004512", "004513"]);
  });

  it("a typed money line (an old draft's Dr Cash In Hand) goes too once covered", () => {
    const lines = partyFirst(rules, "10").slice(0, 1);
    const typed: VoucherLine = { ...blankLine(moneySide), ledgerId: "led-cash", ledgerName: "Cash In Hand", amount: "10", sideChosen: true };
    const picked = applyMoneyTender(withTrailingLine([...lines, typed]), typed.key, CASH, rules);
    if (!picked || !("lines" in picked)) throw new Error("expected a pick");
    expect(buildLines(picked.lines).lines).toEqual([
      expect.objectContaining({ ledgerId: "led-party-1", instrument: { tenderId: "cash" } }),
    ]);
    expect(picked.lines.at(-1)).toMatchObject({ ledgerId: "", drCr: partySide });
  });
});

describe("the typed difference: an instrument balances its own line", () => {
  const withIns = (line: VoucherLine): VoucherLine => ({ ...line, instrument: instrumentOfTender(CASH) });

  it("leaves an instrument line out of the hand-balanced difference — the next line is the party's", () => {
    const [first, second] = partyFirst(RCPV, "10", "5");
    // Cr 10 with its instrument, Cr 5 without: the voucher is out by the 5 only.
    expect(handDifference([withIns(first), second])).toBe(-500);
    expect(newLineSide([withIns(first), second], RCPV)).toBe("DR");
    // Both covered: balanced, and the next line opens on the party side.
    expect(handDifference([withIns(first), withIns(second)])).toBe(0);
    expect(newLineSide([withIns(first), withIns(second)], RCPV)).toBe("CR");
    // A payment's Dr instrument line the same way.
    const [paid] = partyFirst(PMTV, "7");
    expect(handDifference([withIns(paid)])).toBe(0);
    expect(newLineSide([paid], PMTV)).toBe("CR");
  });

  it("counts an instrument line on both sides of the typed totals", () => {
    const [first, second] = partyFirst(RCPV, "10", "5");
    expect(linesTotals([withIns(first), second])).toEqual({ debit: 1000, credit: 1500, difference: -500 });
  });
});
