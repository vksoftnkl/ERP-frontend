import { describe, expect, it } from "vitest";
import type { TillSessionPayload, TillSessionTender, TillSlipCheckPayload, TillVariance } from "../shared/wire/types";
import {
  approvalBand,
  approveButton,
  cockpitButtons,
  cockpitFacts,
  cockpitHeader,
  cockpitTiles,
  footNote,
  gridCellText,
  pendingVariance,
  shouldFallBackToBlind,
  slipTenders,
  tenderRows,
} from "./cockpit";
import { badgeTone, journalSummary, rowHint, sessionGridParams, sessionRowOf, varianceTone } from "./session-list";
import { initialMarks, slipCheckBody, slipFacts, slipResult } from "./slip-check";

function tender(over: Partial<TillSessionTender>): TillSessionTender {
  return {
    tenderTypeId: 1,
    tenderTypeName: "CASH",
    tenderId: null,
    tenderName: null,
    closeMode: "DENOM",
    openAmount: 2000,
    salesAmount: 10500.5,
    refundAmount: 0,
    receiptAmount: 0,
    paymentAmount: 0,
    expenseAmount: 0,
    movedIn: 0,
    movedOut: 5000,
    paidFromBank: null,
    txnCount: 3,
    noRefCount: 0,
    expected: 7500.5,
    counted: 7490.5,
    variance: -10,
    ...over,
  };
}

function variance(over: Partial<TillVariance>): TillVariance {
  return {
    tvrId: "v",
    tvrAccYear: "2026-2027",
    tvrStage: "CLOSE",
    tvrTenderTypeId: 1,
    tvrTenderId: null,
    tvrExpected: 0,
    tvrCounted: 0,
    tvrVariance: -10,
    tvrTolerance: 5,
    tvrTreatment: "PENDING",
    tvrReasonId: "r-short",
    tvrStatus: "OPEN",
    tvrVoucherId: null,
    ...over,
  };
}

function session(over: Partial<TillSessionPayload> = {}): TillSessionPayload {
  return {
    tssId: "tss",
    tssSessionNo: "C01-261009-01",
    operatorName: "RAVI K",
    counterName: "Counter 1",
    counterCode: "C01",
    tssBusinessDate: "2026-10-09",
    tssStatus: "COUNTING",
    tssOpenedOn: "2026-10-09T03:30:00.000Z",
    tssBillingEndedOn: "2026-10-09T10:42:00.000Z",
    tssClosedOn: null,
    tssFloatMode: "ISSUED",
    tssFloatIssued: 2000,
    tssFloatCounted: 2000,
    tssCountMode: "BLIND",
    tssCountPlace: "COUNTER",
    tssCountAttempts: 2,
    tssZNo: null,
    expectedVisible: true,
    totals: { netSales: 99999 },
    tenders: [
      tender({}),
      tender({ tenderTypeId: 2, tenderTypeName: "CARD", tenderId: "hdfc", tenderName: "HDFC EDC", closeMode: "SLIPS", variance: null }),
      tender({ tenderTypeId: 3, tenderTypeName: "UPI", closeMode: "STATEMENT", noRefCount: 2, counted: null, variance: null }),
      tender({ tenderTypeId: 7, tenderTypeName: "CREDIT", closeMode: "NONE", expected: null, counted: null, variance: null }),
    ],
    variances: [variance({ tvrStage: "OPEN", tvrReasonId: "r-open" }), variance({})],
    ...over,
  } as TillSessionPayload;
}

describe("the Sessions list", () => {
  it("sends all six quoted tokens", () => {
    expect(
      sessionGridParams({ companyId: "", branchId: "br", fromDate: "2026-10-02", toDate: "2026-10-09", status: "", variance: "SHORT" }),
    ).toEqual({
      icompany_id: "00000000-0000-0000-0000-000000000000",
      ibranch_id: "br",
      ifrom_date: "2026-10-02",
      ito_date: "2026-10-09",
      istatus: "",
      ivariance: "SHORT",
    });
  });

  it("reads a row's own key and badges", () => {
    const row = sessionRowOf({
      tss_id: "t1",
      tss_company_id: "co",
      tss_branch_id: "br",
      tss_acc_year: "2026-2027",
      tss_session_no: "C01-261009-01",
      tss_status: "PENDING_APPROVAL",
      cashier: "RAVI K",
      counter_code: "C01",
    });
    expect(row?.key).toEqual({ companyId: "co", branchId: "br", accYear: "2026-2027", tssId: "t1" });
    expect(sessionRowOf({})).toBeNull();
    expect(badgeTone("status_text", "PENDING APPROVAL")).toBe("amber");
    expect(badgeTone("status_text", "CLOSED")).toBe("green");
    expect(badgeTone("treatment", "WITHIN TOL.")).toBe("grey");
    expect(badgeTone("treatment", "RECOVER")).toBe("red");
    expect(varianceTone("-10.00")).toBe("red");
    expect(varianceTone("0.00")).toBe("");
    expect(rowHint(row)).toMatch(/^Out of tolerance/);
    expect(journalSummary(row!, 1)).toEqual(["C01-261009-01", "RAVI K", "C01", "now PENDING APPROVAL", "1 event"]);
  });
});

describe("the cockpit", () => {
  it("falls back to the blind read on a refusal of the supervisor's", () => {
    expect(shouldFallBackToBlind(403, "")).toBe(true);
    expect(shouldFallBackToBlind(409, "TILL_BLIND_CLOSE")).toBe(true);
    expect(shouldFallBackToBlind(404, "TILL_SESSION_NOT_FOUND")).toBe(false);
  });

  it("heads and describes the session", () => {
    const header = cockpitHeader(session());
    expect(header.title).toBe("Till Session  C01-261009-01");
    expect(header.sub).toBe("RAVI K · Counter 1 (C01) · business date 09-10-2026");
    expect(header.pillTone).toBe("amber");
    const facts = cockpitFacts(session(), new Date("2026-10-09T12:00:00Z"));
    expect(facts.duration).toBe("7 h 12 m");
    expect(facts.float).toBe("ISSUED 2,000.00 · counted 2,000.00");
    expect(facts.count).toBe("BLIND · at counter · 2 attempts");
    expect(facts.z).toBe("issued on close");
  });

  it("reconciles the tenders the way Qt draws them", () => {
    const names = new Map([["r-short", "Miscount"]]);
    const { rows, totalVariance } = tenderRows(session(), names, true);
    expect(rows[0].cells.map((c) => c.text)).toEqual([
      "2,000.00",
      "10,500.50",
      "0.00",
      "0.00",
      "0.00",
      "0.00",
      "0.00",
      "5,000.00",
      "7,500.50",
      "7,490.50",
      "−10.00",
    ]);
    expect(rows[0].cells[10].tone).toBe("red");
    expect(rows[0].reason).toBe("Miscount");
    expect(rows[0].treatment).toBe("PENDING");
    expect(rows[2].cells[9]).toEqual({ text: "later · 2 with no ref", tone: "amber" });
    expect(rows[3].cells[8]).toEqual({ text: "info", tone: "muted" });
    expect(totalVariance.text).toBe("−10.00");
    expect(tenderRows(session(), names, false).totalVariance.text).toBe("");
  });

  it("raises the approval band for a pending drawer variance", () => {
    const band = approvalBand(session());
    expect(band?.code).toBe("CASH_VARIANCE");
    expect(band?.text).toBe("−10.00 against a tolerance of 5.00 — waits for a supervisor.");
    const slipBand = approvalBand(
      session({ variances: [variance({ tvrTenderTypeId: 2, tvrTenderId: "hdfc", tvrVariance: -160 })] }),
    );
    expect(slipBand?.code).toBe("NONCASH_VARIANCE");
    expect(slipBand?.note).toMatch(/^Reported, not enforced/);
    expect(approvalBand(session({ variances: [], tssStatus: "CLOSED" }))).toBeNull();
    expect(approvalBand(session({ variances: [], tssStatus: "PENDING_APPROVAL" }))?.text).toBe(
      "The count is out of tolerance after the last recount.",
    );
    expect(approvalBand(session({ tssStatus: "PENDING_APPROVAL" }))?.note).toBe(
      "Approve decides it: a treatment and a reason, or send it back to recount. Not the session's cashier — a " +
        "supervisor or above with an Approval Setup (276) grant, or a super admin.",
    );
  });

  it("picks the cash variance among the pending ones", () => {
    const card = variance({ tvrId: "card", tvrTenderTypeId: 2, tvrTenderId: "hdfc" });
    const cash = variance({ tvrId: "cash" });
    expect(pendingVariance(session({ variances: [cash, card] }))?.tvrId).toBe("cash");
    expect(pendingVariance(session({ variances: [card, cash] }))?.tvrId).toBe("cash");
    expect(pendingVariance(session({ variances: [card] }))?.tvrId).toBe("card");
    expect(pendingVariance(session({ variances: [variance({ tvrTreatment: "EXPENSE" })] }))).toBeNull();
  });

  it("lets anyone but the session's cashier approve a session waiting for it", () => {
    const waiting = session({ tssStatus: "PENDING_APPROVAL", tssOperatorId: "019C-CASHIER" });
    expect(approveButton(waiting, "019c-supervisor")).toEqual({
      enabled: true,
      tip: "Approve with a treatment, or send it back to recount",
    });
    expect(approveButton(waiting, "019c-cashier")).toEqual({
      enabled: false,
      tip: "You are this session's cashier: another person approves it",
    });
    expect(approveButton(session({ tssOperatorId: "019c-cashier" }), "019c-supervisor")).toEqual({
      enabled: false,
      tip: "Only a session waiting for approval (PENDING_APPROVAL)",
    });
    expect(approveButton(null, "me").enabled).toBe(false);
  });

  it("counts the tiles off the grids", () => {
    const tiles = cockpitTiles(session(), {
      bills: [
        { tb_kind: "BILL", tb_status: "POSTED", tb_amount: "1180.00" },
        { tb_kind: "BILL", tb_status: "DRAFT", tb_amount: "50.00" },
        { tb_kind: "RETURN", tb_status: "POSTED", tb_amount: "-180.00" },
      ],
      money: [
        { md_kind: "PICKUP", md_status: "POSTED" },
        { md_kind: "RECEIPT", md_status: "POSTED" },
        { md_kind: "EXPENSE VOUCHER", md_status: "CANCELLED" },
      ],
      counts: [{}, {}],
      events: [{ tev_event_code: "NO_SALE" }, { tev_event_code: "RETENDER" }, { tev_event_code: "SESSION_OPEN" }],
    });
    expect(tiles).toMatchObject({
      bills: 1,
      returns: 1,
      receipts: 1,
      pickups: 1,
      expenses: 0,
      noSales: 1,
      retenders: 1,
      recounts: 1,
      netSales: "1,000.00",
      billsTab: "Bills 2",
      moneyTab: "Money documents 3",
      countsTab: "Counts 2",
      firstTab: "bills",
    });
    expect(cockpitTiles(session({ tssStatus: "CLOSED" }), { bills: [], money: [], counts: [], events: [] }).netSales).toBe(
      "99,999.00",
    );
  });

  it("enables the verbs on the right statuses", () => {
    expect(cockpitButtons(session())).toEqual({ count: true, slipCheck: true });
    expect(cockpitButtons(session({ tssStatus: "OPEN" }))).toEqual({ count: false, slipCheck: false });
    expect(slipTenders(session())).toEqual([{ tenderId: "hdfc", name: "HDFC EDC" }]);
    expect(footNote(false, true)).toMatch(/blind close/);
    expect(gridCellText({ md_amount: "500.00", md_doc: "TDrp/7" }, "md_amount")).toBe("500.00");
  });
});

describe("the slip check", () => {
  const DATA: TillSlipCheckPayload = {
    tssId: "tss",
    tssSessionNo: "C01-261009-01",
    tenderId: "hdfc",
    tenderName: "HDFC EDC",
    expected: 1000,
    batchTotal: 840,
    batchRef: "B-77",
    slipCount: 3,
    difference: -160,
    rows: [
      { tdId: "td1", tdAccYear: "y", time: "2026-10-09T05:00:00Z", srcDocType: "SALE_BILL", srcDocId: "b1", docRefno: "bil1", drCr: "DR", amount: 500, authCode: "A1", cardLast4: "4432", refNo: null },
      { tdId: "td2", tdAccYear: "y", time: "2026-10-09T06:00:00Z", srcDocType: "SALE_BILL", srcDocId: "b2", docRefno: "bil2", drCr: "DR", amount: 160, authCode: null, cardLast4: null, refNo: "R9" },
      { tdId: "td3", tdAccYear: "y", time: "2026-10-09T07:00:00Z", srcDocType: "SALE_RETURN", srcDocId: "r1", docRefno: "ret1", drCr: "CR", amount: 20, authCode: "A3", cardLast4: "1111", refNo: null },
    ],
  };
  const KEY = { companyId: "co", branchId: "br", accYear: "y", tssId: "tss" };

  it("says what the terminal shows", () => {
    const facts = slipFacts(DATA, "x");
    expect(facts.title).toBe("Slip check — C01-261009-01 · HDFC EDC");
    expect(facts.short).toBe("−160.00");
    expect(facts.shortDanger).toBe(true);
  });

  it("explains every row and what is left", () => {
    const marks = initialMarks(DATA.rows);
    marks[1] = { slip: false, differs: false };
    marks[2] = { slip: true, differs: true };
    const result = slipResult(DATA, marks, [{ amountPaise: 16000, authCode: "Z1", cardLast4: "" }]);
    expect(result.rows.map((r) => r.tone)).toEqual(["green", "red", "amber"]);
    expect(result.rows[1].auth).toBe("R9");
    expect(result.rows[2].amount).toBe("-20.00");
    expect(result.unexplained).toBe("−160.00 · bil2 — keyed, matched no slip");
    expect(result.explained).toBe("160.00 — 1 slip with no bill: re-tender those bills to card");
    expect(result.approval?.amount).toBe("160.00");
    expect(result.recordLabel).toBe("Record the check  (2 ticked)");
  });

  it("records counts and exceptions, never the ticks", () => {
    const marks = initialMarks(DATA.rows);
    marks[0] = { slip: false, differs: true };
    marks[2] = { slip: true, differs: true };
    expect(slipCheckBody(KEY, "hdfc", DATA, marks, [{ amountPaise: 16050, authCode: " ", cardLast4: "4432" }])).toEqual({
      ...KEY,
      tenderId: "hdfc",
      ticked: 2,
      noSlip: ["td1"],
      amountDiffers: ["td3"],
      slipsWithoutRow: [{ amount: 160.5, authCode: null, cardLast4: "4432" }],
      notes: null,
    });
  });
});
