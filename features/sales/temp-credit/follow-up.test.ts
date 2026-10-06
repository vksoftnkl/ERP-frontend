import { describe, expect, it } from "vitest";
import { buildFollowUpBody, promiseDateOf } from "./follow-up";
import type { TempCreditRow } from "./row";

const ROW: TempCreditRow = {
  atc_id: "019f0000-0000-7000-8000-00000000a7c1",
  atc_company_id: "c-1",
  atc_branch_id: "b-1",
  atc_acc_year: "2026-2027",
  atc_bill_date: "2026-10-01",
  atc_bill_refno: "SB/0042",
  atc_name: "Ravi",
  atc_mobile: "9876543210",
  atc_place: "Gandhipuram",
  atc_credit_amount: 500,
  atc_balance_amount: 200,
  atc_due_date: "2026-10-11",
  days_overdue: 0,
  atc_status: "PARTIAL",
  atc_promise_date: "2026-10-15T00:00:00.000Z",
  atc_created_by: "vkpos",
  atc_src_doc_id: "sb-1",
  atc_abl_id: "abl-1",
  atc_party_id: "led-1",
  atc_party_name: "WALK-IN",
};

describe("buildFollowUpBody — the three-way promise date", () => {
  const original = promiseDateOf(ROW);

  it("reads the stored promise as a plain date", () => {
    expect(original).toBe("2026-10-15");
  });

  it("leaves the key OUT when the date was not touched", () => {
    const outcome = buildFollowUpBody({ row: ROW, originalPromise: original, promiseDate: original, remarks: "called" });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.body).toEqual({ atcId: ROW.atc_id, atcAccYear: "2026-2027", remarks: "called" });
      expect("promiseDate" in outcome.body).toBe(false);
    }
  });

  it("sends null when the date was cleared", () => {
    const outcome = buildFollowUpBody({ row: ROW, originalPromise: original, promiseDate: "", remarks: "no answer" });
    expect(outcome.ok && outcome.body.promiseDate).toBeNull();
  });

  it("sends the date when it was set or moved", () => {
    const outcome = buildFollowUpBody({ row: ROW, originalPromise: original, promiseDate: "2026-10-20", remarks: "will pay Monday" });
    expect(outcome.ok && outcome.body.promiseDate).toBe("2026-10-20");
    const fresh = buildFollowUpBody({ row: { ...ROW, atc_promise_date: "" }, originalPromise: "", promiseDate: "2026-10-20", remarks: "x" });
    expect(fresh.ok && fresh.body.promiseDate).toBe("2026-10-20");
  });

  it("refuses a blank remark — the remark IS the follow-up", () => {
    const outcome = buildFollowUpBody({ row: ROW, originalPromise: original, promiseDate: original, remarks: "   " });
    expect(outcome).toEqual({ ok: false, message: "Say what happened — the remark is the follow-up." });
  });

  it("trims and caps the remark at 250 characters", () => {
    const outcome = buildFollowUpBody({ row: ROW, originalPromise: original, promiseDate: original, remarks: ` ${"x".repeat(300)} ` });
    expect(outcome.ok && outcome.body.remarks.length).toBe(250);
  });
});
