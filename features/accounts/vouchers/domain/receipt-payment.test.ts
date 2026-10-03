import { describe, expect, it } from "vitest";
import type {
  InstrumentTenderRow,
  OpenBillRow,
  VoucherChequeBook,
  VoucherPayload,
  VoucherTypeRules,
} from "../vouchers.types";
import {
  allToAdvance,
  billRows,
  billsChip,
  billsFromDraft,
  buildAllocations,
  editBill,
  fillOldestFirst,
  picksOf,
  wantsAutoFill,
} from "./bills";
import { generatedFromDerived, legOrigin, readPosted } from "./generated";
import {
  acceptInstrument,
  emptyInstrument,
  formOf,
  instrumentBody,
  instrumentFields,
  instrumentSummary,
  payingBanks,
  type LineInstrument,
} from "./instruments";
import {
  adoptNames,
  balancingAmount,
  blankLine,
  buildLines,
  formatPaise,
  linesFromDraft,
  newLineSide,
  sideLocked,
  typeAmount,
  withTrailingLine,
  type VoucherLine,
} from "./lines";

const RCPV: Pick<VoucherTypeRules, "partyMode" | "partySide" | "nature"> = {
  partyMode: "MANY",
  partySide: "CR",
  nature: "RECEIPT",
};
const PMTV: Pick<VoucherTypeRules, "partyMode" | "partySide" | "nature"> = {
  partyMode: "MANY",
  partySide: "DR",
  nature: "PAYMENT",
};
const CONTRA: Pick<VoucherTypeRules, "partyMode" | "partySide" | "nature"> = {
  partyMode: "NONE",
  partySide: "ANY",
  nature: "CONTRA",
};

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
const BANK = tender({ tenderId: "bank", name: "BANK", typeId: 6, typeName: "BANK", ledgerId: "led-kvb", ledgerName: "Kvb Current A/c" });
const CHEQUE = tender({ tenderId: "chq", name: "CHEQUE", typeId: 5, typeName: "CHEQUE", isCheque: true, ledgerId: "led-cih", ledgerName: "Cheques In Hand" });
const TENDERS = [CASH, UPI, BANK, CHEQUE];

const BOOK: VoucherChequeBook = {
  chequeBookId: "book-1",
  bankLedgerId: "led-kvb",
  bankName: "Kvb Current A/c",
  bookNo: "ZT-PAY-01",
  leafFrom: "94320000",
  leafTo: "94320049",
  nextLeaf: "94320010",
  left: 40,
  format: null,
};

function party(partial: Partial<VoucherLine> = {}): VoucherLine {
  return {
    ...blankLine("CR"),
    ledgerId: "led-cust",
    ledgerName: "Customer A",
    groupName: "Customers",
    flags: { isParty: true, isBillByBill: true, isTdsApplicable: false },
    ...partial,
  };
}

describe("instruments — what goes on the wire", () => {
  const form = (patch: Partial<ReturnType<typeof formOf>>) => ({ ...formOf(null, "2026-10-03", "Customer A", TENDERS), ...patch });

  it("a received cheque: number, date, drawee bank and the cheque's own details", () => {
    const result = acceptInstrument(
      form({ tenderId: "chq", refNo: " 004512 ", draweeBank: "HDFC BANK", drawerName: "A. Kumar", ifsc: "hdfc0001234" }),
      { paying: false, tenders: TENDERS, books: [], banks: [] },
    );
    expect("instrument" in result).toBe(true);
    const ins = (result as { instrument: LineInstrument }).instrument;
    expect(instrumentBody(ins)).toEqual({
      tenderId: "chq",
      refNo: "004512",
      instrumentDate: "2026-10-03",
      bankName: "HDFC BANK",
      cheque: { drawerName: "A. Kumar", ifsc: "HDFC0001234" },
    });
  });

  it("a received cheque needs its number, date and drawee bank — said in the dialog", () => {
    expect(
      acceptInstrument(form({ tenderId: "chq", refNo: "1", draweeBank: "" }), { paying: false, tenders: TENDERS, books: [], banks: [] }),
    ).toEqual({ error: "A cheque needs its number, date and drawee bank." });
    expect(
      acceptInstrument(form({ tenderId: "chq", refNo: "1", draweeBank: "SBI", ifsc: "SBIN123" }), {
        paying: false,
        tenders: TENDERS,
        books: [],
        banks: [],
      }),
    ).toHaveProperty("error");
  });

  it("a UPI receipt sends its reference and date; cash only the tender", () => {
    const upi = acceptInstrument(form({ tenderId: "upi", refNo: "UTR15" }), { paying: false, tenders: TENDERS, books: [], banks: [] });
    expect(instrumentBody((upi as { instrument: LineInstrument }).instrument)).toEqual({
      tenderId: "upi",
      refNo: "UTR15",
      instrumentDate: "2026-10-03",
    });
    const cash = acceptInstrument(form({ tenderId: "cash", refNo: "ignored" }), { paying: false, tenders: TENDERS, books: [], banks: [] });
    expect(instrumentBody((cash as { instrument: LineInstrument }).instrument)).toEqual({ tenderId: "cash" });
  });

  it("OUR cheque: the bank ledger and its book, favouring and crossing — never a number", () => {
    const banks = payingBanks([BOOK], [CASH, UPI, BANK, CHEQUE]);
    // The cheque tender's holding ledger is no bank to pay from.
    expect(banks).toEqual([{ ledgerId: "led-kvb", name: "Kvb Current A/c" }]);
    const result = acceptInstrument(
      { ...formOf(null, "2026-10-03", "Supplier A", TENDERS), tenderId: "chq", bankLedgerId: "led-kvb", chequeBookId: "book-1", refNo: "999" },
      { paying: true, tenders: TENDERS, books: [BOOK], banks },
    );
    const ins = (result as { instrument: LineInstrument }).instrument;
    expect(instrumentBody(ins)).toEqual({
      tenderId: "chq",
      instrumentDate: "2026-10-03",
      bankLedgerId: "led-kvb",
      chequeBookId: "book-1",
      favouring: "Supplier A",
      acPayee: true,
    });
    expect(instrumentSummary(ins)).toBe("Kvb Current A/c · book ZT-PAY-01 · leaf 94320010 (next) · 03-10");
  });

  it("OUR cheque on a bank with no open book is refused in the dialog", () => {
    expect(
      acceptInstrument(
        { ...formOf(null, "2026-10-03", "S", TENDERS), tenderId: "chq", bankLedgerId: "led-other", chequeBookId: "" },
        { paying: true, tenders: TENDERS, books: [BOOK], banks: [{ ledgerId: "led-other", name: "Other" }] },
      ),
    ).toEqual({ error: "This bank has no open cheque book — open one in Issued Cheques (52)." });
  });

  it("a payment transfer names our bank and its UTR; payment cash only the tender", () => {
    const banks = payingBanks([BOOK], TENDERS);
    const transfer = acceptInstrument(
      { ...formOf(null, "2026-10-03", "S", TENDERS), tenderId: "bank", bankLedgerId: "led-kvb", refNo: "KVBN26" },
      { paying: true, tenders: TENDERS, books: [BOOK], banks },
    );
    expect(instrumentBody((transfer as { instrument: LineInstrument }).instrument)).toEqual({
      tenderId: "bank",
      refNo: "KVBN26",
      bankLedgerId: "led-kvb",
    });
    expect(
      acceptInstrument({ ...formOf(null, "2026-10-03", "S", TENDERS), tenderId: "bank", bankLedgerId: "" }, {
        paying: true,
        tenders: TENDERS,
        books: [BOOK],
        banks,
      }),
    ).toEqual({ error: "Pick the bank account it is paid from." });
  });

  it("the dialog asks per side what the server reads", () => {
    expect(instrumentFields(CHEQUE, true)).toMatchObject({ bankAccount: true, book: true, reference: false, date: true });
    expect(instrumentFields(CHEQUE, false)).toMatchObject({ bankAccount: false, book: false, reference: true, receivedCheque: true });
    expect(instrumentFields(BANK, false)).toMatchObject({ reference: false, date: false });
    expect(instrumentFields(UPI, false)).toMatchObject({ reference: true, date: true, referenceCaption: "Reference / UTR" });
  });
});

describe("receipt / payment lines — party first", () => {
  it("a new line opens on the party side while the hand-keyed lines balance", () => {
    expect(newLineSide([], RCPV)).toBe("CR");
    expect(newLineSide([], PMTV)).toBe("DR");
    expect(newLineSide([], CONTRA)).toBe("DR");
    // A customer without an instrument: the next line balances it, on DR.
    expect(newLineSide([party({ amount: "1000" })], RCPV)).toBe("DR");
    // With an instrument the line balances itself: the next customer, on CR.
    const withCash = party({ amount: "1000", instrument: { ...emptyInstrument(), tenderId: "cash" } });
    expect(newLineSide([withCash], RCPV)).toBe("CR");
  });

  it("the trailing blank line follows the balance — unless its side was set by hand", () => {
    const lines = withTrailingLine([party({ amount: "1000" })], (current) => newLineSide(current, RCPV));
    expect(lines[1].drCr).toBe("DR");
    const chosen = { ...lines[1], drCr: "CR" as const, sideChosen: true };
    expect(withTrailingLine([lines[0], chosen], (current) => newLineSide(current, RCPV))[1].drCr).toBe("CR");
  });

  it("a ledger picked on the balancing side opens with the difference", () => {
    const cash: VoucherLine = { ...blankLine("DR"), ledgerId: "led-cash", ledgerName: "Cash" };
    const lines = [party({ amount: "1,500" }), party({ ledgerId: "led-b", amount: "250.50" }), cash];
    expect(balancingAmount(lines, cash.key, RCPV)).toBe("1750.50");
    // Not on the party side, not on a line with an amount, not on a Contra.
    const another = party({ amount: "" });
    expect(balancingAmount([party({ amount: "10" }), another], another.key, RCPV)).toBeNull();
    expect(balancingAmount(lines, cash.key, CONTRA)).toBeNull();
  });

  it("on a receipt or payment the side follows the ledger", () => {
    const line = party({ drCr: "CR", amount: "100" });
    expect(sideLocked(line, "RECEIPT")).toBe(true);
    expect(sideLocked({ ...line, ledgerId: "" }, "RECEIPT")).toBe(false);
    expect(sideLocked(line, "CONTRA")).toBe(false);
    // A figure in the other column goes to the line's own.
    expect(typeAmount(line, "DR", "250", true)).toMatchObject({ drCr: "CR", amount: "250" });
    expect(typeAmount(line, "DR", "250", false)).toMatchObject({ drCr: "DR", amount: "250" });
  });

  it("sends the TDS base only when said, and the instrument's body", () => {
    const said = party({ drCr: "DR", amount: "9800", tdsBase: false });
    const unsaid = party({ drCr: "DR", ledgerId: "led-b", amount: "100", instrument: { ...emptyInstrument(), tenderId: "cash" } });
    expect(buildLines([said, unsaid]).lines).toEqual([
      { rowNo: 1, drCr: "DR", ledgerId: "led-cust", amount: "9800.00", tdsBase: false },
      { rowNo: 2, drCr: "DR", ledgerId: "led-b", amount: "100.00", instrument: { tenderId: "cash" } },
    ]);
  });

  it("a reopened draft brings back its instruments and TDS flags, and adopts the server's answer on them", () => {
    const lines = linesFromDraft({
      lines: [
        { rowNo: 1, drCr: "DR", ledgerId: "kl", amount: "1500.00", instrument: { tenderId: "cash" } },
        {
          rowNo: 2,
          drCr: "DR",
          ledgerId: "balu",
          amount: "2500.00",
          tdsBase: true,
          instrument: { tenderId: "chq", bankLedgerId: "led-kvb", chequeBookId: "book-1", instrumentDate: "2026-10-09" },
        },
      ],
    });
    expect(lines[0].instrument?.tenderId).toBe("cash");
    expect(lines[1].tdsBase).toBe(true);
    expect(lines.every((line) => line.sideChosen)).toBe(true);
    const { keyOfRow } = buildLines(lines);
    const adopted = adoptNames(
      lines,
      [
        { lineRowNo: 1, ledgerId: "kl", ledgerName: "KL ELECTRICS", groupName: "Suppliers", generated: false, instrument: null },
        {
          lineRowNo: 2,
          ledgerId: "balu",
          ledgerName: "Balu",
          groupName: "Suppliers",
          generated: false,
          postDated: true,
          postsOn: "2026-10-09",
          instrument: {
            tenderId: "chq",
            tenderName: "CHEQUE",
            tenderTypeId: 5,
            tenderTypeName: "CHEQUE",
            ledgerId: "led-kvb",
            ledgerName: "Kvb Current A/c",
            refNo: "94320010",
            instrumentDate: "2026-10-09",
            bankName: "Kvb Current A/c",
            isCheque: true,
            isPostDated: true,
            postsOn: "2026-10-09",
            cheque: null,
            settlementMode: "CHEQUE",
            issued: true,
            bankLedgerId: "led-kvb",
            chequeBookId: "book-1",
            bookNo: "ZT-PAY-01",
            nextLeaf: "94320010",
            favouring: "Balu",
            acPayee: true,
          },
        },
      ],
      keyOfRow,
    );
    expect(adopted[1].instrument).toMatchObject({
      typeName: "CHEQUE",
      isCheque: true,
      isPostDated: true,
      postsOn: "2026-10-09",
      nextLeaf: "94320010",
      bookNo: "ZT-PAY-01",
      // Never adopted into what is sent: the leaf is the server's to take.
      refNo: "",
    });
    expect(instrumentBody(adopted[1].instrument!)).not.toHaveProperty("refNo");
    // Nothing new the second time round: the same array.
    expect(adoptNames(adopted, [], keyOfRow)).toBe(adopted);
  });
});

describe("bill-wise", () => {
  const bill = (partial: Partial<OpenBillRow>): OpenBillRow => ({
    ablId: "b",
    ablAccYear: "2026-2027",
    refno: null,
    docRefno: null,
    date: "2026-09-01",
    dueDate: null,
    billType: "SALES",
    side: "DR",
    billAmount: 0,
    pending: 0,
    ...partial,
  });
  const open = [
    bill({ ablId: "late", docRefno: "SB-3", date: "2026-09-20", pending: 500 }),
    bill({ ablId: "early", refno: "sb00001", date: "2026-08-01", dueDate: "2026-08-31", pending: 700 }),
    bill({ ablId: "mid", docRefno: "SB-2", date: "2026-09-02", pending: 300, ablAccYear: "2025-2026" }),
  ];

  it("fills oldest first (due date, else the bill's own), each up to what it owes", () => {
    const rows = fillOldestFirst(billRows(open, []), 90000);
    expect(rows.map((row) => [row.ablId, row.thisPaise])).toEqual([
      ["early", 70000],
      ["mid", 20000],
      ["late", 0],
    ]);
  });

  it("a typed figure never passes what the bill owes, nor the amount left", () => {
    const rows = fillOldestFirst(billRows(open, []), 90000);
    expect(editBill(rows, 2, "999", 90000)[2].thisPaise).toBe(0); // 70,000 + 20,000 already take it all
    const freed = editBill(rows, 1, "0", 90000);
    expect(editBill(freed, 2, "999", 90000)[2].thisPaise).toBe(20000);
    expect(editBill(freed, 0, "800", 90000)[0].thisPaise).toBe(70000);
    expect(allToAdvance(rows).every((row) => row.thisPaise === 0)).toBe(true);
  });

  it("keeps the figures per screen line and sends them under that line's rowNo", () => {
    const rows = fillOldestFirst(billRows(open, []), 90000);
    const picks = picksOf(rows);
    expect(picks).toEqual([
      { billId: "early", billAccYear: "2026-2027", label: "sb00001", paise: 70000 },
      { billId: "mid", billAccYear: "2025-2026", label: "SB-2", paise: 20000 },
    ]);
    const keyOfRow = new Map([
      [1, "line-a"],
      [2, "line-b"],
    ]);
    expect(buildAllocations({ "line-b": { picks, auto: true }, gone: { picks, auto: true } }, keyOfRow)).toEqual([
      { lineRowNo: 2, billId: "early", billAccYear: "2026-2027", amount: "700.00" },
      { lineRowNo: 2, billId: "mid", billAccYear: "2025-2026", amount: "200.00" },
    ]);
  });

  it("refills on an automatic or over-allocated line, keeps a hand-set one", () => {
    expect(wantsAutoFill(undefined, 100)).toBe(true);
    const picks = [{ billId: "a", billAccYear: "y", label: "", paise: 500 }];
    expect(wantsAutoFill({ picks, auto: true }, 1000)).toBe(true);
    expect(wantsAutoFill({ picks, auto: false }, 1000)).toBe(false);
    expect(wantsAutoFill({ picks, auto: false }, 400)).toBe(true);
    // Shown against the bill's figures kept from before.
    expect(billRows(open, [{ billId: "late", billAccYear: "2026-2027", label: "", paise: 999999 }]).find((row) => row.ablId === "late")?.thisPaise).toBe(50000);
  });

  it("reads a draft's stored allocations back onto its lines", () => {
    const kept = billsFromDraft(
      { allocations: [{ lineRowNo: 2, billId: "early", billAccYear: "2026-2027", amount: "700.00" }, { lineRowNo: 9, billId: "x", amount: 5 }] },
      new Map([
        [1, "line-a"],
        [2, "line-b"],
      ]),
    );
    expect(kept).toEqual({ "line-b": { picks: [{ billId: "early", billAccYear: "2026-2027", label: "", paise: 70000 }], auto: false } });
  });

  it("the chip says the bills and the advance", () => {
    const picks = [{ billId: "a", billAccYear: "y", label: "", paise: 70000 }];
    expect(billsChip({ picks, auto: true }, 100000, null, "adv", formatPaise)).toBe("1 bill · 300.00 adv");
    expect(billsChip({ picks, auto: true }, 100000, 0, "adv", formatPaise)).toBe("1 bill");
    expect(billsChip(undefined, 50000, null, "adv", formatPaise)).toBe("500.00 adv");
  });
});

describe("the server's own legs", () => {
  it("says where each came from", () => {
    expect(legOrigin("INSTRUMENT", [2], false, null)).toBe("from line 2");
    expect(legOrigin("INSTRUMENT", [3], true, "2026-10-06")).toBe("from line 3 — its own voucher, dated 06-10");
    expect(legOrigin("TDS", [1], false, null)).toBe("from the party's TDS section");
    expect(legOrigin("TYPED", [], false, null)).toBe("");
  });

  it("draws only the generated legs of a work-out", () => {
    const rows = generatedFromDerived([
      { rowNo: 1, lineRowNo: 1, drCr: "DR", ledgerId: "s", ledgerName: "Supplier", groupName: "Suppliers", amount: 10000, generated: false, source: "TYPED", role: null, remarks: null },
      { rowNo: 2, lineRowNo: null, drCr: "CR", ledgerId: "kvb", ledgerName: "Kvb", groupName: null, amount: 9800, generated: true, source: "INSTRUMENT", role: null, remarks: "CHEQUE 94320010", fromRows: [1] },
      { rowNo: 3, lineRowNo: null, drCr: "CR", ledgerId: "tds", ledgerName: "TDS Payable", groupName: null, amount: 200, generated: true, source: "TDS", role: "TDS_PAYABLE", remarks: "TDS 194C @ 2% on 10000.00 — Supplier", fromRows: [1] },
    ]);
    expect(rows.map((row) => [row.ledgerName, row.paise, row.role, row.narration])).toEqual([
      ["Kvb", 980000, "", "CHEQUE 94320010 · from line 1"],
      ["TDS Payable", 20000, "TDS_PAYABLE", "TDS 194C @ 2% on 10000.00 — Supplier · from the party's TDS section"],
    ]);
  });

  it("reads a posted receipt back whole — a post-dated cheque's own voucher folded in at its line", () => {
    const leg = (partial: Record<string, unknown>) => ({ role: null, remarks: null, groupName: null, generated: false, ...partial });
    const ins = (partial: Record<string, unknown>) => ({
      tdId: "td",
      tdAccYear: "2026-2027",
      partyName: null,
      tenderName: "CHEQUE",
      tenderTypeId: 5,
      tenderTypeName: "CHEQUE",
      ledgerId: "cih",
      refNo: null,
      instrumentDate: null,
      bankName: null,
      isCheque: true,
      isPostDated: false,
      voucherRefno: null,
      voucherDate: null,
      cheque: null,
      pdcId: null,
      pdcAccYear: null,
      pdcStatus: null,
      pdcBankLedgerId: null,
      issued: false,
      bankLedgerId: null,
      leaf: null,
      chequeBookId: null,
      bookNo: null,
      favouring: null,
      acPayee: null,
      ...partial,
    });
    // rcv00103's shape: lines 1 (cheque) and 3 (cash) today, line 2 a post-dated cheque.
    const payload = {
      header: { voucherId: "today" },
      legs: [
        leg({ avId: "1", rowNo: 1, drCr: "CR", ledgerId: "custA", ledgerName: "Customer A", amount: 6000 }),
        leg({ avId: "2", rowNo: 2, drCr: "CR", ledgerId: "custB", ledgerName: "Customer B", amount: 5000 }),
        leg({ avId: "3", rowNo: 3, drCr: "DR", ledgerId: "cih", ledgerName: "Cheques In Hand", amount: 6000, generated: true, remarks: "CHEQUE 4512", instrument: ins({ lineRowNo: 1, partyId: "custA", tenderId: "chq", amount: 6000, voucherId: "today" }) }),
        leg({ avId: "4", rowNo: 4, drCr: "DR", ledgerId: "cash", ledgerName: "Cash In Hand", amount: 5000, generated: true, remarks: "CASH" }),
      ],
      instruments: [
        ins({ lineRowNo: 1, partyId: "custA", tenderId: "chq", amount: 6000, refNo: "4512", voucherId: "today", pdcStatus: "BOUNCED" }),
        ins({ lineRowNo: 2, partyId: "custC", tenderId: "chq", amount: 4000, refNo: "4513", isPostDated: true, voucherId: "pdc", voucherRefno: "rcv00104", voucherDate: "2026-10-06", pdcStatus: "HELD" }),
        ins({ lineRowNo: 3, partyId: "custB", tenderId: "cash", tenderName: "CASH", tenderTypeName: "CASH", isCheque: false, amount: 5000, voucherId: "today" }),
      ],
      pdcVouchers: [
        {
          voucherId: "pdc",
          accYear: "2026-2027",
          voucherRefno: "rcv00104",
          date: "2026-10-06",
          status: "POSTED",
          partyId: "custC",
          partyName: "Customer C",
          reversalRefno: null,
          legs: [
            leg({ avId: "p1", rowNo: 1, drCr: "CR", ledgerId: "custC", ledgerName: "Customer C", amount: 4000 }),
            leg({ avId: "p2", rowNo: 2, drCr: "DR", ledgerId: "cih", ledgerName: "Cheques In Hand", amount: 4000, generated: true, remarks: "CHEQUE 4513" }),
          ],
          allocations: [],
        },
      ],
    } as unknown as VoucherPayload;
    const read = readPosted(payload);
    expect(read.lines.map((line) => [line.ledgerName, line.amount, line.instrument?.typeName, line.instrument?.isPostDated])).toEqual([
      ["Customer A", "6000.00", "CHEQUE", false],
      ["Customer C", "4000.00", "CHEQUE", true],
      ["Customer B", "5000.00", "CASH", false],
    ]);
    expect(read.lines[0].instrument?.pdcStatus).toBe("BOUNCED");
    expect(read.lines[1].instrument).toMatchObject({ postsOn: "2026-10-06", voucherRefno: "rcv00104" });
    expect(read.generated.map((row) => [row.ledgerName, row.postDated])).toEqual([
      ["Cheques In Hand", false],
      ["Cash In Hand", false],
      ["Cheques In Hand", true],
    ]);
    expect(read.postDated).toEqual([
      { lineNo: 2, partyName: "Customer C", paise: 400000, postsOn: "2026-10-06", refNo: "4513", voucherRefno: "rcv00104" },
    ]);
  });
});
