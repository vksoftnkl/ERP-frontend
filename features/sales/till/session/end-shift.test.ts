import { describe, expect, it } from "vitest";
import type { TillSessionPayload, TillSessionTender } from "../shared/wire/types";
import {
  closeBody,
  closeConfirmText,
  countBody,
  countingOpen,
  endShiftProblem,
  endShiftView,
  floatLeftOf,
  floatLeftProblem,
  recountText,
  slipLineNote,
  slipLinesOf,
  slipsTotalPaise,
  stepStates,
} from "./end-shift";

const KEY = { companyId: "co", branchId: "br", accYear: "2026-2027", tssId: "tss" };

function tender(over: Partial<TillSessionTender>): TillSessionTender {
  return {
    tenderTypeId: 1,
    tenderTypeName: "CASH",
    tenderId: null,
    tenderName: null,
    closeMode: "DENOM",
    openAmount: null,
    salesAmount: null,
    refundAmount: null,
    receiptAmount: null,
    paymentAmount: null,
    expenseAmount: null,
    movedIn: null,
    movedOut: null,
    paidFromBank: null,
    txnCount: null,
    noRefCount: 0,
    expected: null,
    counted: null,
    variance: null,
    ...over,
  };
}

const TENDERS = [
  tender({}),
  tender({ tenderTypeId: 2, tenderTypeName: "CARD", tenderId: "hdfc", tenderName: "HDFC EDC", closeMode: "SLIPS" }),
  tender({ tenderTypeId: 3, tenderTypeName: "UPI", closeMode: "STATEMENT" }),
  tender({ tenderTypeId: 7, tenderTypeName: "CREDIT", closeMode: "NONE" }),
];

function session(over: Partial<TillSessionPayload>): TillSessionPayload {
  return {
    tssSessionNo: "C01-261009-01",
    operatorName: "RAVI K",
    counterName: "Counter 1",
    tssOpenedOn: "2026-10-09T03:32:00.000Z",
    tssStatus: "OPEN",
    tssCountMode: "BLIND",
    tssCountPlace: "COUNTER",
    tssCountAttempts: 0,
    tssCountedOn: null,
    tssBillingEndedOn: null,
    tssVarianceStatus: "NONE",
    tssZNo: null,
    tenders: TENDERS,
    ...over,
  } as TillSessionPayload;
}

describe("reading the session", () => {
  it("starts a live session at step 1, blind", () => {
    const view = endShiftView(session({}), "");
    expect(view).toMatchObject({ billing: true, blind: true, answer: "", cashOffice: false, expectedText: "" });
    expect(view.attemptText).toBe("blind count · attempt 1");
  });

  it("re-opens an accepted count on its close", () => {
    const view = endShiftView(
      session({ tssStatus: "COUNTING", tssCountAttempts: 2, tssCountedOn: "2026-10-09T12:00:00Z", tssVarianceStatus: "PENDING" }),
      "",
    );
    expect(view).toMatchObject({ answer: "ACCEPTED", slipCheck: true });
    expect(view.closeText).toBe("The count (attempt 2) was accepted — close the session.");
    expect(view.attemptText).toBe("blind count · attempt 2 accepted");
  });

  it("re-opens an unaccepted count as a recount, and a pending one as sent", () => {
    expect(endShiftView(session({ tssStatus: "COUNTING", tssCountAttempts: 1 }), "").answer).toBe("RECOUNT_REQUIRED");
    expect(endShiftView(session({ tssStatus: "PENDING_APPROVAL" }), "").answer).toBe("SENT_FOR_APPROVAL");
  });

  it("knows a cash-office count", () => {
    const view = endShiftView(session({ tssStatus: "COUNTING", tssCountPlace: "CASH_OFFICE" }), "");
    expect(view.cashOffice).toBe(true);
    expect(view.footNote).toBe("Drawer sealed — awaiting count in the cash office.");
  });

  it("lists every tender that is not cash, and says why the rest take no count", () => {
    const lines = slipLinesOf(TENDERS);
    expect(lines.map((l) => [l.name, l.countable])).toEqual([
      ["HDFC EDC", true],
      ["UPI", false],
      ["CREDIT", false],
    ]);
    expect(slipLineNote(lines[1])).toBe("verified later");
    expect(slipLineNote(lines[2])).toBe("not in the drawer");
  });
});

describe("the count", () => {
  it("waits for each step in turn", () => {
    const base = { outcome: "" as const, cashOffice: false, cashPaise: 0, slipsPaise: 0 };
    expect(endShiftProblem({ ...base, status: "" })).toBe("Reading the session…");
    expect(endShiftProblem({ ...base, status: "OPEN" })).toBe("End billing first (step 1).");
    expect(endShiftProblem({ ...base, status: "COUNTING" })).toBe("Count the drawer: every note and coin in it.");
    expect(endShiftProblem({ ...base, status: "COUNTING", slipsPaise: 100 })).toBe("");
    expect(endShiftProblem({ ...base, status: "COUNTING", outcome: "ACCEPTED", cashPaise: 1 })).toBe(
      "The count is accepted — close the session.",
    );
    expect(endShiftProblem({ ...base, status: "COUNTING", cashOffice: true })).toBe("This drawer is counted in the cash office.");
    expect(countingOpen({ ...base, status: "COUNTING" })).toBe(true);
    expect(countingOpen({ ...base, status: "COUNTING", outcome: "ACCEPTED" })).toBe(false);
  });

  it("posts the cash lines and every slip line that holds something", () => {
    const lines = slipLinesOf(TENDERS).map((l) => (l.countable ? { ...l, slips: "13", amount: "12340.5", batch: " B-77 " } : l));
    expect(slipsTotalPaise(lines)).toBe(1234050);
    const body = countBody(KEY, [{ tenderTypeId: 1, denominationId: "d500", qty: 4 }], lines);
    expect(body).toEqual({
      ...KEY,
      lines: [
        { tenderTypeId: 1, denominationId: "d500", qty: 4 },
        { tenderTypeId: 2, qty: 13, enteredAmount: 12340.5, tenderId: "hdfc", batchRef: "B-77" },
      ],
    });
    expect(countBody(KEY, [], slipLinesOf(TENDERS)).lines).toEqual([]);
  });

  it("marks the steps done, current and to come", () => {
    expect(stepStates("OPEN", "").tones).toEqual(["current", "todo", "todo", "todo"]);
    expect(stepStates("COUNTING", "").tones).toEqual(["done", "current", "current", "todo"]);
    expect(stepStates("COUNTING", "RECOUNT_REQUIRED").tones).toEqual(["done", "current", "current", "todo"]);
    expect(stepStates("COUNTING", "ACCEPTED").labels[3]).toBe("✓  Submit");
  });

  it("words a recount", () => {
    expect(recountText(-1)).toBe("A recount is due. Count the cash again.");
    expect(recountText(1)).toBe("1 recount left. Count the cash again.");
    expect(recountText(2)).toBe("2 recounts left. Count the cash again.");
  });
});

describe("the close", () => {
  it("sends null for the counter's default and paise as a number", () => {
    expect(floatLeftOf("")).toBeNull();
    expect(floatLeftOf("2000")).toBe(200000);
    expect(closeBody(KEY, null)).toEqual({ ...KEY, floatLeft: null });
    expect(closeBody(KEY, 200050)).toEqual({ ...KEY, floatLeft: 2000.5 });
  });

  it("asks the question Qt asks, and never leaves more than was counted", () => {
    expect(closeConfirmText(200000)).toBe("Close the session, leaving 2,000.00 in the drawer for the next shift?");
    expect(closeConfirmText(0)).toBe("Close the session? All the counted cash goes to the safe.");
    expect(closeConfirmText(null)).toMatch(/default float/);
    expect(floatLeftProblem(300000, 200000)).toMatch(/cannot be more/);
    expect(floatLeftProblem(null, 200000)).toBe("");
  });
});
