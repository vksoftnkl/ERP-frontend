import { describe, expect, it } from "vitest";
import { buildDraftPayload } from "./build-draft";
import { buildAllocations, buildOtherLinePins, buildPostPayload, spreadPaise } from "./build-post";
import { buildAmendPayload } from "./build-amend";
import { aBill, aHeader, aLine, aTender } from "../domain/fixtures";
import { rebuildSeededLines } from "../domain/seeded-lines";
import { aParty } from "../domain/fixtures";

describe("the draft body", () => {
  it("sends the RAW receive in the memo, never the post-shaped amount", () => {
    // Otherwise reopening the draft inflates Receive by a TDS line the
    // operator never typed.
    const body = buildDraftPayload({
      header: aHeader(),
      tenders: [aTender({ amount: 8600 })],
      otherLines: [aLine("TDS_RECEIVABLE", { amount: 1400 })],
      bills: [aBill({ billId: "b1", pendingAmount: 10000, receive: 8600 })],
      credits: [],
      userId: "user",
    });
    expect(body.allocations?.[0]).toMatchObject({ billId: "b1", amount: 8600 });
  });

  it("never sends the beat, and never sends tdIsPdc", () => {
    // `forbidNonWhitelisted: true` — one unknown key fails the whole request,
    // and the PDC flag is the server's to derive from the dates.
    const body = buildDraftPayload({
      header: aHeader({ areaId: "beat-1" }),
      tenders: [aTender({ amount: 100, instrumentDate: "2026-10-01" })],
      otherLines: [],
      bills: [],
      credits: [],
      userId: "user",
    });
    expect(body).not.toHaveProperty("areaId");
    expect(body.tenders[0]).not.toHaveProperty("tdIsPdc");
    expect(body.tenders[0].tdInstrumentDate).toBe("2026-10-01");
  });

  it("numbers the instruments 1-based and contiguously", () => {
    const body = buildDraftPayload({
      header: aHeader(),
      tenders: [aTender({ amount: 100 }), aTender({ amount: 200 })],
      otherLines: [],
      bills: [],
      credits: [],
      userId: "user",
    });
    expect(body.tenders.map((tender) => tender.tdRowNo)).toEqual([1, 2]);
  });

  it("leaves the mirrored roles off the wire", () => {
    // The bills grid's own columns already carry them; sending both asks for
    // the same money twice and the post is refused.
    const body = buildDraftPayload({
      header: aHeader(),
      tenders: [aTender({ amount: 950 })],
      otherLines: [
        aLine("DISCOUNT_ALLOWED", { amount: 50, seeded: true }),
        aLine("TDS_RECEIVABLE", { amount: 100 }),
      ],
      bills: [aBill({ pendingAmount: 1100, receive: 950, discount: 50 })],
      credits: [],
      userId: "user",
    });
    expect(body.otherLines?.map((line) => line.role)).toEqual(["TDS_RECEIVABLE"]);
  });

  it("sends a role OR a ledger, never both", () => {
    const body = buildDraftPayload({
      header: aHeader(),
      tenders: [],
      otherLines: [aLine("TDS_RECEIVABLE", { amount: 100, ledgerId: "led-x" })],
      bills: [],
      credits: [],
      userId: "user",
    });
    expect(body.otherLines?.[0]).toEqual({
      role: "TDS_RECEIVABLE",
      drCr: "DR",
      amount: 100,
      settlesBill: true,
    });
  });

  it("carries ONE salesman, because a receipt is collected by one person", () => {
    const body = buildDraftPayload({
      header: aHeader({ employeeId: "emp-1" }),
      tenders: [],
      otherLines: [],
      bills: [],
      credits: [],
      userId: "user",
    });
    expect(body.avhEmployeeId).toEqual(["emp-1"]);
  });
});

describe("the post body", () => {
  it("keeps the round-off OUT of amount and beside it", () => {
    // Folded in, the server reads it as cash and refuses the receipt by
    // exactly that amount (notes 34).
    const rows = buildAllocations({
      bills: [aBill({ billId: "b1", pendingAmount: 5000, receive: 4999.6, roundOff: 0.4 })],
      otherLines: [],
    });
    expect(rows[0]).toMatchObject({ amount: 4999.6, roundoff: 0.4 });
  });

  it("puts a settling deduction INSIDE amount", () => {
    const rows = buildAllocations({
      bills: [aBill({ billId: "b1", pendingAmount: 10000, receive: 8600 })],
      otherLines: [aLine("TDS_RECEIVABLE", { amount: 1400 })],
    });
    expect(rows[0].amount).toBe(10000);
  });

  it("lands a PINNED deduction on its own bill only", () => {
    const first = aBill({ billId: "b1", pendingAmount: 5000, receive: 4000 });
    const second = aBill({ billId: "b2", pendingAmount: 5000, receive: 5000 });
    const rows = buildAllocations({
      bills: [first, second],
      otherLines: [
        aLine("TDS_RECEIVABLE", {
          amount: 1000,
          againstBillId: "b1",
          againstBillAccYear: "2026-2027",
        }),
      ],
    });
    expect(rows[0].amount).toBe(5000);
    expect(rows[1].amount).toBe(5000);
  });

  it("spreads an unpinned deduction by the money placed, exactly", () => {
    const rows = buildAllocations({
      bills: [
        aBill({ billId: "b1", pendingAmount: 4000, receive: 1000 }),
        aBill({ billId: "b2", pendingAmount: 4000, receive: 3000 }),
      ],
      otherLines: [aLine("CLAIMS_ALLOWED", { amount: 101 })],
    });
    expect(rows[0].amount + rows[1].amount).toBe(4101);
  });

  it("numbers a pin against the FILTERED list, not the full one", () => {
    // With a discount line first, numbering against the full array points the
    // pin at the wrong line.
    const pins = buildOtherLinePins([
      aLine("DISCOUNT_ALLOWED", { amount: 50, seeded: true }),
      aLine("TDS_RECEIVABLE", {
        amount: 1400,
        againstBillId: "b1",
        againstBillAccYear: "2026-2027",
      }),
    ]);
    expect(pins).toEqual([
      { lineNo: 1, billId: "b1", billAccYear: "2026-2027", amount: 1400 },
    ]);
  });

  it("reports the on-account figure the identity computed", () => {
    const body = buildPostPayload({
      header: aHeader({ voucherId: "vch" }),
      bills: [aBill({ pendingAmount: 1000, receive: 1000 })],
      credits: [],
      tenders: [aTender({ amount: 2500 })],
      otherLines: [],
    });
    expect(body.onAccount).toBe(1500);
  });

  it("leaves out a bill this receipt does not touch", () => {
    const rows = buildAllocations({
      bills: [aBill({ billId: "b1", receive: 100 }), aBill({ billId: "b2" })],
      otherLines: [],
    });
    expect(rows.map((row) => row.billId)).toEqual(["b1"]);
  });
});

describe("spreadPaise", () => {
  it("always adds up to the total, whatever the remainder", () => {
    expect(spreadPaise(100, [1, 1, 1]).reduce((sum, value) => sum + value, 0)).toBe(100);
    expect(spreadPaise(7, [3, 3, 3, 3])).toEqual([2, 2, 2, 1]);
  });

  it("is zero when there is nothing to weigh it against", () => {
    expect(spreadPaise(500, [0, 0])).toEqual([0, 0]);
  });
});

describe("the amend body", () => {
  it("carries the loaded revision and the remark, and keeps the id", () => {
    const body = buildAmendPayload({
      header: aHeader({ voucherId: "vch", status: "POSTED" }),
      tenders: [aTender({ amount: 1000 })],
      otherLines: [],
      bills: [aBill({ pendingAmount: 1000, receive: 1000 })],
      credits: [],
      userId: "user",
      baseRevision: 2,
      editRemark: "  cheque no keyed 55491, actual 55419 ",
    });
    expect(body.avhVoucherId).toBe("vch");
    expect(body.baseRevision).toBe(2);
    expect(body.editRemark).toBe("cheque no keyed 55491, actual 55419");
    expect(body.allocations).toHaveLength(1);
    expect(body.replace).toBe(true);
  });
});

describe("the seeded lines", () => {
  it("derives the three mirrored roles from the bill columns", () => {
    const lines = rebuildSeededLines({
      bills: [aBill({ discount: 50, writeOff: 20, roundOff: 0.4 })],
      tenders: [aTender({ mdrAmt: 10 })],
      lines: [],
      party: aParty(),
    });
    expect(lines.map((line) => [line.role, line.amount])).toEqual([
      ["DISCOUNT_ALLOWED", 50],
      ["WRITE_OFF", 20],
      ["ROUND_OFF", 0.4],
      ["BANK_CHARGES", 10],
    ]);
  });

  it("drops a derived line whose total has gone to zero", () => {
    const seeded = rebuildSeededLines({
      bills: [aBill({ discount: 50 })],
      tenders: [],
      lines: [],
      party: aParty(),
    });
    const cleared = rebuildSeededLines({
      bills: [aBill({ discount: 0 })],
      tenders: [],
      lines: seeded,
      party: aParty(),
    });
    expect(cleared).toHaveLength(0);
  });

  it("offers TDS when the party is TDS-applicable, with no amount of its own", () => {
    // There is no rate anywhere in this schema; the certificate is the fact.
    const lines = rebuildSeededLines({
      bills: [],
      tenders: [],
      lines: [],
      party: aParty({ isTdsApplicable: true }),
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ role: "TDS_RECEIVABLE", amount: 0, settlesBill: true });
  });

  it("offers TCS only on the RECEIPT basis — on SALES it is inside the bill", () => {
    const onSales = rebuildSeededLines({
      bills: [],
      tenders: [],
      lines: [],
      party: aParty({ isTcsApplicable: true, tcsBasis: "SALES" }),
    });
    expect(onSales).toHaveLength(0);

    const onReceipt = rebuildSeededLines({
      bills: [],
      tenders: [],
      lines: [],
      party: aParty({ isTcsApplicable: true, tcsBasis: "RECEIPT" }),
    });
    expect(onReceipt[0]).toMatchObject({ role: "TCS_PAYABLE", drCr: "CR", settlesBill: false });
  });

  it("offers nothing at all until the party's flags have loaded", () => {
    // Every flag defaults to false, and false is a claim, not an absence.
    expect(
      rebuildSeededLines({
        bills: [],
        tenders: [],
        lines: [],
        party: aParty({ loaded: false, isTdsApplicable: true }),
      }),
    ).toHaveLength(0);
  });

  it("keeps the amount the operator typed on an offered line", () => {
    const first = rebuildSeededLines({
      bills: [],
      tenders: [],
      lines: [],
      party: aParty({ isTdsApplicable: true }),
    });
    const typed = [{ ...first[0], amount: 1400, againstBillId: "b1" }];
    const again = rebuildSeededLines({
      bills: [aBill({ discount: 10 })],
      tenders: [],
      lines: typed,
      party: aParty({ isTdsApplicable: true }),
    });
    expect(again.find((line) => line.role === "TDS_RECEIVABLE")).toMatchObject({
      amount: 1400,
      againstBillId: "b1",
    });
  });

  it("leaves a hand-added line alone", () => {
    const hand = aLine("CLAIMS_ALLOWED", { amount: 300 });
    const lines = rebuildSeededLines({
      bills: [],
      tenders: [],
      lines: [hand],
      party: aParty(),
    });
    expect(lines).toEqual([hand]);
  });
});
