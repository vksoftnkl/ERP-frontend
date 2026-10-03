import { describe, expect, it } from "vitest";
import { computeIdentity } from "@/features/accounts/receipt/domain/identity";
import { planDeductions } from "@/features/accounts/receipt/domain/deductions";
import { autoAllocate } from "@/features/accounts/receipt/domain/allocate";
import { setPaymentBillCell, clampHeldApply } from "./bill-cells";
import {
  PAYMENT_SETTLEMENT,
  debitChipFor,
  defaultsForRole,
  paymentLinesThatTravel,
  PICKABLE_PAYMENT_ROLES,
} from "./roles";
import { rebuildPaymentSeededLines, tdsNetPaise, paymentTdsOf } from "./seeded-lines";
import { computePaymentTds, grossUpPaise } from "./tds";
import {
  payableTenders,
  retargetPaymentTender,
  resetToTender,
} from "./tenders";
import {
  BANK,
  CHEQUE,
  aBill,
  aCredit,
  aPayee,
  aPaymentLine,
  aPaymentTender,
  aTdsPayee,
  aTenderMaster,
} from "./fixtures";

describe("payment roles", () => {
  it("puts deductions on CR and money on top on DR, derived from the role", () => {
    expect(defaultsForRole("TDS_PAYABLE")).toEqual({ drCr: "CR", settlesBill: true });
    expect(defaultsForRole("BALANCES_WRITTEN_BACK")).toEqual({ drCr: "CR", settlesBill: true });
    expect(defaultsForRole("BANK_CHARGES")).toEqual({ drCr: "DR", settlesBill: false });
    expect(defaultsForRole("INTEREST_PAID")).toEqual({ drCr: "DR", settlesBill: false });
  });

  it("never offers TDS or a typed bank charge — the server refuses both", () => {
    expect(PICKABLE_PAYMENT_ROLES).not.toContain("TDS_PAYABLE");
    expect(PICKABLE_PAYMENT_ROLES).not.toContain("BANK_CHARGES");
  });

  it("keeps the mirrors home but lets a DR round-up travel", () => {
    const lines = [
      aPaymentLine("TDS_PAYABLE", { amount: 100 }),
      aPaymentLine("DISCOUNT_RECEIVED", { amount: 50 }),
      aPaymentLine("WRITE_OFF", { amount: 20 }),
      aPaymentLine("ROUND_OFF", { amount: 0.4 }),
      aPaymentLine("ROUND_OFF", { amount: 0.6, drCr: "DR", settlesBill: false }),
      aPaymentLine("INTEREST_PAID", { amount: 30 }),
    ];
    expect(paymentLinesThatTravel(lines).map((line) => [line.role, line.drCr])).toEqual([
      ["TDS_PAYABLE", "CR"],
      ["ROUND_OFF", "DR"],
      ["INTEREST_PAID", "DR"],
    ]);
  });

  it("chips a held row by what it is", () => {
    expect(debitChipFor("ADVANCE")).toBe("ADVANCE");
    expect(debitChipFor("PURCHASE_RETURN")).toBe("DR NOTE");
    expect(debitChipFor("OPENING")).toBe("DEBIT");
  });
});

describe("the payment identity", () => {
  it("counts the bank charge as an ADDITION — it is inside the amount paid", () => {
    // NEFT 5,012.50 with a 12.50 charge settles a 5,000 bill exactly.
    const identity = computeIdentity(
      {
        bills: [aBill({ pendingAmount: 5000, receive: 5000 })],
        credits: [],
        tenders: [aPaymentTender({ amount: 5012.5, mdrAmt: 12.5, tenderTypeId: BANK })],
        otherLines: [aPaymentLine("BANK_CHARGES", { amount: 12.5, seeded: true })],
      },
      PAYMENT_SETTLEMENT,
    );
    expect(identity.received).toBe(5012.5);
    expect(identity.additions).toBe(12.5);
    expect(identity.allocated).toBe(5000);
    expect(identity.onAccount).toBe(0);
    expect(identity.balances).toBe(true);
  });

  it("holds TDS on an advance wholly on account (the server's A1 rule)", () => {
    // 49,500 paid ahead with 500 deducted: a 50,000 advance.
    const identity = computeIdentity(
      {
        bills: [],
        credits: [],
        tenders: [aPaymentTender({ amount: 49500 })],
        otherLines: [aPaymentLine("TDS_PAYABLE", { amount: 500, seeded: true })],
      },
      PAYMENT_SETTLEMENT,
    );
    expect(identity.deductions).toBe(500);
    expect(identity.allocated).toBe(0);
    expect(identity.onAccount).toBe(50000);
    expect(identity.balances).toBe(true);
  });

  it("lets the TDS fill a bill's room so a Pay of the money alone closes it", () => {
    const bill = aBill({ pendingAmount: 10000, receive: 9900 });
    const lines = [aPaymentLine("TDS_PAYABLE", { amount: 100, seeded: true })];
    const identity = computeIdentity(
      { bills: [bill], credits: [], tenders: [aPaymentTender({ amount: 9900 })], otherLines: lines },
      PAYMENT_SETTLEMENT,
    );
    expect(identity.allocated).toBe(10000);
    expect(identity.onAccount).toBe(0);
    expect(planDeductions([bill], lines, PAYMENT_SETTLEMENT).shares).toEqual([10000]);
  });
});

describe("TDS, worked out as the server works it out", () => {
  it("grosses up exactly, in paise, rounding half up", () => {
    expect(grossUpPaise(990000, 1)).toBe(1000000);
    // 49,500 / 0.99 = 50,000 exactly.
    expect(grossUpPaise(4950000, 1)).toBe(5000000);
    // 1,000 / 0.98 = 1,020.408… → 1,020.41
    expect(grossUpPaise(100000, 2)).toBe(102041);
  });

  it("deducts when the party has no thresholds", () => {
    const tds = computePaymentTds(aTdsPayee(), 9900);
    expect(tds).toMatchObject({ applies: true, deducted: true, base: 10000, tax: 100 });
  });

  it("does not deduct below the single-payment threshold", () => {
    const tds = computePaymentTds(aTdsPayee({ tdsThresholdSingle: 30000 }), 9900);
    expect(tds).toMatchObject({ applies: true, deducted: false, base: 9900, tax: 0 });
  });

  it("deducts once the year's running base crosses the annual threshold", () => {
    const tds = computePaymentTds(
      aTdsPayee({ tdsThresholdSingle: 30000, tdsThresholdAnnual: 100000, tdsPaidThisYear: 95000 }),
      9900,
    );
    expect(tds).toMatchObject({ deducted: true, base: 10000, tax: 100 });
  });

  it("works nothing out for a party that is not flagged, or has no rate in force", () => {
    expect(computePaymentTds(aPayee(), 9900).applies).toBe(false);
    expect(computePaymentTds(aTdsPayee({ tdsRate: null }), 9900).applies).toBe(false);
  });

  it("takes every DR line off the base — the charge, a round-up, interest", () => {
    const net = tdsNetPaise({
      bills: [aBill({ roundOff: -0.4 })],
      tenders: [aPaymentTender({ amount: 10050, mdrAmt: 10, tenderTypeId: BANK })],
      lines: [aPaymentLine("INTEREST_PAID", { amount: 39.6 })],
    });
    expect(net).toBe(1000000);
  });
});

describe("the seeded lines", () => {
  it("seeds TDS from the instruments and the charge from the Charge column", () => {
    const lines = rebuildPaymentSeededLines({
      bills: [],
      tenders: [aPaymentTender({ amount: 9910, mdrAmt: 10, tenderTypeId: BANK })],
      lines: [],
      party: aTdsPayee(),
    });
    expect(lines.map((line) => [line.role, line.drCr, line.amount, line.settlesBill])).toEqual([
      ["TDS_PAYABLE", "CR", 100, true],
      ["BANK_CHARGES", "DR", 10, false],
    ]);
    expect(lines.every((line) => line.seeded)).toBe(true);
  });

  it("mirrors the bill columns and turns a negative R/off into a DR round-up", () => {
    const lines = rebuildPaymentSeededLines({
      bills: [
        aBill({ discount: 50, writeOff: 20 }),
        aBill({ roundOff: 0.3 }),
        aBill({ roundOff: -0.4 }),
      ],
      tenders: [],
      lines: [],
      party: aPayee(),
    });
    expect(lines.map((line) => [line.role, line.drCr, line.amount])).toEqual([
      ["DISCOUNT_RECEIVED", "CR", 50],
      ["WRITE_OFF", "CR", 20],
      ["ROUND_OFF", "CR", 0.3],
      ["ROUND_OFF", "DR", 0.4],
    ]);
  });

  it("keeps hand-added lines, after the seeded ones, and keeps a TDS pin", () => {
    const interest = aPaymentLine("INTEREST_PAID", { amount: 25 });
    const first = rebuildPaymentSeededLines({
      bills: [],
      tenders: [aPaymentTender({ amount: 9925 })],
      lines: [interest],
      party: aTdsPayee(),
    });
    const tds = first.find((line) => line.role === "TDS_PAYABLE");
    expect(tds?.amount).toBe(100);
    const pinned = first.map((line) =>
      line.role === "TDS_PAYABLE" ? { ...line, againstBillId: "b1", againstBillAccYear: "2026-2027" } : line,
    );
    const again = rebuildPaymentSeededLines({
      bills: [],
      tenders: [aPaymentTender({ amount: 9925 })],
      lines: pinned,
      party: aTdsPayee(),
    });
    expect(again.map((line) => line.role)).toEqual(["TDS_PAYABLE", "INTEREST_PAID"]);
    expect(again[0].againstBillId).toBe("b1");
    expect(again[0].key).toBe(tds?.key);
  });

  it("keeps a posted payment's TDS line when there are no party facts to rework it from", () => {
    const posted = aPaymentLine("TDS_PAYABLE", { amount: 100, seeded: true });
    const lines = rebuildPaymentSeededLines({
      bills: [],
      tenders: [aPaymentTender({ amount: 9900 })],
      lines: [posted],
      party: aPayee({ loaded: false }),
    });
    expect(lines).toEqual([posted]);
  });

  it("lets a fresh round-up replace a remembered one rather than send both", () => {
    const remembered = aPaymentLine("ROUND_OFF", { amount: 0.4, drCr: "DR", settlesBill: false });
    const lines = rebuildPaymentSeededLines({
      bills: [aBill({ roundOff: -0.3 })],
      tenders: [],
      lines: [remembered],
      party: aPayee(),
    });
    expect(lines.map((line) => [line.role, line.amount, line.seeded])).toEqual([
      ["ROUND_OFF", 0.3, true],
    ]);
  });

  it("drops a zero seeded line", () => {
    expect(
      rebuildPaymentSeededLines({
        bills: [aBill()],
        tenders: [aPaymentTender({ amount: 100 })],
        lines: [aPaymentLine("BANK_CHARGES", { amount: 5, seeded: true })],
        party: aPayee(),
      }),
    ).toEqual([]);
  });

  it("allocates around the TDS: money first, the deduction fills the rest", () => {
    const party = aTdsPayee();
    const tenders = [aPaymentTender({ amount: 9900 })];
    const bills = [aBill({ pendingAmount: 10000 }), aBill({ pendingAmount: 5000 })];
    const lines = rebuildPaymentSeededLines({ bills, tenders, lines: [], party });
    expect(paymentTdsOf({ bills, tenders, lines, party }).tax).toBe(100);
    const result = autoAllocate(
      { bills, credits: [], tenders, otherLines: lines },
      PAYMENT_SETTLEMENT,
    );
    expect(result.bills.map((bill) => bill.receive)).toEqual([9900, 0]);
    const identity = computeIdentity(
      { bills: result.bills, credits: [], tenders, otherLines: lines },
      PAYMENT_SETTLEMENT,
    );
    expect(identity.allocated).toBe(10000);
    expect(identity.balances).toBe(true);
  });
});

describe("a bill cell", () => {
  it("rounds a bill UP when Pay is a few paise over", () => {
    const result = setPaymentBillCell(aBill({ pendingAmount: 4999.6 }), "receive", 5000);
    expect(result.bill.receive).toBe(5000);
    expect(result.bill.roundOff).toBe(-0.4);
    expect(result.refused).toBe(false);
    expect(result.message).toContain("rounded up");
  });

  it("refuses a rupee or more over the bill, giving back only that cell", () => {
    const result = setPaymentBillCell(aBill({ pendingAmount: 5000, discount: 100 }), "receive", 5000);
    expect(result.refused).toBe(true);
    expect(result.bill.receive).toBe(4900);
    expect(result.bill.discount).toBe(100);
  });

  it("will not round up a bill that carries a discount", () => {
    const result = setPaymentBillCell(
      aBill({ pendingAmount: 5000, discount: 100 }),
      "receive",
      4900.5,
    );
    expect(result.refused).toBe(true);
    expect(result.bill.receive).toBe(4900);
    expect(result.bill.roundOff).toBe(0);
  });

  it("corrects a typed round-up to exactly the overpayment", () => {
    const result = setPaymentBillCell(
      aBill({ pendingAmount: 1000, receive: 1000.4, roundOff: -0.4 }),
      "roundOff",
      -0.1,
    );
    expect(result.bill.roundOff).toBe(-0.4);
  });

  it("clears a negative R/off on a bill that is not over-paid", () => {
    const result = setPaymentBillCell(aBill({ pendingAmount: 1000, receive: 900 }), "roundOff", -0.5);
    expect(result.bill.roundOff).toBe(0);
    expect(result.message).toContain("raise Pay instead");
  });

  it("re-decides the round-up on a fresh Pay", () => {
    const rounded = aBill({ pendingAmount: 1000, receive: 1000.4, roundOff: -0.4 });
    const result = setPaymentBillCell(rounded, "receive", 900);
    expect(result.bill.roundOff).toBe(0);
    expect(result.bill.receive).toBe(900);
  });

  it("marks a typed Pay as the operator's", () => {
    expect(setPaymentBillCell(aBill(), "receive", 10).bill.receiveTyped).toBe(true);
  });

  it("caps a held item at what it holds", () => {
    const credit = aCredit({ pendingAmount: 4000 });
    expect(clampHeldApply(credit.docRefno, credit.pendingAmount, 5000)).toEqual({
      value: 4000,
      message: `${credit.docRefno} holds 4,000.00. It cannot be spent twice.`,
    });
  });
});

describe("the tenders a payment may go out on", () => {
  it("offers cash, bank, cheque and UPI — nothing that is money coming in", () => {
    const masters = [
      aTenderMaster({ tndTypeId: "1", tndName: "Cash" }),
      aTenderMaster({ tndTypeId: "2", tndName: "Card" }),
      aTenderMaster({ tndTypeId: "3", tndName: "UPI" }),
      aTenderMaster({ tndTypeId: "4", tndName: "Wallet" }),
      aTenderMaster({ tndTypeId: "5", tndName: "Cheque" }),
      aTenderMaster({ tndTypeId: "6", tndName: "NEFT" }),
      aTenderMaster({ tndTypeId: "8", tndName: "Temp credit" }),
    ];
    expect(payableTenders(masters, "2026-10-03").map((master) => master.tndName).sort()).toEqual([
      "Cash",
      "Cheque",
      "NEFT",
      "UPI",
    ]);
  });

  it("drops what the new kind cannot hold when a row changes tender", () => {
    const transfer = aPaymentTender({
      tenderTypeId: BANK,
      mdrAmt: 10,
      refNo: "UTR1",
      beneficiary: { name: "M", accountNo: "123", ifsc: "SBIN0001234" },
    });
    const asCheque = retargetPaymentTender(transfer, aTenderMaster({ tndTypeId: String(CHEQUE) }));
    expect(asCheque.mdrAmt).toBe(0);
    expect(asCheque.refNo).toBe("");
    expect(asCheque.beneficiary.accountNo).toBe("");

    const cheque = aPaymentTender({
      tenderTypeId: CHEQUE,
      instrumentDate: "2026-10-10",
      cheque: { chequeBookId: "book", favouring: "M", acPayee: true },
    });
    const asCash = resetToTender(cheque, aTenderMaster({ tndTypeId: "1" }));
    expect(asCash.instrumentDate).toBe("");
    expect(asCash.cheque.chequeBookId).toBeNull();
  });
});
