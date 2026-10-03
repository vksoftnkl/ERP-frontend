import { describe, expect, it } from "vitest";
import type { ReceiptAllocationWire, ReceiptLeg } from "@/features/accounts/receipt/receipt.types";
import {
  BANK,
  CHEQUE,
  UPI,
  aBill,
  aCredit,
  aHeader,
  aPaymentLine,
  aPaymentTender,
} from "../domain/fixtures";
import type {
  PaymentIssuedChequeWire,
  PaymentOpenItemsParty,
  PaymentOtherLineWire,
  PaymentTenderWire,
} from "../payment.types";
import {
  buildPaymentAllocations,
  buildPaymentAmendPayload,
  buildPaymentDraftPayload,
  buildPaymentLineBodies,
  buildPaymentPostPayload,
  buildPaymentTenderBodies,
} from "./build";
import {
  billSideOfApplied,
  debitsHeldOf,
  heldRowsFromApplied,
  linesFromLegs,
  parsePaymentLines,
  parsePaymentParty,
  parsePaymentTenders,
  totalDebitsOf,
} from "./parse";

describe("the tender bodies", () => {
  it("sends a cheque's BOOK and never a number — the leaf is the server's", () => {
    const [body] = buildPaymentTenderBodies([
      aPaymentTender({
        tenderTypeId: CHEQUE,
        tenderId: "tnd-chq",
        amount: 5000,
        refNo: "000123",
        bankName: "SBI Current",
        instrumentDate: "2026-10-03",
        cheque: { chequeBookId: "book-1", favouring: "Murugan Traders", acPayee: true },
      }),
    ]);
    expect(body).toEqual({
      tdRowNo: 1,
      tdTenderId: "tnd-chq",
      tdTenderTypeId: CHEQUE,
      tdTenderLedgerId: "led-cash",
      tdAmount: 5000,
      tdBankName: "SBI Current",
      tdInstrumentDate: "2026-10-03",
      cheque: { chequeBookId: "book-1", favouring: "Murugan Traders", acPayee: true },
    });
    expect(body).not.toHaveProperty("tdRefNo");
  });

  it("sends a transfer's charge, UTR and beneficiary — and no receipt-only keys", () => {
    const [body] = buildPaymentTenderBodies([
      aPaymentTender({
        tenderTypeId: BANK,
        amount: 5012.5,
        mdrAmt: 12.5,
        refNo: "UTR99",
        beneficiary: { name: "Murugan", accountNo: "00112233", ifsc: "sbin0001234" },
      }),
    ]);
    expect(body).toMatchObject({
      tdAmount: 5012.5,
      tdMdrAmt: 12.5,
      tdRefNo: "UTR99",
      beneficiary: { name: "Murugan", accountNo: "00112233", ifsc: "SBIN0001234" },
    });
    for (const key of ["tdSurchargePerc", "tdSurchargeAmt", "tdAuthCode", "tdCardLast4", "tdReceivedAmt", "tdChangeAmt"]) {
      expect(body).not.toHaveProperty(key);
    }
  });

  it("sends the payee's VPA on a UPI row only", () => {
    const [upi, bank] = buildPaymentTenderBodies([
      aPaymentTender({ tenderTypeId: UPI, amount: 100, payerVpa: "m@okaxis" }),
      aPaymentTender({ tenderTypeId: BANK, amount: 100, payerVpa: "stale@x" }),
    ]);
    expect(upi.tdPayerVpa).toBe("m@okaxis");
    expect(bank).not.toHaveProperty("tdPayerVpa");
    expect(bank.tdRowNo).toBe(2);
  });
});

describe("the line bodies", () => {
  it("names the posting user as a typed write-back's approver", () => {
    const bodies = buildPaymentLineBodies(
      [
        aPaymentLine("BALANCES_WRITTEN_BACK", { amount: 40 }),
        aPaymentLine("INTEREST_PAID", { amount: 25 }),
        aPaymentLine("WRITE_OFF", { amount: 20, seeded: true }),
      ],
      "user-1",
    );
    expect(bodies).toEqual([
      { role: "BALANCES_WRITTEN_BACK", drCr: "CR", amount: 40, settlesBill: true, approvedBy: "user-1" },
      { role: "INTEREST_PAID", drCr: "DR", amount: 25, settlesBill: false },
    ]);
  });
});

describe("the allocations", () => {
  it("sends a rounded-up bill at its exact figure, with roundoff 0", () => {
    const rows = buildPaymentAllocations(
      [aBill({ billId: "b1", pendingAmount: 4999.6, receive: 5000, roundOff: -0.4 })],
      [aPaymentLine("ROUND_OFF", { amount: 0.4, drCr: "DR", settlesBill: false, seeded: true })],
      "user-1",
    );
    expect(rows).toEqual([
      { billId: "b1", billAccYear: "2026-2027", amount: 4999.6, discount: 0, writeoff: 0, roundoff: 0 },
    ]);
  });

  it("puts the TDS inside the bill's amount and names the approver of a write-back", () => {
    const rows = buildPaymentAllocations(
      [aBill({ billId: "b1", pendingAmount: 10000, receive: 9850, writeOff: 50 })],
      [aPaymentLine("TDS_PAYABLE", { amount: 100, seeded: true })],
      "user-1",
    );
    expect(rows).toEqual([
      {
        billId: "b1",
        billAccYear: "2026-2027",
        amount: 9950,
        discount: 0,
        writeoff: 50,
        roundoff: 0,
        writeoffApprovedBy: "user-1",
      },
    ]);
  });

  it("claims the TDS on an advance as on account, matching the server", () => {
    const body = buildPaymentPostPayload({
      header: aHeader({ voucherId: "v1" }),
      bills: [],
      credits: [],
      tenders: [aPaymentTender({ amount: 49500 })],
      lines: [aPaymentLine("TDS_PAYABLE", { amount: 500, seeded: true })],
      userId: "user-1",
    });
    expect(body.allocations).toEqual([]);
    expect(body.onAccount).toBe(50000);
  });

  it("numbers a pin against the lines that travel", () => {
    const body = buildPaymentPostPayload({
      header: aHeader({ voucherId: "v1" }),
      bills: [aBill({ billId: "b1", pendingAmount: 10000, receive: 9900 })],
      credits: [],
      tenders: [aPaymentTender({ amount: 9900 })],
      lines: [
        aPaymentLine("DISCOUNT_RECEIVED", { amount: 0, seeded: true }),
        aPaymentLine("TDS_PAYABLE", {
          amount: 100,
          seeded: true,
          againstBillId: "b1",
          againstBillAccYear: "2026-2027",
        }),
      ],
      userId: "user-1",
    });
    expect(body.otherLineBills).toEqual([
      { lineNo: 1, billId: "b1", billAccYear: "2026-2027", amount: 100 },
    ]);
    expect(body.allocations[0].amount).toBe(10000);
    expect(body.onAccount).toBe(0);
  });
});

describe("the draft and amend bodies", () => {
  it("remembers a rounded-up bill at its exact figure and sends no beat", () => {
    const body = buildPaymentDraftPayload({
      header: aHeader({ areaId: "beat-1", employeeId: "emp-1" }),
      tenders: [aPaymentTender({ amount: 5000 })],
      lines: [],
      bills: [aBill({ billId: "b1", pendingAmount: 4999.6, receive: 5000, roundOff: -0.4 })],
      credits: [aCredit({ billId: "c1", apply: 100 })],
      userId: "user-1",
    });
    expect(body).not.toHaveProperty("areaId");
    expect(body.avhEmployeeId).toEqual(["emp-1"]);
    expect(body.allocations).toEqual([
      { billId: "b1", billAccYear: "2026-2027", amount: 4999.6, discount: 0, writeoff: 0, roundoff: 0 },
    ]);
    expect(body.creditsApplied).toEqual([{ billId: "c1", billAccYear: "2026-2027", amount: 100 }]);
    expect(body.replace).toBe(true);
  });

  it("restates a cheque without its old leaf, and carries the lock", () => {
    const body = buildPaymentAmendPayload({
      header: aHeader({ voucherId: "v1", status: "POSTED" }),
      tenders: [
        aPaymentTender({
          tenderTypeId: CHEQUE,
          amount: 5000,
          leaf: "000123",
          instrumentDate: "2026-09-18",
          cheque: { chequeBookId: "book-1", favouring: "M", acPayee: true },
        }),
      ],
      lines: [],
      bills: [aBill({ billId: "b1", pendingAmount: 5000, receive: 5000 })],
      credits: [],
      userId: "user-1",
      baseRevision: 3,
      editRemark: "  wrong bill  ",
    });
    expect(body.tenders[0]).not.toHaveProperty("tdRefNo");
    expect(body).toMatchObject({ avhVoucherId: "v1", baseRevision: 3, editRemark: "wrong bill" });
    expect(body.onAccount).toBe(0);
  });
});

describe("reading the server's answers", () => {
  const party: PaymentOpenItemsParty = {
    ledId: "p1",
    ledName: "Murugan Traders",
    groupName: "Sundry Creditors",
    isBillByBill: true,
    isMoneyLedger: false,
    isTdsApplicable: true,
    tdsSection: "194C",
    tdsDeducteeType: "NON_COMPANY",
    tdsRate: 0,
    tdsRateSource: "MASTER",
    tdsThresholdSingle: null,
    tdsThresholdAnnual: 100000,
    tdsPaidThisYear: 2500,
    panPresent: true,
    bank: { name: "SBI", accountNo: "00112233", ifsc: null },
    favouringName: "MURUGAN TRADERS",
  };

  it("keeps a zero TDS rate as a rate and a null one as none", () => {
    expect(parsePaymentParty(party).tdsRate).toBe(0);
    expect(parsePaymentParty({ ...party, tdsRate: null }).tdsRate).toBeNull();
    expect(parsePaymentParty(party)).toMatchObject({
      loaded: true,
      tdsThresholdSingle: 0,
      bankName: "SBI",
      bankIfsc: "",
      favouringName: "MURUGAN TRADERS",
    });
  });

  it("reads the held total under either spelling", () => {
    expect(debitsHeldOf({ totalPending: 0, billCount: 0, overdueCount: 0, creditsHeld: 70, pdcHeld: 0 })).toBe(70);
    expect(debitsHeldOf({ totalPending: 0, billCount: 0, overdueCount: 0, debitsHeld: 80, pdcHeld: 0 })).toBe(80);
    expect(totalDebitsOf({ totalBalance: 0, totalOutstanding: 0, totalCredits: 5, chequesOutstanding: 0 })).toBe(5);
  });

  const tenderWire = (partial: Partial<PaymentTenderWire>): PaymentTenderWire => ({
    tdId: "td",
    tdRowNo: 1,
    tdTenderId: "tnd",
    tdTenderName: "Cheque",
    tdTenderTypeId: CHEQUE,
    tdTenderLedgerId: "led-bank",
    tdAmount: 5000,
    tdSurchargePerc: 0,
    tdSurchargeAmt: 0,
    tdMdrAmt: 0,
    tdReceivedAmt: 0,
    tdChangeAmt: 0,
    tdRefNo: null,
    tdBankName: null,
    tdPayerVpa: null,
    tdInstrumentDate: "2026-10-03T00:00:00.000Z",
    tdIsPdc: false,
    tdVoucherId: null,
    beneficiary: null,
    cheque: null,
    ...partial,
  });

  it("restores a draft cheque's book from the row's own cheque{}", () => {
    const [row] = parsePaymentTenders(
      [tenderWire({ cheque: { chequeBookId: "book-1", bookNo: "004", favouring: "M", acPayee: false } })],
      [],
    );
    expect(row.cheque).toEqual({ chequeBookId: "book-1", favouring: "M", acPayee: false });
    expect(row.instrumentDate).toBe("2026-10-03");
    expect(row.refNo).toBe("");
  });

  it("restores a posted cheque's book and leaf from chequesIssued[]", () => {
    const issued: PaymentIssuedChequeWire = {
      pdcId: "pdc",
      accYear: "2026-2027",
      tenderRowNo: 1,
      instrumentType: "CHEQUE",
      instrumentNo: "000124",
      instrumentDate: "2026-10-03",
      amount: 5000,
      bankName: "SBI",
      bankLedgerId: "led-bank",
      chequeBookId: "book-1",
      bookNo: "004",
      favouring: "MURUGAN",
      acPayee: true,
      printed: false,
      printCount: 0,
      status: "HELD",
      voucherId: "v1",
    };
    const [row] = parsePaymentTenders([tenderWire({ tdRefNo: "000124" })], [issued]);
    expect(row.leaf).toBe("000124");
    expect(row.bookNo).toBe("004");
    expect(row.cheque.chequeBookId).toBe("book-1");
    expect(row.refNo).toBe("");
  });

  it("marks a draft's lines the way the screen keeps them", () => {
    const wire = (partial: Partial<PaymentOtherLineWire>): PaymentOtherLineWire => ({
      lineNo: 1,
      role: null,
      ledgerId: "led",
      ledgerName: "Ledger",
      drCr: "CR",
      amount: 10,
      settlesBill: true,
      narration: null,
      approvedBy: null,
      ...partial,
    });
    const lines = parsePaymentLines([
      wire({ lineNo: 1, role: "TDS_PAYABLE" }),
      wire({ lineNo: 2, role: "BANK_CHARGES", drCr: "DR", settlesBill: false }),
      wire({ lineNo: 3, role: "ROUND_OFF", drCr: "DR", settlesBill: true }),
      wire({ lineNo: 4, role: "INTEREST_PAID", drCr: "DR", settlesBill: false }),
    ]);
    expect(lines.map((line) => [line.role, line.seeded, line.settlesBill, line.ledgerId])).toEqual([
      ["TDS_PAYABLE", true, true, null],
      ["BANK_CHARGES", true, false, null],
      ["ROUND_OFF", false, false, null],
      ["INTEREST_PAID", false, false, null],
    ]);
  });

  it("reads a posted payment's lines back off its legs", () => {
    const leg = (partial: Partial<ReceiptLeg>): ReceiptLeg => ({
      avId: "av",
      avRowNo: 1,
      avDrCr: "DR",
      avLedgerId: "led",
      avLedgerName: "Ledger",
      avAmount: 0,
      avRole: null,
      avRemarks: null,
      ...partial,
    });
    const lines = linesFromLegs(
      [
        leg({ avRowNo: 1, avDrCr: "DR", avAmount: 10000, avRole: null }),
        leg({ avRowNo: 2, avDrCr: "CR", avAmount: 100, avRole: "TDS_PAYABLE" }),
        leg({ avRowNo: 3, avDrCr: "DR", avAmount: 12.5, avRole: "BANK_CHARGES" }),
        leg({ avRowNo: 4, avDrCr: "CR", avAmount: 70, avRole: "BALANCES_WRITTEN_BACK" }),
        leg({ avRowNo: 5, avDrCr: "CR", avAmount: 30, avRole: "DISCOUNT_RECEIVED" }),
        leg({ avRowNo: 6, avDrCr: "CR", avAmount: 9900, avRole: null }),
      ],
      [aBill({ writeOff: 50, discount: 30 })],
    );
    expect(lines.map((line) => [line.role, line.drCr, line.amount, line.seeded])).toEqual([
      ["TDS_PAYABLE", "CR", 100, true],
      ["BANK_CHARGES", "DR", 12.5, true],
      // 70 written back, 50 of it the W/back column: 20 was typed.
      ["BALANCES_WRITTEN_BACK", "CR", 20, false],
    ]);
  });

  it("reads each held-debit spend ONCE — the bill side of the pair the engine writes", () => {
    const row = (partial: Partial<ReceiptAllocationWire>): ReceiptAllocationWire => ({
      abjId: "abj",
      billId: "b1",
      billAccYear: "2026-2027",
      docRefno: "PUR/1",
      docDate: "2026-09-01",
      billType: "PURCHASE",
      billAmount: 10000,
      pendingAmount: 6000,
      dueDate: null,
      status: "PARTIAL",
      adjType: "ADVANCE_ADJUST",
      settlementMode: "ADVANCE",
      drCr: "DR",
      amount: 4000,
      adjDate: "2026-10-03",
      isPostDated: false,
      voucherId: "v1",
      chequeId: null,
      againstBillId: "adv1",
      againstBillRefno: "ADV/1",
      reversalOfId: null,
      isReversed: false,
      approvedBy: null,
      remarks: null,
      ...partial,
    });
    const pair = [
      row({}),
      row({ billId: "adv1", docRefno: "ADV/1", drCr: "CR", againstBillId: "b1", againstBillRefno: "PUR/1" }),
    ];
    expect(billSideOfApplied(pair)).toHaveLength(1);
    expect(heldRowsFromApplied(pair)).toMatchObject([
      { billId: "adv1", docRefno: "ADV/1", apply: 4000 },
    ]);
  });
});
