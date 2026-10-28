import { describe, expect, it } from "vitest";
import type { GridRow } from "../shared/wire/types";
import {
  EMPTY_REVIEW_FORM,
  HISTORY_COLUMNS,
  OUTCOMES,
  OUTCOME_COLUMNS,
  VOUCHER_DAYS,
  historyHead,
  historyParams,
  historyTable,
  isOutcome,
  lastReviewChipTone,
  liveSessionText,
  needsVoucher,
  noteCaption,
  outcomeTone,
  reviewBody,
  reviewFacts,
  reviewProblem,
  reviewTargets,
  reviewTitle,
  targetKey,
  targetsParams,
  voucherBranches,
  voucherOptions,
  voucherParams,
  voucherYear,
  type ReviewForm,
  type ReviewTarget,
} from "./ho-review";

const COMPANY = "019c8ea6-19e9-78a8-b15f-749e1cde7292";
const CBE = "019c8ea7-b0f5-72d5-96a5-1abfc80cc8ab";
const HO = "01a13e21-416e-7f58-b301-da9f82d61578";
const USER = "0b6d0c0e-1111-2222-3333-444444444444";
const AS_ON = "2026-10-17";
const NOW = new Date("2026-10-17T14:00:00+05:30");

const store = (patch: GridRow = {}): GridRow => ({
  branch_id: CBE,
  branch_name: "Acme Foods - Coimbatore Branch",
  day_status: "OPEN",
  tbd_id: "day-1",
  tbd_acc_year: "2026-2027",
  old_open_day: "",
  live: "1",
  over_hours: "0",
  safe_count: "never",
  in_transit: "0.00",
  transit_days: "0",
  var_mtd: "-120.00",
  approvals: "0",
  last_review: "",
  ...patch,
});

const liveSession = (patch: GridRow = {}): GridRow => ({
  tss_id: "s-live",
  tss_acc_year: "2026-2027",
  tss_branch_id: CBE,
  tss_session_no: "ZT2-261017-01",
  tss_status: "OPEN",
  tss_opened_on: "2026-10-17T11:00:00+05:30",
  cashier: "Kavi",
  counter_code: "ZT2",
  ...patch,
});

const daySession = (patch: GridRow = {}): GridRow => ({
  tss_id: "s-day",
  tss_acc_year: "2026-2027",
  tss_session_no: "ZT1-261017-01",
  cashier: "Mani",
  status_text: "CLOSED",
  ...patch,
});

const dayTarget: ReviewTarget = { kind: "day", id: "day-1", year: "2026-2027", text: "The business day 17/10" };
const sessionTarget: ReviewTarget = { kind: "session", id: "s-live", year: "2026-2027", text: "ZT2-261017-01 · Kavi · OPEN" };

const form = (patch: Partial<ReviewForm> = {}): ReviewForm => ({ ...EMPTY_REVIEW_FORM, target: dayTarget, ...patch });

describe("outcomes", () => {
  it("are ck_tsr_outcome's seven, in the mockup's order", () => {
    expect(OUTCOMES.map((entry) => entry.code)).toEqual([
      "OK",
      "QUERY",
      "ESCALATED",
      "RECOVERY_ORDERED",
      "WRITTEN_OFF",
      "SUSPENSE_CLEARED",
      "BANK_MATCHED",
    ]);
    expect(OUTCOMES.find((entry) => entry.code === "WRITTEN_OFF")?.hint).toBe("the short is the company's loss");
    expect(isOutcome("QUERY")).toBe(true);
    expect(isOutcome("MAYBE")).toBe(false);
  });

  it("sit in two columns: OK, ESCALATED, WRITTEN_OFF, BANK_MATCHED left; the rest right", () => {
    expect(OUTCOME_COLUMNS[0].map((entry) => entry.code)).toEqual(["OK", "ESCALATED", "WRITTEN_OFF", "BANK_MATCHED"]);
    expect(OUTCOME_COLUMNS[1].map((entry) => entry.code)).toEqual(["QUERY", "RECOVERY_ORDERED", "SUSPENSE_CLEARED"]);
  });

  it("have Qt's colours", () => {
    expect(outcomeTone("OK")).toBe("green");
    expect(outcomeTone("BANK_MATCHED")).toBe("green");
    expect(outcomeTone("QUERY")).toBe("amber");
    expect(outcomeTone("ESCALATED")).toBe("red");
    expect(outcomeTone("RECOVERY_ORDERED")).toBe("blue");
    expect(lastReviewChipTone("BANK_MATCHED 16-10")).toBe("green");
    expect(lastReviewChipTone("QUERY 16-10")).toBe("amber");
  });

  it("only written off and suspense cleared name a journal; the note is required unless OK", () => {
    expect(needsVoucher("WRITTEN_OFF")).toBe(true);
    expect(needsVoucher("SUSPENSE_CLEARED")).toBe(true);
    expect(needsVoucher("QUERY")).toBe(false);
    expect(needsVoucher("")).toBe(false);
    expect(noteCaption("OK")).toBe("Note");
    expect(noteCaption("")).toBe("Note *");
    expect(noteCaption("QUERY")).toBe("Note *");
  });
});

describe("the title and the facts", () => {
  it("names the store and the day", () => {
    expect(reviewTitle("Acme Foods - Coimbatore Branch", AS_ON)).toBe("Add HO review — Acme Foods - Coimbatore Branch · 17/10/2026");
  });

  it("the live session fact names the oldest live session with its hours", () => {
    expect(liveSessionText(store(), [liveSession()], NOW)).toBe("ZT2-261017-01 · 3 h");
    expect(liveSessionText(store({ live: "2" }), [liveSession()], NOW)).toBe("ZT2-261017-01 · 3 h (+1)");
    expect(liveSessionText(store(), [liveSession({ tss_branch_id: HO })], NOW)).toBe("1");
    expect(liveSessionText(store(), [liveSession({ tss_opened_on: "junk" })], NOW)).toBe("ZT2-261017-01");
  });

  it("the facts: the live box's Coimbatore", () => {
    const facts = reviewFacts(store(), [liveSession()], NOW);
    expect(facts.map((fact) => fact.caption)).toEqual(["Day", "Live session", "Safe count", "In transit", "Var. MTD", "Approvals"]);
    const byKey = Object.fromEntries(facts.map((fact) => [fact.key, fact]));
    expect(byKey.day).toMatchObject({ value: "OPEN", tone: "" });
    expect(byKey.live).toMatchObject({ value: "ZT2-261017-01 · 3 h", tone: "amber" });
    expect(byKey.safeCount).toMatchObject({ value: "never", tone: "red" });
    expect(byKey.transit).toMatchObject({ value: "0.00", tone: "" });
    expect(byKey.varMtd).toMatchObject({ value: "−120.00", tone: "red" });
    expect(byKey.approvals).toMatchObject({ value: "0", tone: "" });
  });

  it("the facts' other tones: an older day open, over hours, a counted safe, old transit, a surplus", () => {
    const byKey = Object.fromEntries(
      reviewFacts(
        store({
          old_open_day: "16-10",
          over_hours: "1",
          safe_count: "today",
          in_transit: "12000.00",
          transit_days: "2",
          var_mtd: "40.00",
          approvals: "3",
        }),
        [liveSession()],
        NOW,
      ).map((fact) => [fact.key, fact]),
    );
    expect(byKey.day).toMatchObject({ value: "16/10 OPEN", tone: "red" });
    expect(byKey.live.tone).toBe("red");
    expect(byKey.safeCount).toMatchObject({ value: "today", tone: "green" });
    expect(byKey.transit).toMatchObject({ value: "12,000.00 · 2 d", tone: "red" });
    expect(byKey.varMtd).toMatchObject({ value: "+40.00", tone: "green" });
    expect(byKey.approvals).toMatchObject({ value: "3", tone: "amber" });
  });

  it("a closed day with nothing live and no safe count yet", () => {
    const byKey = Object.fromEntries(
      reviewFacts(store({ day_status: "CLOSED", live: "0", safe_count: "" }), [], NOW).map((fact) => [fact.key, fact]),
    );
    expect(byKey.day).toMatchObject({ value: "CLOSED", tone: "green" });
    expect(byKey.live).toMatchObject({ value: "none", tone: "" });
    expect(byKey.safeCount).toMatchObject({ value: "", tone: "green" });
  });
});

describe("what is reviewed", () => {
  it("grids 150 and 174 get every token", () => {
    expect(targetsParams(COMPANY, CBE, AS_ON)).toEqual({
      icompany_id: COMPANY,
      ibranch_id: CBE,
      ifrom_date: AS_ON,
      ito_date: AS_ON,
      istatus: "",
      ivariance: "",
    });
    expect(historyParams(COMPANY, CBE, AS_ON)).toEqual({ icompany_id: COMPANY, ibranch_id: CBE, iday: AS_ON });
  });

  it("the day first, then the store's live sessions, then the day's sessions — a session once", () => {
    const targets = reviewTargets(
      store(),
      AS_ON,
      [liveSession(), liveSession({ tss_id: "other", tss_branch_id: HO, tss_session_no: "HO-1" })],
      [daySession(), daySession({ tss_id: "s-live", tss_session_no: "ZT2-261017-01", status_text: "OPEN" })],
    );
    expect(targets.map((target) => target.text)).toEqual([
      "The business day 17/10",
      "ZT2-261017-01 · Kavi · OPEN",
      "ZT1-261017-01 · Mani · CLOSED",
    ]);
    expect(targets[0]).toEqual(dayTarget);
    expect(targets[1]).toEqual(sessionTarget);
    expect(targetKey(targets[2])).toBe("session:s-day");
  });

  it("no day, no cashier, no status: the parts left out", () => {
    const targets = reviewTargets(store({ tbd_id: "" }), AS_ON, [], [daySession({ cashier: "", status_text: "" })]);
    expect(targets).toEqual([{ kind: "session", id: "s-day", year: "2026-2027", text: "ZT1-261017-01" }]);
    expect(reviewTargets(store({ tbd_id: "" }), AS_ON, [], [daySession({ tss_id: "" })])).toEqual([]);
  });
});

describe("the journal", () => {
  it("is read in the store's branch and the user's own when it is another", () => {
    expect(voucherBranches(CBE, HO)).toEqual([CBE, HO]);
    expect(voucherBranches(CBE, CBE)).toEqual([CBE]);
    expect(voucherBranches(CBE, "")).toEqual([CBE]);
  });

  it("in the open day's year, else the header's", () => {
    expect(voucherYear(store(), "2025-2026")).toBe("2026-2027");
    expect(voucherYear(store({ tbd_acc_year: "" }), "2025-2026")).toBe("2025-2026");
  });

  it("grid 117: Jrl, the last 90 days to the as-on date, up to today", () => {
    expect(VOUCHER_DAYS).toBe(90);
    expect(
      voucherParams({ userId: USER, companyId: COMPANY, branchId: HO, year: "2026-2027", asOn: AS_ON, today: "2026-10-19" }),
    ).toEqual({
      iuser_id: USER,
      icompany_id: COMPANY,
      ibranch_id: HO,
      iacc_year: "2026-2027",
      itype_code: "Jrl",
      ifrom_date: "2026-07-19",
      ito_date: "2026-10-19",
    });
  });

  it("offers POSTED journals only, written as refno · date · total · the first forty of the remarks", () => {
    const options = voucherOptions([
      {
        avh_voucher_id: "v1",
        avh_acc_year: "2026-2027",
        avh_voucher_refno: "JV/0012",
        avh_voucher_date: "2026-10-10T00:00:00.000Z",
        avh_total_debit: "8000.00",
        avh_remarks: "Coimbatore safe short written off after the HO count of the sixteenth",
        avh_voucher_status: "POSTED",
      },
      {
        avh_voucher_id: "v2",
        avh_acc_year: "2026-2027",
        avh_voucher_refno: "JV/0013",
        avh_voucher_date: "2026-10-11",
        avh_total_debit: "100.00",
        avh_remarks: "",
        avh_voucher_status: "DRAFT",
      },
      {
        avh_voucher_id: "v3",
        avh_acc_year: "2026-2027",
        avh_voucher_refno: "JV/0014",
        avh_voucher_date: "2026-10-12",
        avh_total_debit: "250.50",
        avh_remarks: null,
        avh_voucher_status: "POSTED",
      },
    ]);
    expect(options).toEqual([
      { id: "v1", year: "2026-2027", text: "JV/0012 · 10/10/2026 · 8,000.00 · Coimbatore safe short written off after " },
      { id: "v3", year: "2026-2027", text: "JV/0014 · 12/10/2026 · 250.50" },
    ]);
  });
});

describe("the rules", () => {
  it("nothing to review until a target is listed", () => {
    expect(reviewProblem(form({ target: null }), 0)).toBe(
      "Nothing to review: the store has no business day or session on this date.",
    );
  });

  it("then an outcome, a note unless OK, the journal for written off", () => {
    expect(reviewProblem(form(), 1)).toBe("Pick an outcome.");
    expect(reviewProblem(form({ outcome: "QUERY" }), 1)).toBe("Type a note: what the store must do, or why.");
    expect(reviewProblem(form({ outcome: "QUERY", note: "   " }), 1)).toBe("Type a note: what the store must do, or why.");
    expect(reviewProblem(form({ outcome: "OK" }), 1)).toBe("");
    expect(reviewProblem(form({ outcome: "WRITTEN_OFF", note: "written off" }), 1)).toBe(
      "Pick the journal head office raised for it.",
    );
    expect(
      reviewProblem(form({ outcome: "WRITTEN_OFF", note: "written off", voucher: { id: "v1", year: "2026-2027", text: "x" } }), 1),
    ).toBe("");
    expect(reviewProblem(form({ outcome: "QUERY", note: "why?" }), 1)).toBe("");
  });

  it("the day's body: dayId and its year; the note trimmed", () => {
    expect(reviewBody(COMPANY, CBE, form({ outcome: "QUERY", note: "  why is the safe at −8,000? Count it.  " }))).toEqual({
      companyId: COMPANY,
      branchId: CBE,
      accYear: "2026-2027",
      outcome: "QUERY",
      dayId: "day-1",
      note: "why is the safe at −8,000? Count it.",
    });
  });

  it("a session's body: sessionId; OK without a note sends none", () => {
    const body = reviewBody(COMPANY, CBE, form({ target: { ...sessionTarget, year: "2025-2026" }, outcome: "OK" }));
    expect(body).toEqual({ companyId: COMPANY, branchId: CBE, accYear: "2025-2026", outcome: "OK", sessionId: "s-live" });
    expect(body).not.toHaveProperty("dayId");
    expect(body).not.toHaveProperty("note");
  });

  it("the journal pair rides only when the outcome needs it", () => {
    const voucher = { id: "v1", year: "2026-2027", text: "JV/0012" };
    expect(reviewBody(COMPANY, CBE, form({ outcome: "WRITTEN_OFF", note: "w", voucher }))).toMatchObject({
      refVoucherId: "v1",
      refVoucherAccYear: "2026-2027",
    });
    const query = reviewBody(COMPANY, CBE, form({ outcome: "QUERY", note: "q", voucher }));
    expect(query).not.toHaveProperty("refVoucherId");
    expect(query).not.toHaveProperty("refVoucherAccYear");
  });

  it("no body without a target or an outcome", () => {
    expect(reviewBody(COMPANY, CBE, form({ target: null, outcome: "OK" }))).toBeNull();
    expect(reviewBody(COMPANY, CBE, form())).toBeNull();
  });
});

describe("earlier reviews", () => {
  it("On · Reviewing · Outcome (a pill) · By · Note", () => {
    expect(HISTORY_COLUMNS.map((column) => column.title)).toEqual(["On", "Reviewing", "Outcome", "By", "Note"]);
    const table = historyTable([
      { tsr_id: "r1", on_text: "17/10 01:00 PM", reviewing: "day 17-10", tsr_outcome: "ESCALATED", reviewer: "HO", note: "n" },
    ]);
    expect(table.rows[0].key).toBe("r1");
    expect(table.rows[0].cells[2].pills).toEqual([{ text: "ESCALATED", tone: "red" }]);
    expect(table.rows[0].cells.map((cell) => cell.text)).toEqual(["17/10 01:00 PM", "day 17-10", "ESCALATED", "HO", "n"]);
  });

  it("the head: newest first, or none yet", () => {
    expect(historyHead("Acme Foods - Coimbatore Branch", false)).toBe("EARLIER REVIEWS OF ACME FOODS - COIMBATORE BRANCH — newest first");
    expect(historyHead("Acme", true)).toBe("EARLIER REVIEWS OF ACME — none yet");
  });
});
