import { describe, expect, it } from "vitest";
import {
  linkRowText,
  notReceivedFacts,
  notReceivedHead,
  pickerHint,
  pickRowGridParams,
  reasonGridParams,
  reasonOptions,
  resolveBody,
  resolveDoneText,
  resolveState,
  unexplainedFacts,
  unexplainedHead,
  writeOffBody,
  writeOffDoneText,
  writeOffQuestion,
  writeOffState,
  type ResolveForm,
  type WriteOffForm,
} from "./exceptions";

const scope = { companyId: "co-1", branchId: "br-1" };

/** Grid 140's row, as the runner sends it (NUMERIC as strings). */
const NOT_RECEIVED = {
  td_id: "td-611",
  td_acc_year: "2026-2027",
  tender_name: "CARD-T2",
  td_doc_date: "2026-10-07",
  td_expected_settle_on: "2026-10-08",
  days_overdue: 3,
  doc_refno: "bil00611",
  session_no: "C02-261007-01",
  cashier: "SURESH B",
  td_total_amt: "160.00",
  td_settle_amount: null,
  outstanding: "160.00",
  td_ref_no: "Q1W2E3",
  td_card_last4: "0000",
  td_settle_status: "PENDING",
};

/** Grid 141's row. */
const UNEXPLAINED = {
  asl_id: "asl-9",
  asl_acc_year: "2026-2027",
  asi_payout_date: "2026-10-08",
  asi_payout_ref: "tst00014",
  asi_status: "POSTED",
  tender_name: "UPI-QR2",
  asl_txn_on: "2026-10-07T15:12:00+05:30",
  asl_ref_no: "428111026638",
  asl_payer: "anand.r@okicici",
  asl_gross_amount: "500.00",
  age_days: 2,
};

describe("reasons", () => {
  it("binds every token of grid 134", () => {
    expect(reasonGridParams("co-1")).toEqual({ icompany_id: "co-1", icategory: "NONCASH", iinactive: "false" });
  });

  it("offers the live NONCASH reasons as CODE — Name", () => {
    expect(
      reasonOptions([
        { trs_id: "r1", trs_category: "NONCASH", trs_code: "FAKE_PROOF", trs_name: "Fake / old payment screenshot", trs_is_active: true },
        { trs_id: "r2", trs_category: "PAID_OUT", trs_code: "TEA", trs_name: "Tea", trs_is_active: true },
        { trs_id: "r3", trs_category: "NONCASH", trs_code: "OLD", trs_name: "Old", trs_is_active: false },
      ]),
    ).toEqual([{ id: "r1", label: "FAKE_PROOF — Fake / old payment screenshot" }]);
  });
});

describe("Not received → write off", () => {
  it("heads the panel with the row", () => {
    expect(notReceivedHead(NOT_RECEIVED)).toBe("bil00611 · 160.00 · CARD-T2 · keyed Q1W2E3 · 0000");
    expect(notReceivedHead(null)).toBe("Pick a row above");
    expect(notReceivedFacts(NOT_RECEIVED)).toBe(
      "Billed 160.00 on 07-10-2026 · expected 08-10-2026 · 3 day(s) overdue · session C02-261007-01 (SURESH B) · PENDING",
    );
  });

  const form: WriteOffForm = { treatment: "RECOVER", reasonId: "r1", recoveryLedgerId: "", notes: "" };

  it("needs a reason, a recovery ledger for RECOVER, and the override", () => {
    const options = { busy: false, canOverride: true };
    expect(writeOffState(NOT_RECEIVED, form, options)).toEqual({ canWriteOff: false, recoverEnabled: true });
    expect(writeOffState(NOT_RECEIVED, { ...form, recoveryLedgerId: "led-staff" }, options).canWriteOff).toBe(true);
    expect(writeOffState(NOT_RECEIVED, { ...form, treatment: "LOSS" }, options)).toEqual({
      canWriteOff: true,
      recoverEnabled: false,
    });
    expect(writeOffState(NOT_RECEIVED, { ...form, treatment: "LOSS", reasonId: "" }, options).canWriteOff).toBe(false);
    expect(writeOffState(null, { ...form, treatment: "LOSS" }, options).canWriteOff).toBe(false);
    expect(writeOffState(NOT_RECEIVED, { ...form, treatment: "LOSS" }, { busy: true, canOverride: true }).canWriteOff).toBe(false);
    expect(writeOffState(NOT_RECEIVED, { ...form, treatment: "LOSS" }, { busy: false, canOverride: false }).canWriteOff).toBe(false);
  });

  it("sends the recovery ledger only for RECOVER, and blank notes as null", () => {
    expect(writeOffBody(scope, NOT_RECEIVED, { ...form, recoveryLedgerId: "led-staff", notes: "  " })).toEqual({
      companyId: "co-1",
      branchId: "br-1",
      tdId: "td-611",
      tdAccYear: "2026-2027",
      treatment: "RECOVER",
      reasonId: "r1",
      notes: null,
      recoveryLedgerId: "led-staff",
    });
    const suspense = writeOffBody(scope, NOT_RECEIVED, { ...form, treatment: "SUSPENSE", recoveryLedgerId: "x", notes: " chasing " });
    expect(suspense).not.toHaveProperty("recoveryLedgerId");
    expect(suspense.notes).toBe("chasing");
  });

  it("asks, then says what happened", () => {
    expect(writeOffQuestion(NOT_RECEIVED, "SUSPENSE")).toBe(
      "Write off 160.00 on bil00611 as SUSPENSE? A TVar posts and the row ends FAILED.",
    );
    expect(writeOffDoneText({ voucherRefno: "tva00031", amount: 16000 })).toBe("Written off — tva00031 160.00");
    expect(writeOffDoneText({ voucherRefno: "", amount: 16000 })).toBe(
      "Written off — nothing posts (both sides are suspense).",
    );
  });
});

describe("Unexplained → resolve", () => {
  it("heads the panel with the line", () => {
    expect(unexplainedHead(UNEXPLAINED)).toBe("Line 15:12 · 500.00 · UPI-QR2");
    expect(unexplainedHead(null)).toBe("Pick a line above");
    expect(unexplainedFacts(UNEXPLAINED)).toBe(
      "Payout 08-10-2026 (tst00014) · RRN / UTR 428111026638 · payer anand.r@okicici · 2 day(s) in suspense",
    );
  });

  const linkRow = { td_id: "td-687", td_acc_year: "2026-2027", doc_refno: "bil00687", tender_name: "CASH", outstanding: "500.00" };
  const form: ResolveForm = { resolution: "LINKED", reasonId: "r1", linkRow: null, incomeLedgerId: "", notes: "" };
  const options = { busy: false, canOverride: true };

  it("needs the posted payout, a reason, and LINKED's row / INCOME's ledger", () => {
    expect(resolveState(UNEXPLAINED, form, options)).toMatchObject({ canResolve: false, pickEnabled: true });
    expect(resolveState(UNEXPLAINED, { ...form, linkRow }, options).canResolve).toBe(true);
    expect(resolveState(UNEXPLAINED, { ...form, resolution: "INCOME" }, options)).toMatchObject({
      canResolve: false,
      incomeEnabled: true,
    });
    expect(resolveState(UNEXPLAINED, { ...form, resolution: "INCOME", incomeLedgerId: "led-inc" }, options).canResolve).toBe(true);
    expect(resolveState(UNEXPLAINED, { ...form, resolution: "SUSPENSE" }, options).canResolve).toBe(true);
    const notPosted = resolveState({ ...UNEXPLAINED, asi_status: "MATCHED" }, { ...form, resolution: "SUSPENSE" }, options);
    expect(notPosted.canResolve).toBe(false);
    expect(notPosted.title).toBe("Post the payout first (Match tab) — until then the line is not in suspense");
  });

  it("sends the line's own year, and only what the resolution names", () => {
    expect(resolveBody(scope, UNEXPLAINED, { ...form, linkRow, notes: "re-tendered" })).toEqual({
      companyId: "co-1",
      branchId: "br-1",
      accYear: "2026-2027",
      aslId: "asl-9",
      resolution: "LINKED",
      reasonId: "r1",
      notes: "re-tendered",
      tdId: "td-687",
      tdAccYear: "2026-2027",
    });
    const income = resolveBody(scope, UNEXPLAINED, { ...form, resolution: "INCOME", linkRow, incomeLedgerId: "led-inc" });
    expect(income).toMatchObject({ resolution: "INCOME", incomeLedgerId: "led-inc", notes: null });
    expect(income).not.toHaveProperty("tdId");
  });

  it("names the picked row and the outcome", () => {
    expect(linkRowText(linkRow)).toBe("bil00687 · CASH · 500.00");
    expect(linkRowText(null)).toBe("pick a pending row of this tender…");
    expect(resolveDoneText("tst00015")).toBe("Resolved — tst00015");
    expect(resolveDoneText("")).toBe("Resolved — no voucher.");
  });
});

describe("the row picker", () => {
  it("binds every token of grid 154, SALE by default", () => {
    expect(pickRowGridParams(scope, "tnd-card", "")).toEqual({
      itd_company_id: "co-1",
      itd_branch_id: "br-1",
      itender_id: "tnd-card",
      iline_kind: "SALE",
      ifrom_date: "",
      ito_date: "",
    });
    expect(pickRowGridParams(scope, "", "CHARGEBACK").iline_kind).toBe("CHARGEBACK");
  });

  it("says which rows a kind may take", () => {
    expect(pickerHint("REFUND")).toMatch(/^Our refund rows still waiting/);
    expect(pickerHint("CHARGEBACK")).toMatch(/^Our rows already settled/);
    expect(pickerHint("SALE")).toMatch(/\(PENDING \/ PARTIAL\)/);
  });
});
