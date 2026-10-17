import { describe, expect, it } from "vitest";
import type { InstrumentTenderRow } from "../vouchers.types";
import {
  applyContraTender,
  contraTenderLabel,
  contraTenders,
  isContra,
  ledgerCellText,
  openingTenderIndex,
  tenderAtLetter,
} from "./contra";
import { blankLine, buildLines, finishLedgerPick, linesFromDraft, type VoucherLine } from "./lines";

function aTender(partial: Partial<InstrumentTenderRow>): InstrumentTenderRow {
  return {
    tenderId: "t",
    name: "Tender",
    shortName: null,
    typeId: 0,
    typeName: "",
    ledgerId: "",
    ledgerName: "",
    settlementLedgerId: null,
    isCash: false,
    isCheque: false,
    needsRef: false,
    hotkey: null,
    displayPosition: null,
    ...partial,
  };
}

const CASH = aTender({ tenderId: "t-cash", name: "Cash", typeId: 1, typeName: "CASH", isCash: true, ledgerId: "led-cash", ledgerName: "Cashin Hand" });
const KVB = aTender({ tenderId: "t-kvb", name: "KVB NEFT", typeId: 6, typeName: "BANK", ledgerId: "led-kvb", ledgerName: "Kvb Current A/c" });
const UPI = aTender({ tenderId: "t-upi", name: "UPI", typeId: 3, typeName: "UPI", ledgerId: "led-upi", ledgerName: "UPI Clearing" });
const CHEQUE = aTender({ tenderId: "t-chq", name: "Cheque", typeId: 5, typeName: "CHEQUE", isCheque: true, ledgerId: "led-cih", ledgerName: "Cheques In Hand" });
const CREDIT = aTender({ tenderId: "t-cr", name: "Credit", typeId: 2, typeName: "CREDIT" });
const SBI = aTender({ tenderId: "t-sbi", name: "SBI IMPS", typeId: 6, typeName: "BANK", ledgerId: "led-sbi", ledgerName: "SBI Current A/c" });
const ALL = [CASH, UPI, KVB, CHEQUE, CREDIT, SBI];

// Qt tests/register/test_register.cpp `contra126`, its pure parts.
describe("notes 126 §6 · Contra: Cash and Bank tenders, the ledgers come from them", () => {
  it("is the Con type only", () => {
    expect(isContra({ typeCode: "Con" })).toBe(true);
    expect(isContra({ typeCode: "RcpV" })).toBe(false);
    expect(isContra(null)).toBe(false);
  });

  it("offers the CASH and BANK tenders that name a ledger, in the server's order", () => {
    expect(contraTenders(ALL).map((tender) => tender.tenderId)).toEqual(["t-cash", "t-kvb", "t-sbi"]);
    expect(contraTenders([CASH, aTender({ tenderId: "t-nb", typeName: "BANK" })])).toEqual([CASH]);
    expect(contraTenders([UPI, CHEQUE, CREDIT])).toEqual([]);
  });

  it("shows each as tender → ledger", () => {
    expect(contraTenderLabel(KVB)).toBe("KVB NEFT  →  Kvb Current A/c");
  });

  it("posts each line to its tender's ledger, and the payload carries lines[].tenderId", () => {
    // Cash deposited into the bank: Dr bank, Cr cash.
    let lines: VoucherLine[] = [blankLine("DR")];
    const first = lines[0].key;
    lines = finishLedgerPick(lines.map((line) => applyContraTender(line, KVB)), first, null);
    lines = lines.map((line) => (line.key === first ? { ...line, amount: "10" } : line));
    expect(lines).toHaveLength(2);
    const second = lines[1].key;
    lines = lines.map((line) => (line.key === second ? { ...line, drCr: "CR" } : line));
    lines = finishLedgerPick(
      lines.map((line) => (line.key === second ? applyContraTender(line, CASH) : line)),
      second,
      null,
    );
    lines = lines.map((line) => (line.key === second ? { ...line, amount: "10" } : line));

    expect(lines.slice(0, 2).map((line) => [line.drCr, line.ledgerId, line.tenderId])).toEqual([
      ["DR", "led-kvb", "t-kvb"],
      ["CR", "led-cash", "t-cash"],
    ]);
    // A cash or bank ledger is no party: no bills, no TDS, and the group is the server's to say.
    expect(lines[0]).toMatchObject({
      groupName: "",
      flags: { isParty: false, isBillByBill: false, isTdsApplicable: false },
    });
    expect(ledgerCellText(lines[0], [])).toBe("KVB NEFT · Kvb Current A/c");
    expect(buildLines(lines).lines).toEqual([
      { rowNo: 1, drCr: "DR", ledgerId: "led-kvb", amount: "10.00", tenderId: "t-kvb" },
      { rowNo: 2, drCr: "CR", ledgerId: "led-cash", amount: "10.00", tenderId: "t-cash" },
    ]);
  });

  it("keeps the line's side — the tender is the from or the to of the voucher", () => {
    const line = { ...blankLine("CR"), sideChosen: true };
    expect(applyContraTender(line, KVB)).toMatchObject({ drCr: "CR", sideChosen: true, ledgerId: "led-kvb" });
  });

  it("sends no tenderId on a line without one", () => {
    const line: VoucherLine = { ...blankLine("DR"), ledgerId: "led-kvb", amount: "10" };
    expect(buildLines([line]).lines[0]).not.toHaveProperty("tenderId");
  });

  it("reads the tender back from a draft, and names it from the loaded tenders", () => {
    const lines = linesFromDraft({
      lines: [
        { rowNo: 1, drCr: "DR", ledgerId: "led-kvb", amount: "10.00", tenderId: "t-kvb" },
        { rowNo: 2, drCr: "CR", ledgerId: "led-cash", amount: 10, tenderId: null },
      ],
    });
    expect(lines.map((line) => [line.tenderId, line.tenderName])).toEqual([
      ["t-kvb", ""],
      ["", ""],
    ]);
    // The draft has ids only: the ledger name arrives with the first work-out.
    expect(ledgerCellText(lines[0], ALL)).toBe("KVB NEFT · …");
    expect(ledgerCellText({ ...lines[0], ledgerName: "Kvb Current A/c" }, ALL)).toBe("KVB NEFT · Kvb Current A/c");
    // A tender no longer offered: the ledger alone.
    expect(ledgerCellText({ ...lines[0], ledgerName: "Kvb Current A/c" }, [])).toBe("Kvb Current A/c");
    expect(ledgerCellText({ ...lines[1], ledgerName: "Cashin Hand" }, ALL)).toBe("Cashin Hand");
    expect(ledgerCellText(blankLine(), ALL)).toBe("");
  });
});

describe("the tender list's keys", () => {
  const list = contraTenders(ALL);

  it("jumps to the next tender starting with a typed letter, round from the top", () => {
    expect(tenderAtLetter(list, 0, "k")).toBe(1);
    expect(tenderAtLetter(list, 0, "S")).toBe(2);
    expect(tenderAtLetter(list, 0, "c")).toBe(0);
    expect(tenderAtLetter(list, 0, "z")).toBe(-1);
    expect(tenderAtLetter([], -1, "c")).toBe(-1);
  });

  it("opens on the letter that opened it, else on the line's own tender, else the first", () => {
    expect(openingTenderIndex(list, "t-sbi", "k")).toBe(1);
    expect(openingTenderIndex(list, "t-sbi", "z")).toBe(2);
    expect(openingTenderIndex(list, "t-sbi", "")).toBe(2);
    expect(openingTenderIndex(list, "", "")).toBe(0);
    expect(openingTenderIndex(list, "t-gone", "")).toBe(0);
  });
});
