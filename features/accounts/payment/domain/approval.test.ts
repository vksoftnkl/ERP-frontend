import { describe, expect, it } from "vitest";
import { aHeader } from "@/features/accounts/receipt/domain/fixtures";
import { approvalNeededOf, type ApprovalNeed } from "@/features/sales/till/shared/approval-gate";
import { buildPaymentSaveAndPostPayload } from "../payload/build";
import { KEPT_AS_DRAFT_TEXT, keptDraftHeader, paymentApprovalAsk } from "./approval";

/** What `/payments/create` with `post: true` answers under REFUSE (notes 131). */
const kept428 = {
  status: 428,
  data: {
    success: false,
    message: "CASH_PAYMENT of 25000.00 needs an approval at SUPERVISOR or above",
    errors: [
      {
        field: "approvalId",
        code: "TILL_APPROVAL_REQUIRED",
        message: "…",
        event: "CASH_PAYMENT",
        amount: 25000,
        requiredRole: "SUPERVISOR",
        channel: "EITHER",
        twoPerson: false,
        srcDocType: "PAYMENT",
        srcDocId: "kept-1",
      },
    ],
  },
};

function need(overrides: Partial<ApprovalNeed> = {}): ApprovalNeed {
  return { ...approvalNeededOf(kept428)!, ...overrides };
}

describe("keptDraftHeader — the draft the 428 kept", () => {
  it("adopts its id as a DRAFT: a NEW payment is now that draft", () => {
    const header = keptDraftHeader(aHeader(), need());
    expect(header).toMatchObject({ voucherId: "kept-1", status: "DRAFT" });
  });

  it("replaces a reopened draft's id with the one the server names", () => {
    expect(keptDraftHeader(aHeader({ voucherId: "kept-1" }), need()).voucherId).toBe("kept-1");
  });

  it("leaves the header alone when the 428 names no document", () => {
    const header = aHeader({ voucherId: null });
    expect(keptDraftHeader(header, need({ srcDocId: "" }))).toBe(header);
  });

  it("makes the retry post THAT draft, never a second copy", () => {
    // The body a second Post sends — now, or later from the list.
    const header = keptDraftHeader(aHeader(), need());
    const body = buildPaymentSaveAndPostPayload({
      header,
      tenders: [],
      lines: [],
      bills: [],
      credits: [],
      userId: "u",
      approvalId: "tap-1",
    });
    expect(body).toMatchObject({ avhVoucherId: "kept-1", approvalId: "tap-1", post: true });
  });
});

describe("paymentApprovalAsk — the dialog for the kept draft", () => {
  it("asks for the kept draft at the 428's figure, in the screen's tenant", () => {
    const header = keptDraftHeader(aHeader(), need());
    expect(paymentApprovalAsk(need(), header, 30000)).toEqual({
      ask: {
        companyId: "co",
        branchId: "br",
        accYear: "2026-2027",
        event: "CASH_PAYMENT",
        amount: 25000,
        srcDocType: "PAYMENT",
        srcDocId: "kept-1",
      },
      requiredRole: "SUPERVISOR",
    });
  });

  it("falls back on CASH_PAYMENT, the amount paid and PAYMENT when the 428 names none", () => {
    const header = aHeader({ voucherId: "v-7" });
    const state = paymentApprovalAsk(need({ event: "", amount: null, srcDocType: "", srcDocId: "" }), header, 1234.5);
    expect(state.ask).toMatchObject({
      event: "CASH_PAYMENT",
      amount: 1234.5,
      srcDocType: "PAYMENT",
      srcDocId: "v-7",
    });
  });
});

describe("the kept-as-draft message", () => {
  it("tells the operator how to post it once approved (Qt's words)", () => {
    expect(KEPT_AS_DRAFT_TEXT).toBe(
      "The payment is saved as a draft and waits for the approval. Once it is approved, press Post again " +
        "(the same payment, or open it from the list with F8).",
    );
  });
});
