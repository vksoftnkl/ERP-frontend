import { describe, expect, it } from "vitest";
import type { TillReason } from "../shared/reasons";
import {
  EMPTY_SAFE_DECIDE,
  gapDifference,
  gapFromText,
  safeDecideBody,
  safeDecideProblem,
  safeDecideReasons,
  safeDecideRefusalTarget,
  type SafeDecideRequest,
} from "./safe-decide";

const reason = (over: Partial<TillReason>): TillReason => ({
  id: "r1",
  category: "VARIANCE",
  code: "SHORT",
  name: "Counting error",
  ledgerId: "",
  ledgerName: "",
  needsNote: false,
  needsRef: false,
  maxAmountPaise: 0,
  active: true,
  overridden: false,
  ...over,
});

// The pending gap of Qt tests/till/snap_safe.cpp, with the safe's name added.
const request: SafeDecideRequest = {
  scope: { companyId: "c", branchId: "b" },
  gap: { tvrId: "g1", tvrAccYear: "2026-2027", stage: "SAFE", variance: -100 },
  safeName: "ZT S1 test safe",
};

describe("safe decide", () => {
  it("offers only the live VARIANCE reasons, a pick first", () => {
    const options = safeDecideReasons([
      reason({ id: "a" }),
      reason({ id: "b", category: "MOVEMENT_VOID" }),
      reason({ id: "c", active: false }),
      reason({ id: "d", overridden: true }),
    ]);
    expect(options).toEqual([
      { value: "", label: "Pick a reason" },
      { value: "a", label: "Counting error" },
    ]);
  });

  it("says where the gap came from and which way it goes", () => {
    expect(gapFromText(request.gap)).toBe("Safe count");
    expect(gapFromText({ ...request.gap, stage: "REMIT" })).toBe("Bank credited less than was sent");
    expect(gapFromText({ ...request.gap, stage: "REMIT", variance: 20 })).toBe("Bank credited more than was sent");
    expect(gapDifference(request.gap)).toEqual({ text: "−100.00  short", short: true });
    expect(gapDifference({ ...request.gap, variance: 1695 })).toEqual({ text: "+1,695.00  extra", short: false });
  });

  it("needs a reason (snap: decide needs a reason), the caller's PIN, then the second person's", () => {
    expect(safeDecideProblem(EMPTY_SAFE_DECIDE)).toBe("Pick the reason.");
    expect(safeDecideProblem({ ...EMPTY_SAFE_DECIDE, reasonId: "a" })).toBe("Type your till PIN.");
    const signed = { ...EMPTY_SAFE_DECIDE, reasonId: "a", pin: "5678" };
    expect(safeDecideProblem(signed)).toBe("");
    expect(safeDecideProblem({ ...signed, second: { id: "u2", text: "Zt-till-ui-80288" } })).toBe(
      "The second person types their till PIN.",
    );
  });

  it("posts the gap's key and EXPENSE by default (snap: decide body)", () => {
    const body = safeDecideBody(request, { ...EMPTY_SAFE_DECIDE, reasonId: "a", pin: "5678" });
    expect(body).toEqual({
      companyId: "c",
      branchId: "b",
      accYear: "2026-2027",
      tvrId: "g1",
      treatment: "EXPENSE",
      reasonId: "a",
      approverPin: "5678",
    });
  });

  it("adds the second signature and the note when given (live_safe_decide: SUSPENSE, two-person)", () => {
    const body = safeDecideBody(request, {
      treatment: "SUSPENSE",
      reasonId: "a",
      note: "  clears the 1,695 suspense ",
      pin: "5678",
      second: { id: "01a11695-f4dd-7c2a-bb76-5f6c76858fd2", text: "Zt-till-ui-80288" },
      secondPin: "5678",
    });
    expect(body).toMatchObject({
      treatment: "SUSPENSE",
      secondId: "01a11695-f4dd-7c2a-bb76-5f6c76858fd2",
      secondPin: "5678",
      notes: "clears the 1,695 suspense",
    });
  });

  it("types again the PIN a refusal names: the second person's first", () => {
    expect(safeDecideRefusalTarget({ code: "TILL_APPROVER_PIN", field: "secondPin" })).toBe("second");
    expect(safeDecideRefusalTarget({ code: "TILL_APPROVER_SECOND", field: "secondId" })).toBe("second");
    expect(safeDecideRefusalTarget({ code: "TILL_APPROVER_PIN", field: "" })).toBe("pin");
    expect(safeDecideRefusalTarget({ code: "TILL_APPROVER_LIMIT", field: "approverPin" })).toBe("pin");
    expect(safeDecideRefusalTarget({ code: "TILL_APPROVER_LIMIT", field: "" })).toBeNull();
  });
});
