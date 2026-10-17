import { describe, expect, it } from "vitest";
import type { ApprovalNeed } from "@/features/sales/till/shared/approval-gate";
import type { ExpenseKeys } from "../expense.types";
import { expenseApprovalAsk, expensePostBody, isApprovalRefusal, refusalsThatShutPost } from "./approval";
import { OTHER, SCOPE } from "./fixtures";

const SAVED: ExpenseKeys = { companyId: OTHER, branchId: OTHER, accYear: "2025-2026", voucherId: "v-9" };

function need(overrides: Partial<ApprovalNeed> = {}): ApprovalNeed {
  return {
    event: "EXPENSE",
    amount: 1200,
    requiredRole: "SUPERVISOR",
    channel: "EITHER",
    twoPerson: false,
    srcDocType: "EXPENSE",
    srcDocId: "v-9",
    ...overrides,
  };
}

describe("expenseApprovalAsk — the dialog for a 428 on the saved draft", () => {
  it("asks for the saved voucher, by its own keys, at the 428's figure", () => {
    expect(expenseApprovalAsk(need(), SAVED, 99_900)).toEqual({
      ask: {
        companyId: OTHER,
        branchId: OTHER,
        accYear: "2025-2026",
        event: "EXPENSE",
        amount: 1200,
        srcDocType: "EXPENSE",
        srcDocId: "v-9",
      },
      requiredRole: "SUPERVISOR",
    });
  });

  it("falls back on EXPENSE and the tenders as typed when the 428 names neither", () => {
    const state = expenseApprovalAsk(need({ event: "", amount: null }), SAVED, 118_050);
    expect(state.ask).toMatchObject({ event: "EXPENSE", amount: 1180.5 });
  });

  it("names the voucher EXPENSE whatever the 428 says the document is", () => {
    // Qt sends srcDocType EXPENSE and its own voucher id, never the 428's.
    const state = expenseApprovalAsk(need({ srcDocType: "OTHER", srcDocId: "x" }), SAVED, 0);
    expect(state.ask).toMatchObject({ srcDocType: "EXPENSE", srcDocId: "v-9" });
  });
});

describe("expensePostBody", () => {
  it("is the bare key until there is an approval", () => {
    expect(expensePostBody({ ...SCOPE, voucherId: "v-1" }, null)).toEqual({ ...SCOPE, voucherId: "v-1" });
  });

  it("carries the approved request's id", () => {
    expect(expensePostBody({ ...SCOPE, voucherId: "v-1" }, "tap-1")).toEqual({
      ...SCOPE,
      voucherId: "v-1",
      approvalId: "tap-1",
    });
  });
});

describe("refusalsThatShutPost", () => {
  const approval = { code: "TILL_APPROVAL_REQUIRED", field: "approvalId", message: "needs an approval" };
  const mismatch = { code: "EXPENSE_TOTAL_MISMATCH", message: "they must be equal" };

  it("does not count the approval need: Post asks for it", () => {
    expect(isApprovalRefusal(approval)).toBe(true);
    expect(refusalsThatShutPost([approval])).toEqual([]);
  });

  it("keeps every other refusal", () => {
    expect(isApprovalRefusal(mismatch)).toBe(false);
    expect(refusalsThatShutPost([approval, mismatch])).toEqual([mismatch]);
  });
});
