import { describe, expect, it } from "vitest";
import type {
  OpenBillWire,
  OpenCreditWire,
  ReceiptAllocationWire,
  ReceiptHeaderWire,
  ReceiptOtherLineWire,
  ReceiptTenderWire,
} from "../receipt.types";
import { aTender } from "../domain/fixtures";
import {
  applyCheques,
  emptyPartyFacts,
  nextRowKey,
  parseDraftCreditMemo,
  parseDraftMemo,
  parseHeader,
  parseOpenBills,
  parseOpenCredits,
  parseOtherLines,
  parseParty,
  parseTenders,
  toDateInput,
} from "./parse";

function billWire(partial: Partial<OpenBillWire> = {}): OpenBillWire {
  return {
    billId: "bill-1",
    billAccYear: "2026-2027",
    billType: "SALES",
    docRefno: "INV/1",
    usrRefno: null,
    docDate: "2026-09-01T00:00:00.000Z",
    dueDate: null,
    billAmount: 10000,
    pendingAmount: 8000,
    status: "OPEN",
    daysOverdue: 3,
    billProfit: null,
    billProfitPreTax: null,
    pdcHeld: 0,
    ppdSuggested: 0,
    tcsAmount: 0,
    tcsPending: 0,
    ...partial,
  };
}

function creditWire(partial: Partial<OpenCreditWire> = {}): OpenCreditWire {
  return {
    billId: "credit-1",
    billAccYear: "2026-2027",
    billType: "ADVANCE",
    docRefno: "ADV/1",
    docDate: "2026-08-01",
    billAmount: 4000,
    pendingAmount: 2500,
    srcModule: null,
    srcDocType: "RECEIPT",
    srcDocId: "vch-1",
    srcAccYear: null,
    narration: null,
    status: "OPEN",
    drCr: "CR",
    adjType: "ALLOCATION",
    settlementMode: null,
    ...partial,
  } as OpenCreditWire;
}

function tenderWire(partial: Partial<ReceiptTenderWire> = {}): ReceiptTenderWire {
  return {
    tdId: "td-1",
    tdRowNo: 1,
    tdTenderId: "tnd-cash",
    tdTenderName: "Cash",
    tdTenderTypeId: 1,
    tdTenderLedgerId: "led-cash",
    tdAmount: 1000,
    tdSurchargePerc: 0,
    tdSurchargeAmt: 0,
    tdMdrAmt: 0,
    tdReceivedAmt: 0,
    tdChangeAmt: 0,
    tdRefNo: null,
    tdBankName: null,
    tdPayerVpa: null,
    tdInstrumentDate: null,
    tdIsPdc: false,
    tdVoucherId: null,
    ...partial,
  };
}

function lineWire(partial: Partial<ReceiptOtherLineWire> = {}): ReceiptOtherLineWire {
  return {
    lineNo: 1,
    role: null,
    ledgerId: "led-x",
    ledgerName: "Claims",
    drCr: "DR",
    amount: 100,
    settlesBill: true,
    narration: null,
    ...partial,
  };
}

function allocation(partial: Partial<ReceiptAllocationWire> = {}): ReceiptAllocationWire {
  return {
    abjId: null,
    billId: "bill-1",
    billAccYear: "2026-2027",
    docRefno: "INV/1",
    docDate: null,
    billType: null,
    billAmount: null,
    pendingAmount: null,
    dueDate: null,
    status: null,
    adjType: "ALLOCATION",
    settlementMode: null,
    drCr: "CR",
    amount: 0,
    adjDate: "2026-09-18",
    isPostDated: false,
    voucherId: null,
    chequeId: null,
    againstBillId: null,
    againstBillRefno: null,
    reversalOfId: null,
    isReversed: false,
    approvedBy: null,
    remarks: null,
    ...partial,
  };
}

describe("toDateInput", () => {
  it("narrows a timestamp to its date", () => {
    expect(toDateInput("2026-09-18T10:22:00.000Z")).toBe("2026-09-18");
  });

  it("empties anything that is not an ISO date", () => {
    expect(toDateInput(null)).toBe("");
    expect(toDateInput("  ")).toBe("");
    expect(toDateInput("18-09-2026")).toBe("");
  });
});

describe("nextRowKey", () => {
  it("never repeats", () => {
    expect(nextRowKey("x")).not.toBe(nextRowKey("x"));
  });
});

describe("parseOpenBills", () => {
  it("maps the wire and starts every settlement cell empty", () => {
    const [bill] = parseOpenBills([billWire()]);
    expect(bill).toMatchObject({
      billId: "bill-1",
      usrRefno: "",
      docDate: "2026-09-01",
      dueDate: null,
      pendingAmount: 8000,
      daysOverdue: 3,
      receive: 0,
      writeOff: 0,
      roundOff: 0,
      receiveTyped: false,
      writeoffApprovedBy: null,
    });
  });

  it("keeps a null profit null — an opening bill was typed, not sold", () => {
    expect(parseOpenBills([billWire({ billProfit: null })])[0].billProfit).toBeNull();
    expect(parseOpenBills([billWire({ billProfit: 0 })])[0].billProfit).toBe(0);
  });

  it("pre-fills the discount with the prompt-payment suggestion", () => {
    const [bill] = parseOpenBills([billWire({ ppdSuggested: 150 })]);
    expect(bill.discount).toBe(150);
    expect(bill.ppdSuggested).toBe(150);
  });

  it("narrows a due timestamp", () => {
    expect(parseOpenBills([billWire({ dueDate: "2026-09-30T00:00:00Z" })])[0].dueDate).toBe(
      "2026-09-30",
    );
  });

  it("answers an empty list for a missing body", () => {
    expect(parseOpenBills(undefined)).toEqual([]);
  });
});

describe("parseOpenCredits", () => {
  it("maps the wire with nothing applied", () => {
    expect(parseOpenCredits([creditWire()])).toEqual([
      {
        billId: "credit-1",
        billAccYear: "2026-2027",
        billType: "ADVANCE",
        docRefno: "ADV/1",
        docDate: "2026-08-01",
        billAmount: 4000,
        pendingAmount: 2500,
        srcDocType: "RECEIPT",
        srcDocId: "vch-1",
        apply: 0,
        applyTyped: false,
      },
    ]);
    expect(parseOpenCredits(undefined)).toEqual([]);
  });
});

describe("parseParty", () => {
  it("marks the facts as loaded and reads only a strict true as true", () => {
    const facts = parseParty({
      ledId: "led",
      ledName: "Deepan",
      groupName: null,
      isBillByBill: true,
      isTdsApplicable: false,
      tdsDeducteeType: null,
      isTcsApplicable: true,
      tcsBasis: "RECEIPT",
      tanNo: "TAN1",
    });
    expect(facts).toEqual({
      loaded: true,
      ledName: "Deepan",
      groupName: "",
      isBillByBill: true,
      isTdsApplicable: false,
      tdsDeducteeType: null,
      isTcsApplicable: true,
      tcsBasis: "RECEIPT",
      tanNo: "TAN1",
    });
  });

  it("defaults an unknown TCS basis to SALES", () => {
    const facts = parseParty({
      ledId: "led",
      ledName: "X",
      groupName: "G",
      isBillByBill: false,
      isTdsApplicable: false,
      tdsDeducteeType: null,
      isTcsApplicable: false,
      tcsBasis: "WHATEVER" as "SALES",
      tanNo: null,
    });
    expect(facts.tcsBasis).toBe("SALES");
  });

  it("with no party, answers facts that are NOT loaded", () => {
    expect(parseParty(undefined)).toEqual(emptyPartyFacts());
    expect(emptyPartyFacts().loaded).toBe(false);
  });
});

describe("parseTenders", () => {
  it("orders by row number and maps nulls to blanks", () => {
    const rows = parseTenders([
      tenderWire({ tdId: "b", tdRowNo: 2 }),
      tenderWire({ tdId: "a", tdRowNo: 1, tdTenderLedgerId: "", tdInstrumentDate: "2026-09-20T00:00:00Z" }),
    ]);
    expect(rows.map((row) => row.tdId)).toEqual(["a", "b"]);
    expect(rows[0]).toMatchObject({
      tenderLedgerId: null,
      refNo: "",
      bankName: "",
      payerVpa: "",
      instrumentDate: "2026-09-20",
      cheque: { bankBranch: "", ifsc: "", drawerName: "", bankLedgerId: null },
      pdcVoucherRefno: null,
    });
  });

  it("does not reorder the caller's array", () => {
    const wire = [tenderWire({ tdRowNo: 2 }), tenderWire({ tdRowNo: 1 })];
    parseTenders(wire);
    expect(wire.map((row) => row.tdRowNo)).toEqual([2, 1]);
  });
});

describe("applyCheques", () => {
  const cheque = {
    tenderRowNo: 2,
    bankBranch: "Main",
    ifsc: null,
    drawerName: "Deepan",
    bankLedgerId: "led-sbi",
  };

  it("joins the extras onto their row by 1-based row number", () => {
    const tenders = [aTender(), aTender()];
    const joined = applyCheques(tenders, [cheque]);
    expect(joined[0]).toBe(tenders[0]);
    expect(joined[1].cheque).toEqual({
      bankBranch: "Main",
      ifsc: "",
      drawerName: "Deepan",
      bankLedgerId: "led-sbi",
    });
  });

  it("returns the same array when there are no cheques", () => {
    const tenders = [aTender()];
    expect(applyCheques(tenders, [])).toBe(tenders);
  });
});

describe("parseOtherLines", () => {
  it("orders by line number", () => {
    const lines = parseOtherLines([lineWire({ lineNo: 2, amount: 2 }), lineWire({ lineNo: 1, amount: 1 })]);
    expect(lines.map((line) => line.amount)).toEqual([1, 2]);
  });

  it("drops the resolved ledger from a role line — role and ledger are exclusive", () => {
    const [line] = parseOtherLines([lineWire({ role: "CLAIMS_ALLOWED", ledgerId: "led-claims" })]);
    expect(line.role).toBe("CLAIMS_ALLOWED");
    expect(line.ledgerId).toBeNull();
  });

  it("keeps the ledger on a line with no role", () => {
    const [line] = parseOtherLines([lineWire({ role: null, ledgerId: "led-x" })]);
    expect(line.ledgerId).toBe("led-x");
  });

  it("flags the seeded roles", () => {
    const lines = parseOtherLines([
      lineWire({ lineNo: 1, role: "TDS_RECEIVABLE" }),
      lineWire({ lineNo: 2, role: "CLAIMS_ALLOWED" }),
      lineWire({ lineNo: 3, role: "BANK_CHARGES" }),
    ]);
    expect(lines.map((line) => line.seeded)).toEqual([true, false, true]);
  });

  it("reads settlesBill strictly", () => {
    const [line] = parseOtherLines([lineWire({ settlesBill: undefined as unknown as boolean })]);
    expect(line.settlesBill).toBe(false);
  });
});

describe("parseHeader", () => {
  const fallback = { companyId: "co-session", branchId: "br-session", accYear: "2025-2026" };

  function header(partial: Partial<ReceiptHeaderWire> = {}): ReceiptHeaderWire {
    return {
      avhVoucherId: "vch-1",
      avhCompanyId: "co-doc",
      avhBranchId: "br-doc",
      avhAccYear: "2026-2027",
      avhVoucherDate: "2026-09-18T00:00:00Z",
      avhPartyId: "party",
      avhPartyName: null,
      avhEmployeeId: [],
      avhUsrRefno: null,
      avhDocRefno: null,
      avhDocDate: null,
      avhRemarks: null,
      avhVoucherStatus: "POSTED",
      avhVoucherRefno: "RCT/1",
      avhRevisionNo: 3,
      avhAgainstVoucherId: null,
      avhCancelReason: null,
      ...partial,
    } as ReceiptHeaderWire;
  }

  it("takes the scope from the document, not the session", () => {
    expect(parseHeader(header(), fallback).scope).toEqual({
      companyId: "co-doc",
      branchId: "br-doc",
      accYear: "2026-2027",
    });
  });

  it("falls back to the session scope for a blank key", () => {
    const scope = parseHeader(header({ avhBranchId: "", avhAccYear: "" }), fallback).scope;
    expect(scope).toEqual({ companyId: "co-doc", branchId: "br-session", accYear: "2025-2026" });
  });

  it("maps the header fields", () => {
    const draft = parseHeader(header({ avhEmployeeId: ["emp-1", "emp-2"] }), fallback);
    expect(draft).toMatchObject({
      voucherId: "vch-1",
      voucherDate: "2026-09-18",
      partyName: "",
      employeeId: "emp-1",
      areaId: "",
      docDate: "",
      status: "POSTED",
      voucherRefno: "RCT/1",
      revisionNo: 3,
    });
  });

  it("answers an empty salesman when none was recorded", () => {
    expect(parseHeader(header({ avhEmployeeId: [] }), fallback).employeeId).toBe("");
  });
});

describe("parseDraftMemo", () => {
  it("folds a bill's expanded rows back into one memo", () => {
    const memo = parseDraftMemo([
      allocation({ adjType: "ALLOCATION", amount: 9000 }),
      allocation({ adjType: "DISCOUNT", amount: 500 }),
      allocation({ adjType: "WRITEOFF", amount: 0.3 }),
      allocation({ adjType: "ROUND_OFF", amount: 0.2 }),
      allocation({ adjType: "ADVANCE_ADJUST", amount: 499.5 }),
    ]);
    expect(memo).toEqual([
      {
        billId: "bill-1",
        billAccYear: "2026-2027",
        amount: 9499.5,
        discount: 500,
        writeoff: 0.3,
        roundoff: 0.2,
      },
    ]);
  });

  it("keeps one memo per bill, in first-seen order", () => {
    const memo = parseDraftMemo([
      allocation({ billId: "b2", amount: 1 }),
      allocation({ billId: "b1", amount: 2 }),
      allocation({ billId: "b2", amount: 3 }),
    ]);
    expect(memo.map((entry) => [entry.billId, entry.amount])).toEqual([
      ["b2", 4],
      ["b1", 2],
    ]);
  });

  it("skips an adjustment type it cannot place", () => {
    expect(parseDraftMemo([allocation({ adjType: "MYSTERY" as "ALLOCATION", amount: 5 })])).toEqual(
      [],
    );
  });

  it("sums in paise, not doubles", () => {
    const memo = parseDraftMemo([
      allocation({ amount: 0.1 }),
      allocation({ amount: 0.2 }),
    ]);
    expect(memo[0].amount).toBe(0.3);
  });
});

describe("parseDraftCreditMemo", () => {
  it("sums the applications of each credit", () => {
    expect(
      parseDraftCreditMemo([
        allocation({ billId: "c1", amount: 0.1 }),
        allocation({ billId: "c2", amount: 50 }),
        allocation({ billId: "c1", amount: 0.2 }),
      ]),
    ).toEqual([
      { billId: "c1", amount: 0.3 },
      { billId: "c2", amount: 50 },
    ]);
  });
});
