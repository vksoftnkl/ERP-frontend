import { describe, expect, it } from "vitest";
import { tillErrorOf } from "../shared/errors";
import { toReasons } from "../shared/reasons";
import type { TillSessionKey, TillSessionPayload, TillVariance } from "../shared/wire/types";
import {
  DECIDE_HINT,
  decideAmount,
  decideBody,
  decideButtonLabel,
  decideProblem,
  decideRefusal,
  decideRequestOf,
  decidedMessage,
  initialDecideForm,
  reasonOptions,
  treatmentOptions,
} from "./variance-decide";

const KEY: TillSessionKey = { companyId: "co", branchId: "br", accYear: "2026-2027", tssId: "tss" };

function variance(over: Partial<TillVariance>): TillVariance {
  return {
    tvrId: "v",
    tvrAccYear: "2026-2027",
    tvrStage: "CLOSE",
    tvrTenderTypeId: 1,
    tvrTenderId: null,
    tvrExpected: 0,
    tvrCounted: 0,
    tvrVariance: -177,
    tvrTolerance: 5,
    tvrTreatment: "PENDING",
    tvrReasonId: null,
    tvrStatus: "OPEN",
    tvrVoucherId: null,
    ...over,
  };
}

function session(variances: TillVariance[]): TillSessionPayload {
  return {
    tssId: "tss",
    tssSessionNo: "ZT1-261012-01",
    operatorName: "RAVI K",
    tssStatus: "PENDING_APPROVAL",
    variances,
  } as TillSessionPayload;
}

const REASONS = toReasons([
  { trs_id: "v1", trs_category: "VARIANCE", trs_name: "Miscount", trs_is_active: "t", overridden: "f" },
  { trs_id: "v2", trs_category: "VARIANCE", trs_name: "Old", trs_is_active: "f", overridden: "f" },
  { trs_id: "v3", trs_category: "VARIANCE", trs_name: "Shipped copy", trs_is_active: "t", overridden: "t" },
  { trs_id: "n1", trs_category: "NONCASH", trs_name: "Slip lost", trs_is_active: true, overridden: false },
  { trs_id: "p1", trs_category: "PAID_IN", trs_name: "Scrap sale", trs_is_active: "t", overridden: "f" },
]);

describe("decide variance — what the cockpit opens it on", () => {
  it("decides the cash gap when there is one, else the slip gap", () => {
    const card = variance({ tvrTenderTypeId: 2, tvrTenderId: "hdfc", tvrVariance: -50 });
    expect(decideRequestOf(session([card, variance({})]), KEY)).toEqual({
      key: KEY,
      event: "CASH_VARIANCE",
      variancePaise: -17700,
      sessionNo: "ZT1-261012-01",
      cashier: "RAVI K",
    });
    expect(decideRequestOf(session([card]), KEY)).toMatchObject({ event: "NONCASH_VARIANCE", variancePaise: -5000 });
    // Nothing pending: a cash gap of nothing, as Qt reads it.
    expect(decideRequestOf(session([]), KEY)).toMatchObject({ event: "CASH_VARIANCE", variancePaise: 0 });
  });

  it("says what happens next", () => {
    expect(decidedMessage("APPROVE")).toBe(
      "Approved. The session is ready to close: Count / close (End Shift) closes it and posts the variance.",
    );
    expect(decidedMessage("RECOUNT")).toBe("Sent back to recount: the cashier counts the drawer once more.");
  });
});

describe("decide variance — the dialog", () => {
  it("offers Expense only for a cash gap", () => {
    expect(treatmentOptions("CASH_VARIANCE").map((o) => o.value)).toEqual(["EXPENSE", "RECOVER", "SUSPENSE"]);
    expect(treatmentOptions("NONCASH_VARIANCE")).toEqual([
      { value: "RECOVER", label: "Recover from the cashier (staff ledger)" },
      { value: "SUSPENSE", label: "Suspense — clear it later by a journal" },
    ]);
    expect(initialDecideForm("CASH_VARIANCE").treatment).toBe("EXPENSE");
    expect(initialDecideForm("NONCASH_VARIANCE").treatment).toBe("RECOVER");
  });

  it("offers the live reasons of the gap's category", () => {
    expect(reasonOptions(REASONS, "CASH_VARIANCE")).toEqual([
      { value: "", label: "Pick a reason" },
      { value: "v1", label: "Miscount" },
    ]);
    expect(reasonOptions(REASONS, "NONCASH_VARIANCE").map((o) => o.value)).toEqual(["", "n1"]);
  });

  it("waits for a reason to approve, and for a note either way", () => {
    const form = initialDecideForm("CASH_VARIANCE");
    expect(form.decision).toBe("APPROVE");
    expect(decideProblem(form)).toBe("Pick the reason.");
    expect(decideProblem({ ...form, reasonId: "v1" })).toBe("Write a note: what you found.");
    expect(decideProblem({ ...form, reasonId: "v1", note: "   " })).toBe("Write a note: what you found.");
    expect(decideProblem({ ...form, reasonId: "v1", note: "drawer short" })).toBe("");
    // A recount names no reason.
    expect(decideProblem({ ...form, decision: "RECOUNT", note: "count again" })).toBe("");
    expect(decideButtonLabel("APPROVE")).toBe("Approve - Ctrl+Enter");
    expect(decideButtonLabel("RECOUNT")).toBe("Send to recount - Ctrl+Enter");
    expect(DECIDE_HINT).toMatch(/^Approve: the session is ready to close again/);
  });

  it("sends the treatment and reason only to approve, the PIN only when typed", () => {
    const form = { ...initialDecideForm("CASH_VARIANCE"), reasonId: "v1", note: "  drawer short  " };
    expect(decideBody(KEY, form)).toEqual({
      ...KEY,
      decision: "APPROVE",
      treatment: "EXPENSE",
      reasonId: "v1",
      note: "drawer short",
    });
    expect(decideBody(KEY, { ...form, decision: "RECOUNT", pin: "5678" })).toEqual({
      ...KEY,
      decision: "RECOUNT",
      note: "drawer short",
      approverPin: "5678",
    });
  });

  it("signs the variance and tones it by its side", () => {
    expect(decideAmount(-17700)).toEqual({ text: "−177.00", tone: "danger" });
    expect(decideAmount(12345650)).toEqual({ text: "+1,23,456.50", tone: "warning" });
    expect(decideAmount(0)).toEqual({ text: "0.00", tone: "warning" });
  });

  it("puts a refusal beside the field it is about", () => {
    const refusal = (field: string, code: string, message: string) =>
      decideRefusal(
        tillErrorOf({ status: 403, data: { success: false, message, errors: [{ field, code, message }] } }),
      );
    expect(refusal("approverPin", "TILL_APPROVER_PIN", "The till PIN is wrong")).toEqual({
      line: "TILL_APPROVER_PIN — The till PIN is wrong",
      focus: "pin",
      clearPin: true,
    });
    expect(refusal("treatment", "TILL_LEDGER_UNMAPPED", "No staff ledger").focus).toBe("treatment");
    expect(refusal("reasonId", "TILL_REASON_INVALID", "Not a variance reason").focus).toBe("reason");
    expect(refusal("userId", "TILL_APPROVER_SELF", "Not your own")).toEqual({
      line: "TILL_APPROVER_SELF — Not your own",
      focus: null,
      clearPin: false,
    });
    // No code (a network failure): the message alone.
    expect(decideRefusal(tillErrorOf({ status: "FETCH_ERROR", error: "Failed to fetch" })).line).toBe("Failed to fetch");
  });
});
