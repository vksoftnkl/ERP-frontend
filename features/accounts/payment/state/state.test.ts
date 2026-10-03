import { describe, expect, it } from "vitest";
import {
  aBill,
  aHeader,
  aPayee,
  aPaymentLine,
  aPaymentTender,
  aTdsPayee,
  aTenderMaster,
  CHEQUE,
} from "../domain/fixtures";
import type { PaymentOpenItemsPayload, PaymentSettings } from "../payment.types";
import { validatePaymentBeforePost, validatePaymentBeforeSave } from "../validate";
import { initialPaymentDraft, paymentDraftReducer, type PaymentDraft } from "./draft";

const SCOPE = { companyId: "co", branchId: "br", accYear: "2026-2027" };

function openItems(partial: Partial<PaymentOpenItemsPayload> = {}): PaymentOpenItemsPayload {
  return {
    bills: [],
    credits: [],
    summary: { totalPending: 0, billCount: 0, overdueCount: 0, creditsHeld: 0, pdcHeld: 0 },
    party: {
      ledId: "p1",
      ledName: "Murugan Traders",
      groupName: "Sundry Creditors",
      isBillByBill: true,
      isMoneyLedger: false,
      isTdsApplicable: false,
      tdsSection: null,
      tdsDeducteeType: null,
      tdsRate: null,
      tdsRateSource: null,
      tdsThresholdSingle: null,
      tdsThresholdAnnual: null,
      tdsPaidThisYear: 0,
      panPresent: true,
      bank: null,
      favouringName: null,
    },
    ...partial,
  };
}

function picked(): PaymentDraft {
  return paymentDraftReducer(initialPaymentDraft(SCOPE, "2026-10-03"), {
    type: "PARTY_PICKED",
    partyId: "p1",
    partyName: "Murugan Traders",
  }).draft;
}

describe("the payment reducer", () => {
  it("refuses a cash or bank ledger as the payee — that is a Contra", () => {
    const payload = openItems();
    payload.party.isMoneyLedger = true;
    payload.party.ledName = "Cash in hand";
    const result = paymentDraftReducer(picked(), { type: "OPEN_ITEMS_LOADED", partyId: "p1", payload });
    expect(result.refusal?.message).toContain("Contra (menu 104)");
    expect(result.draft.header.partyId).toBe("");
    expect(result.draft.party.loaded).toBe(false);
  });

  it("ignores a late answer for a payee the operator has left", () => {
    const state = picked();
    const result = paymentDraftReducer(state, {
      type: "OPEN_ITEMS_LOADED",
      partyId: "someone-else",
      payload: openItems(),
    });
    expect(result.draft).toBe(state);
  });

  it("says so when every row listed is a debit held, not a bill owed", () => {
    const result = paymentDraftReducer(picked(), {
      type: "OPEN_ITEMS_LOADED",
      partyId: "p1",
      payload: openItems({
        credits: [
          {
            billId: "c1",
            billAccYear: "2026-2027",
            billType: "OPENING",
            docRefno: "OB/1",
            docDate: "2026-04-01",
            billAmount: 500,
            pendingAmount: 500,
            srcModule: null,
            srcDocType: null,
            srcDocId: null,
            srcAccYear: null,
            narration: null,
            status: "OPEN",
            drCr: "DR",
            adjType: "ADVANCE_ADJUST",
            settlementMode: "ADVANCE",
          },
        ],
      }),
    });
    expect(result.draft.notice).toContain("are DEBITS it holds of ours");
  });

  it("seeds the TDS as soon as the payee's facts and an amount are in", () => {
    let state = picked();
    const payload = openItems();
    Object.assign(payload.party, { isTdsApplicable: true, tdsSection: "194C", tdsRate: 1 });
    state = paymentDraftReducer(state, { type: "OPEN_ITEMS_LOADED", partyId: "p1", payload }).draft;
    state = paymentDraftReducer(state, {
      type: "ADD_TENDER",
      master: aTenderMaster({ tndTypeId: "1" }),
      amount: 9900,
    }).draft;
    expect(state.lines.map((line) => [line.role, line.amount])).toEqual([["TDS_PAYABLE", 100]]);
  });

  it("drops the last payee's TDS line when the payee changes", () => {
    const state: PaymentDraft = {
      ...picked(),
      party: aTdsPayee(),
      lines: [aPaymentLine("TDS_PAYABLE", { amount: 100, seeded: true })],
    };
    const next = paymentDraftReducer(state, {
      type: "PARTY_PICKED",
      partyId: "p2",
      partyName: "Other",
    }).draft;
    expect(next.lines).toEqual([]);
  });

  it("refuses to remove a seeded line, and says what to change instead", () => {
    const line = aPaymentLine("BANK_CHARGES", { amount: 10, seeded: true });
    const state: PaymentDraft = { ...picked(), lines: [line] };
    const result = paymentDraftReducer(state, { type: "REMOVE_ROW", rowKey: line.key });
    expect(result.refusal?.message).toContain("Charge column");
    expect(result.draft).toBe(state);
  });

  it("will not let a seeded line's amount or narration be typed over — only its pin", () => {
    const tds = aPaymentLine("TDS_PAYABLE", { amount: 100, seeded: true });
    const state: PaymentDraft = {
      ...picked(),
      party: aTdsPayee(),
      tenders: [aPaymentTender({ amount: 9900 })],
      lines: [tds],
    };
    const next = paymentDraftReducer(state, {
      type: "SET_LINE",
      rowKey: tds.key,
      patch: { amount: 5, narration: "per certificate" },
    }).draft;
    expect(next.lines[0]).toMatchObject({ amount: 100, narration: "TDS 194C @ 1% on 10000.00" });
    const pinned = paymentDraftReducer(next, {
      type: "SET_LINE",
      rowKey: next.lines[0].key,
      patch: { againstBillId: "b1", againstBillAccYear: "2026-2027" },
    }).draft;
    expect(pinned.lines[0].againstBillId).toBe("b1");
  });

  it("rounds a bill up through the reducer and seeds the DR line, with a note", () => {
    const bill = aBill({ billId: "b1", pendingAmount: 4999.6 });
    const state: PaymentDraft = { ...picked(), party: aPayee(), bills: [bill], itemsLoaded: true };
    const result = paymentDraftReducer(state, {
      type: "SET_BILL_CELL",
      billId: "b1",
      column: "receive",
      value: 5000,
    });
    expect(result.note).toContain("rounded up");
    expect(result.draft.lines.map((line) => [line.role, line.drCr, line.amount])).toEqual([
      ["ROUND_OFF", "DR", 0.4],
    ]);
  });

  it("refuses to auto-allocate for a party we owe no bill", () => {
    const state: PaymentDraft = { ...picked(), party: aPayee(), itemsLoaded: true, bills: [] };
    expect(paymentDraftReducer(state, { type: "AUTO_ALLOCATE" }).refusal?.message).toContain(
      "no open bill",
    );
  });
});

const SETTINGS: PaymentSettings = {
  writeoffApprovalAbove: 0,
  salesmanMandatory: false,
  allowPostedAmend: false,
};

describe("payment validation", () => {
  const base = {
    header: aHeader(),
    bills: [],
    credits: [],
    tenders: [aPaymentTender({ amount: 1000 })],
    lines: [],
    party: aPayee(),
    settings: SETTINGS,
    masters: [],
  };

  it("asks a cheque for its book and its date, never its number", () => {
    const cheque = aPaymentTender({ tenderTypeId: CHEQUE, amount: 1000 });
    const messages = validatePaymentBeforeSave({ ...base, tenders: [cheque] }).map(
      (problem) => problem.message,
    );
    expect(messages).toEqual([
      "The cheque on row 1 needs its book. Press F4 and pick the book it is written from.",
      "The cheque on row 1 needs the date written on it — a date after the payment makes it post-dated.",
    ]);
  });

  it("refuses a back-dated cheque and a charge that eats the whole transfer", () => {
    const problems = validatePaymentBeforeSave({
      ...base,
      tenders: [
        aPaymentTender({
          tenderTypeId: CHEQUE,
          amount: 1000,
          instrumentDate: "2026-09-01",
          cheque: { chequeBookId: "b", favouring: "M", acPayee: true },
        }),
        aPaymentTender({ tenderTypeId: 6, amount: 10, mdrAmt: 10 }),
      ],
    }).map((problem) => problem.message);
    expect(problems.some((message) => message.includes("dated before the payment"))).toBe(true);
    expect(problems.some((message) => message.includes("party would receive nothing"))).toBe(true);
  });

  it("says before Save what the server would refuse: a TDS party with no rate in force", () => {
    const problems = validatePaymentBeforeSave({ ...base, party: aTdsPayee({ tdsRate: null }) });
    expect(problems[0].message).toContain("no rate is in force");
  });

  it("names who paid when the company asks", () => {
    const problems = validatePaymentBeforeSave({
      ...base,
      settings: { ...SETTINGS, salesmanMandatory: true },
    });
    expect(problems[0].target).toEqual({ kind: "header", field: "employeeId" });
  });

  it("will not post a payment that pays nothing", () => {
    const problems = validatePaymentBeforePost({ ...base, tenders: [aPaymentTender({ amount: 0 })] });
    expect(problems.some((problem) => problem.message.includes("is a journal"))).toBe(true);
  });

  it("posts a payment held wholly on account", () => {
    expect(validatePaymentBeforePost(base)).toEqual([]);
  });
});
