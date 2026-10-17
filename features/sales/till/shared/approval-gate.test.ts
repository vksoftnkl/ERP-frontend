import { describe, expect, it } from "vitest";
import {
  approvalAnswerOf,
  approvalAskOf,
  approvalDecideBody,
  approvalDecideProblem,
  approvalNeededOf,
  approvalRequestBody,
  approveHereProblem,
  canCancelOwnRequest,
  decideRefusalTarget,
  EMPTY_APPROVAL_DECIDE,
  EMPTY_APPROVAL_REQUEST,
  inboxButtonText,
  inboxHeadText,
  inboxRowText,
  inboxWhyNot,
  levelForUserRole,
} from "./approval-gate";
import { tillErrorOf } from "./errors";
import type { TillApprovalInboxItem, TillApprovalPayload } from "./wire/types";

const need428 = {
  status: 428,
  data: {
    success: false,
    message: "EXPENSE of 1200.00 needs an approval at SUPERVISOR or above",
    errors: [
      {
        field: "approvalId",
        code: "TILL_APPROVAL_REQUIRED",
        message: "…",
        event: "EXPENSE",
        amount: 1200,
        requiredRole: "SUPERVISOR",
        channel: "EITHER",
        twoPerson: false,
        srcDocType: "EXPENSE",
        srcDocId: "v-1",
      },
    ],
  },
};

const item = (over: Partial<TillApprovalInboxItem> = {}): TillApprovalInboxItem => ({
  kind: "REQUEST",
  action: "approvals/decide",
  event: "EXPENSE",
  accYear: "2026-2027",
  tapId: "tap-1",
  tssId: null,
  tcmId: null,
  tvrId: null,
  safeId: null,
  sessionNo: "S-12",
  counterName: "C1",
  safeName: null,
  amount: 1200,
  requiredRole: "SUPERVISOR",
  channel: "EITHER",
  twoPerson: false,
  requestedBy: "u-1",
  requestedByName: "ANU",
  requestedOn: "2026-10-16T10:00:00.000Z",
  expiresOn: null,
  srcDocType: "EXPENSE",
  srcDocId: "v-1",
  srcRefno: "ExpV/12",
  note: "petrol",
  afterClose: false,
  canDecide: true,
  cannotBecause: null,
  ...over,
});

describe("approvalNeededOf", () => {
  it("reads the flat house body", () => {
    expect(approvalNeededOf(need428)).toMatchObject({
      event: "EXPENSE",
      amount: 1200,
      requiredRole: "SUPERVISOR",
      srcDocType: "EXPENSE",
      srcDocId: "v-1",
    });
  });

  it("reads a body nested by the global filter, and finds the entry past the first", () => {
    const nested = {
      status: 428,
      data: { statusCode: 428, message: { message: "x", errors: [{ code: "OTHER" }, need428.data.errors[0]] } },
    };
    expect(approvalNeededOf(nested)?.event).toBe("EXPENSE");
  });

  it("is null for any other refusal", () => {
    expect(approvalNeededOf({ status: 422, data: { errors: [{ code: "TILL_REASON_INVALID" }] } })).toBeNull();
    expect(approvalNeededOf(new Error("boom"))).toBeNull();
  });

  it("leaves a missing amount null so the screen supplies its own", () => {
    const noAmount = { status: 428, data: { errors: [{ code: "TILL_APPROVAL_REQUIRED", event: "" }] } };
    const need = approvalNeededOf(noAmount)!;
    const state = approvalAskOf(need, { companyId: "c", branchId: "b", event: "CASH_PAYMENT", amount: 500 });
    expect(state.ask).toMatchObject({ event: "CASH_PAYMENT", amount: 500 });
  });
});

describe("request", () => {
  const state = approvalAskOf(approvalNeededOf(need428)!, {
    companyId: "c",
    branchId: "b",
    accYear: "2026-2027",
    event: "EXPENSE",
    amount: 0,
    srcDocType: "EXPENSE",
    srcDocId: "v-1",
  });

  it("Approve now needs the approver and their PIN", () => {
    expect(approveHereProblem(EMPTY_APPROVAL_REQUEST)).not.toBe("");
    expect(approveHereProblem({ note: "", approver: { id: "a", text: "A" }, pin: "1234" })).toBe("");
  });

  it("sends the approver only when deciding here", () => {
    const form = { note: " fuel ", approver: { id: "a", text: "A" }, pin: "1234" };
    expect(approvalRequestBody(state, form, true)).toMatchObject({ note: "fuel", approverId: "a", approverPin: "1234", amount: 1200 });
    const inbox = approvalRequestBody(state, form, false);
    expect(inbox).not.toHaveProperty("approverId");
    expect(inbox).not.toHaveProperty("approverPin");
  });

  it("reads the answer", () => {
    const base = { tapId: "t", status: "APPROVED" } as TillApprovalPayload;
    expect(approvalAnswerOf(base)).toEqual({ kind: "approved", tapId: "t" });
    expect(approvalAnswerOf({ ...base, status: "PENDING" }).kind).toBe("pending");
    expect(approvalAnswerOf({ ...base, status: "REJECTED", decidedByName: "RAJ", decisionNote: "no" })).toEqual({
      kind: "rejected",
      text: "Rejected by RAJ: no",
    });
  });
});

describe("inbox", () => {
  it("words the head and the button", () => {
    expect(inboxHeadText({ items: [], expired: 0 })).toBe("Nothing is waiting at this branch.");
    expect(inboxHeadText({ items: [item(), item({ canDecide: false })], expired: 1 })).toBe(
      "2 waiting at this branch · 1 you can decide · 1 expired just now (asked too long ago)",
    );
    expect(inboxButtonText(0)).toBe("Waiting for approval");
    expect(inboxButtonText(3)).toBe("Waiting for approval (3)");
  });

  it("words a row", () => {
    const row = inboxRowText(item({ twoPerson: true }));
    expect(row.what).toBe("Request — an expense paid from the drawer (ExpV)");
    expect(row.till).toBe("S-12 · C1");
    expect(row.needs).toBe("SUPERVISOR · two people");
    expect(row.you).toBe("You can decide");
    const gap = inboxRowText(item({ kind: "SESSION_VARIANCE", afterClose: true, amount: null, event: "CASH_VARIANCE" }));
    expect(gap.what.startsWith("Cash gap (closed till)")).toBe(true);
    expect(gap.amountHidden).toBe(true);
    expect(inboxWhyNot("TILL_APPROVER_LIMIT")).toBe("Not you: above your limit");
    expect(inboxWhyNot("X")).toBe("Not you (X)");
  });

  it("offers Cancel only on the caller's own request", () => {
    expect(canCancelOwnRequest(item(), "u-1")).toBe(true);
    expect(canCancelOwnRequest(item(), "u-2")).toBe(false);
    expect(canCancelOwnRequest(item({ kind: "SAFE_VARIANCE" }), "u-1")).toBe(false);
  });
});

describe("decide", () => {
  it("needs a note, and two people on a two-person APPROVE", () => {
    expect(approvalDecideProblem(item(), EMPTY_APPROVAL_DECIDE)).toMatch(/note/);
    const noted = { ...EMPTY_APPROVAL_DECIDE, note: "ok" };
    expect(approvalDecideProblem(item(), noted)).toBe("");
    expect(approvalDecideProblem(item({ twoPerson: true }), noted)).toMatch(/two people/);
    expect(approvalDecideProblem(item({ twoPerson: true }), { ...noted, decision: "REJECT" })).toBe("");
  });

  it("builds the body", () => {
    const form = { ...EMPTY_APPROVAL_DECIDE, note: " ok ", pin: "1111", second: { id: "s", text: "S" }, secondPin: "2222" };
    expect(approvalDecideBody(item(), { companyId: "c", branchId: "b" }, form)).toEqual({
      companyId: "c",
      branchId: "b",
      accYear: "2026-2027",
      tapId: "tap-1",
      decision: "APPROVE",
      note: "ok",
      approverPin: "1111",
      secondId: "s",
      secondPin: "2222",
    });
    const reject = approvalDecideBody(item(), { companyId: "c", branchId: "b" }, { ...form, decision: "REJECT" });
    expect(reject).not.toHaveProperty("secondId");
  });

  it("names the PIN a refusal is about", () => {
    const pin = tillErrorOf({ status: 403, data: { errors: [{ code: "TILL_APPROVER_PIN", field: "approverPin" }] } });
    expect(decideRefusalTarget(pin)).toBe("pin");
    const second = tillErrorOf({ status: 403, data: { errors: [{ code: "TILL_APPROVER_SECOND", field: "secondPin" }] } });
    expect(decideRefusalTarget(second)).toBe("second");
  });
});

describe("levelForUserRole", () => {
  it("maps User Role names onto approval levels", () => {
    expect(levelForUserRole("STORE MANAGER")).toBe("STORE_MANAGER");
    expect(levelForUserRole("manager")).toBe("STORE_MANAGER");
    expect(levelForUserRole("HO FINANCE")).toBe("HO_FINANCE");
    expect(levelForUserRole("CASHIER")).toBe("");
    expect(levelForUserRole("ADMIN")).toBe("");
    expect(levelForUserRole(null)).toBe("");
  });
});
