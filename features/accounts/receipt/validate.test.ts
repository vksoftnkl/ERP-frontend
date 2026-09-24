import { describe, expect, it } from "vitest";
import type { ReceiptSettings } from "./receipt.types";
import {
  aBill,
  aCredit,
  aHeader,
  aLine,
  aParty,
  aTender,
  aTenderMaster,
} from "./domain/fixtures";
import { computeIdentity } from "./domain/identity";
import {
  identityHint,
  validateBeforePost,
  validateBeforeSave,
  type ValidationInput,
} from "./validate";

const SETTINGS: ReceiptSettings = {
  writeoffApprovalAbove: 0,
  salesmanMandatory: false,
  allowPostedAmend: false,
  tcsBasis: "SALES",
};

const cashMaster = aTenderMaster({ tndId: "tnd-cash", tndTypeId: "1", tndName: "Cash" });
const upiMaster = aTenderMaster({ tndId: "tnd-upi", tndTypeId: "3", tndName: "UPI" });

/** A receipt that balances: one 10,000 bill paid in full in cash. */
function input(partial: Partial<ValidationInput> = {}): ValidationInput {
  return {
    header: aHeader(),
    bills: [aBill({ pendingAmount: 10000, receive: 10000 })],
    credits: [],
    tenders: [aTender({ amount: 10000 })],
    otherLines: [],
    party: aParty(),
    settings: SETTINGS,
    masters: [cashMaster, upiMaster],
    ...partial,
  };
}

describe("validateBeforeSave — header", () => {
  it("passes a complete receipt", () => {
    expect(validateBeforeSave(input())).toEqual([]);
  });

  it("asks for the party and the date, targeting each field", () => {
    const problems = validateBeforeSave(input({ header: aHeader({ partyId: "", voucherDate: "" }) }));
    expect(problems.map((p) => p.target)).toEqual([
      { kind: "header", field: "partyId" },
      { kind: "header", field: "voucherDate" },
    ]);
  });

  it("asks for the salesman only when the company says it is mandatory", () => {
    const noSalesman = aHeader({ employeeId: "" });
    expect(validateBeforeSave(input({ header: noSalesman }))).toEqual([]);
    const problems = validateBeforeSave(
      input({ header: noSalesman, settings: { ...SETTINGS, salesmanMandatory: true } }),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0].target).toEqual({ kind: "header", field: "employeeId" });
  });
});

describe("validateBeforeSave — instruments", () => {
  it("a row with no tender reports only that, by row number", () => {
    const row = aTender({ tenderId: "", amount: 0 });
    const problems = validateBeforeSave(input({ tenders: [aTender({ amount: 10000 }), row] }));
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toMatch(/^Instrument 2 /);
    expect(problems[0].target).toEqual({ kind: "tender", rowKey: row.key, column: "type" });
  });

  it("a row with no amount is refused", () => {
    const row = aTender({ amount: 0 });
    const problems = validateBeforeSave(input({ tenders: [row] }));
    expect(problems[0].target).toEqual({ kind: "tender", rowKey: row.key, column: "amount" });
  });

  it("a cheque needs its number and its date", () => {
    const cheque = aTender({ tenderId: "tnd-chq", tenderTypeId: 5, amount: 10000 });
    const problems = validateBeforeSave(input({ tenders: [cheque] }));
    expect(problems.map((p) => p.target)).toEqual([
      { kind: "tender", rowKey: cheque.key, column: "refNote" },
      { kind: "tender", rowKey: cheque.key, column: "instrDate" },
    ]);
  });

  it("a complete cheque passes, even with no master on hand", () => {
    const cheque = aTender({
      tenderId: "tnd-chq",
      tenderTypeId: 5,
      amount: 10000,
      refNo: "55491",
      instrumentDate: "2026-09-18",
    });
    expect(validateBeforeSave(input({ tenders: [cheque] }))).toEqual([]);
  });

  it("a non-cheque asks for the reference its master needs, by name", () => {
    const upi = aTender({ tenderId: "tnd-upi", tenderTypeId: 3, amount: 10000, refNo: "  " });
    const problems = validateBeforeSave(input({ tenders: [upi] }));
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toBe("Instrument 1 (UPI) needs its UTR No.");
    expect(problems[0].target.kind).toBe("tender");
  });
});

describe("validateBeforeSave — other lines", () => {
  it("a line naming neither role nor ledger is refused", () => {
    const line = aLine("TDS_RECEIVABLE", { role: null, ledgerId: null, amount: 100 });
    const problems = validateBeforeSave(input({ otherLines: [line] }));
    expect(problems).toEqual([
      expect.objectContaining({ target: { kind: "line", rowKey: line.key, column: "type" } }),
    ]);
  });

  it("a hand-made line needs an amount; a seeded one may sit at zero", () => {
    const hand = aLine("CLAIMS_ALLOWED", { amount: 0 });
    const seeded = aLine("TDS_RECEIVABLE", { amount: 0, seeded: true });
    const problems = validateBeforeSave(input({ otherLines: [hand, seeded] }));
    expect(problems.map((p) => p.target)).toEqual([
      { kind: "line", rowKey: hand.key, column: "amount" },
    ]);
  });
});

describe("validateBeforeSave — write-off approval", () => {
  it("with the default threshold of 0, every write-off needs an approver", () => {
    const bill = aBill({ docRefno: "INV/9", writeOff: 1 });
    const problems = validateBeforeSave(input({ bills: [bill] }));
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toContain("INV/9");
    expect(problems[0].target).toEqual({ kind: "bill", rowKey: bill.billId, column: "writeOff" });
  });

  it("a named approver clears it", () => {
    const bill = aBill({ writeOff: 50, writeoffApprovedBy: "user-uuid" });
    expect(validateBeforeSave(input({ bills: [bill] }))).toEqual([]);
  });

  it("a write-off at or below the threshold needs no approver", () => {
    const settings = { ...SETTINGS, writeoffApprovalAbove: 100 };
    expect(validateBeforeSave(input({ bills: [aBill({ writeOff: 100 })], settings }))).toEqual([]);
    expect(validateBeforeSave(input({ bills: [aBill({ writeOff: 100.01 })], settings }))).toHaveLength(1);
  });
});

describe("validateBeforePost", () => {
  it("passes a balanced receipt", () => {
    expect(validateBeforePost(input())).toEqual([]);
  });

  it("includes every save problem", () => {
    const problems = validateBeforePost(input({ header: aHeader({ partyId: "" }) }));
    expect(problems[0].target).toEqual({ kind: "header", field: "partyId" });
  });

  it("refuses a receipt with neither an instrument nor a credit", () => {
    const problems = validateBeforePost(input({ bills: [], tenders: [] }));
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toMatch(/neither an instrument nor a credit/);
    expect(problems[0].target).toEqual({ kind: "header", field: "partyId" });
  });

  it("refuses a credit moved with no money received — that is a journal", () => {
    const credit = aCredit({ pendingAmount: 4000, apply: 4000 });
    const bill = aBill({ pendingAmount: 4000, receive: 4000 });
    const problems = validateBeforePost(input({ bills: [bill], credits: [credit], tenders: [] }));
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toMatch(/journal, not a receipt/);
  });

  it("points an unbalanced receipt at the first bill still owing", () => {
    const paid = aBill({ pendingAmount: 0 });
    const owing = aBill({ pendingAmount: 10000, receive: 12000 });
    const problems = validateBeforePost(input({ bills: [paid, owing] }));
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toMatch(/placed but not received/);
    expect(problems[0].target).toEqual({ kind: "bill", rowKey: owing.billId, column: "receive" });
  });

  it("falls back to the first tender when no bill is owing", () => {
    const tender = aTender({ amount: 10000 });
    const bill = aBill({ pendingAmount: 0, receive: 12000 });
    const problems = validateBeforePost(input({ bills: [bill], tenders: [tender] }));
    expect(problems[0].target).toEqual({ kind: "tender", rowKey: tender.key, column: "amount" });
  });

  it("a surplus is not a problem — it goes on account", () => {
    const problems = validateBeforePost(
      input({ bills: [aBill({ pendingAmount: 10000, receive: 6000 })] }),
    );
    expect(problems).toEqual([]);
  });
});

describe("identityHint", () => {
  function hintFor(partial: Partial<ValidationInput>): string {
    return identityHint(computeIdentity(input(partial)));
  }

  it("names a shortfall as placed but not received", () => {
    expect(hintFor({ tenders: [aTender({ amount: 7000 })] })).toBe(
      "3000.00 placed but not received — reduce an allocation or add an instrument.",
    );
  });

  it("names money left over as an advance on account", () => {
    expect(hintFor({ tenders: [aTender({ amount: 12500 })] })).toMatch(
      /^2500\.00 is not against any bill/,
    );
  });

  it("says so when the two sides agree", () => {
    expect(hintFor({})).toBe("Received and allocated agree.");
  });

  it("phrases a positive difference as unplaced money", () => {
    const hint = identityHint({
      received: 0,
      deductions: 0,
      creditsApplied: 0,
      allocated: 0,
      onAccount: 0,
      additions: 0,
      difference: 12.5,
      balances: false,
    });
    expect(hint).toBe("12.50 received but not placed — allocate it to a bill or leave it on account.");
  });
});
