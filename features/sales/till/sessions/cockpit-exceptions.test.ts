/**
 * Qt c77f3f1 on the Session Cockpit: the approval band's new cases, the
 * button rules, Approve Cash, Force close, Reopen, X read, the bag decide,
 * Print Z / X targets and the Bills tab's pick. Qt 425fa80 (notes 124 / 129):
 * a closed session's undecided cash gap, Approve without the cashier gate,
 * and "Cash to safe".
 */
import { describe, expect, it } from "vitest";
import { toReasons } from "../shared/reasons";
import type {
  TillCashApprovalResult,
  TillForceCloseResult,
  TillSessionKey,
  TillSessionMovement,
  TillSessionPayload,
  TillSessionReopenResult,
  TillSessionTender,
  TillVariance,
  TillXReport,
} from "../shared/wire/types";
import {
  approveCashBody,
  approveCashFacts,
  approveCashOutcome,
  approveCashReasons,
  approveCashState,
  approveCashTreatments,
  initialApproveCashForm,
  partsLine,
} from "./approve-cash";
import {
  BAG_DECIDED_MESSAGE,
  CLOSED_GAP_DECIDED_MESSAGE,
  approvalBand,
  approveButton,
  bagDocNo,
  cashToSafeText,
  closedCashGap,
  cockpitFacts,
  exceptionButtons,
  pendingReceive,
  pendingVariance,
  pickedIndexAfter,
  printSlipButton,
  printZLabel,
  printableSlip,
  retenderButton,
  retenderTargetOf,
  retenderableBill,
  sessionPrintTarget,
  slipPrintLabel,
  slipPrintTarget,
  xReadLabel,
} from "./cockpit";
import {
  EMPTY_FORCE_CLOSE,
  categoryReasons,
  forceCloseBody,
  forceCloseHint,
  forceCloseMessage,
  forceCloseProblem,
  noteNeeded,
  notePlaceholder,
  sessionFacts,
} from "./force-close";
import { dialogRefusal } from "./refusal";
import { EMPTY_REOPEN, REOPEN_HINT, reopenBody, reopenMessage, reopenProblem } from "./reopen";
import {
  BAG_DECIDE_HINT,
  CLOSED_GAP_DECIDE_HINT,
  DECIDE_HINT,
  approveOnly,
  bagDecideRequestOf,
  closedGapDecideRequestOf,
  decideBody,
  decideEventText,
  decideHint,
  decideRequestOf,
  initialDecideForm,
} from "./variance-decide";
import { X_NOTE, xReadView } from "./x-read";

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
    tvrVariance: -10,
    tvrTolerance: 5,
    tvrTreatment: "PENDING",
    tvrReasonId: null,
    tvrStatus: "OPEN",
    tvrVoucherId: null,
    ...over,
  };
}

function movement(over: Partial<TillSessionMovement>): TillSessionMovement {
  return {
    tcmId: "m1",
    tcmAccYear: "2026-2027",
    tcmKind: "HANDOVER",
    tcmDocNo: "TDrp/12",
    tcmAmount: 5000,
    tcmStatus: "POSTED",
    tcmReceiptStatus: "AWAITING",
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
    tssOperatorId: "019c-cashier",
    tssStatus: "CLOSED",
    tssZNo: 41,
    tssOpenedOn: "2026-10-09T03:30:00.000Z",
    variances: [],
    movements: [],
    receiptState: "NONE",
    cashAwaiting: 0,
    ...over,
  } as TillSessionPayload;
}

const REASONS = toReasons([
  { trs_id: "v1", trs_category: "VARIANCE", trs_name: "Counting error", trs_is_active: "t", overridden: "f" },
  { trs_id: "v2", trs_category: "VARIANCE", trs_name: "Old", trs_is_active: "f", overridden: "f" },
  { trs_id: "f1", trs_category: "FORCE_CLOSE", trs_name: "Cashier left / absent", trs_is_active: "t", overridden: "f", trs_needs_note: "t" },
  { trs_id: "f2", trs_category: "FORCE_CLOSE", trs_name: "Shift over time", trs_is_active: "t", overridden: "f", trs_needs_note: "f" },
  { trs_id: "f3", trs_category: "FORCE_CLOSE", trs_name: "Shipped", trs_is_active: "t", overridden: "t" },
  { trs_id: "r1", trs_category: "REOPEN", trs_name: "Count keyed wrong", trs_is_active: "t", overridden: "f", trs_needs_note: "t" },
]);

// ─── the approval band ───────────────────────────────────────────────────────

describe("the approval band (c77f3f1)", () => {
  const receive = variance({ tvrId: "rcv", tvrStage: "RECEIVE", tvrVariance: -20, tvrMovementId: "m1" });

  it("gives a received bag's difference its own band, naming the bag", () => {
    const band = approvalBand(session({ variances: [receive], movements: [movement({ tcmReceiptStatus: "RECEIVED" })] }));
    expect(band).toEqual({
      code: "RECEIVE_VARIANCE",
      amount: "−20.00",
      text: "The cash was approved −20.00 against what was handed over (TDrp/12) — the difference waits for another approver.",
      note:
        "Approve books it at once (a treatment and a reason; no recount — the supervisor's count stands). Neither " +
        "that supervisor nor the session's cashier decides it.",
    });
    // A bag not listed: its id's head.
    expect(bagDocNo(session(), "0123456789abcdef")).toBe("01234567");
  });

  it("shows a closed session's cash to approve, with its cashier's name", () => {
    const band = approvalBand(session({ receiptState: "AWAITING", cashAwaiting: 12500.5 }));
    expect(band).toEqual({
      code: "CASH_TO_APPROVE",
      amount: "12,500.50",
      text: "RAVI K handed over 12,500.50 — it is not in the safe until a supervisor approves it.",
      note: "Approve Cash: take the cash, check it, type what you received and your PIN. Not the session's cashier.",
    });
  });

  it("calls a cash gap still pending on a closed session an orphan, booked by Approve (notes 124)", () => {
    const band = approvalBand(session({ variances: [variance({})] }));
    expect(band?.code).toBe("CASH_VARIANCE");
    expect(band?.text).toBe("−10.00 — the session closed without a decision, so it is NOT posted.");
    expect(band?.note).toBe(
      "Approve books it now: a treatment and a reason (SUSPENSE to look into it first). No recount — the cash was " +
        "already handed over. Not the session's cashier unless its Approval Rule (276) allows self.",
    );
    // A pending gap beats the cash to approve (Qt: CASH_TO_APPROVE only with nothing pending).
    expect(approvalBand(session({ variances: [variance({})], receiptState: "AWAITING", cashAwaiting: 50 }))?.code).toBe(
      "CASH_VARIANCE",
    );
  });

  it("leaves the RECEIVE stage out of the ordinary pending gap", () => {
    expect(pendingVariance(session({ variances: [receive] }))).toBeNull();
    expect(pendingReceive(session({ variances: [receive] }))?.tvrId).toBe("rcv");
    // Waiting for approval: the ordinary band, even with a bag difference.
    expect(approvalBand(session({ tssStatus: "PENDING_APPROVAL", variances: [receive] }))?.text).toBe(
      "The count is out of tolerance after the last recount.",
    );
  });

  it("raises no band for a live session's awaiting drop (the cash office's)", () => {
    expect(approvalBand(session({ tssStatus: "OPEN", receiptState: "AWAITING", cashAwaiting: 500 }))).toBeNull();
    expect(approvalBand(session({ receiptState: "APPROVED" }))).toBeNull();
  });
});

// ─── the buttons ─────────────────────────────────────────────────────────────

describe("the cockpit's buttons (Qt refreshButtons)", () => {
  it("offers Approve Cash on a closed session's cash — to its cashier too (the server decides)", () => {
    const awaiting = session({ receiptState: "AWAITING", cashAwaiting: 500 });
    expect(approveButton(awaiting, "019c-supervisor")).toEqual({
      enabled: true,
      tip: "Approve the cash handed over into the safe",
      label: "Approve Cash",
      action: "approveCash",
    });
    expect(approveButton(awaiting, "019C-CASHIER").enabled).toBe(true);
  });

  it("opens the bag decide on a received bag's difference — its cashier may press it too (425fa80)", () => {
    const bag = session({ variances: [variance({ tvrStage: "RECEIVE", tvrMovementId: "m1" })], receiptState: "DIFFERENCE" });
    expect(approveButton(bag, "019c-supervisor")).toEqual({
      enabled: true,
      tip: "Approve with a treatment, or send it back to recount",
      label: "Approve",
      action: "bag",
    });
    // "Allow self" is the rule's (276): the server judges, its refusal shows.
    expect(approveButton(bag, "019c-cashier")).toMatchObject({
      enabled: true,
      tip: 'Your own session: allowed only when its Approval Rule (276) has "Allow self" ticked',
    });
  });

  it("books a closed session's undecided cash gap before its cash to approve (notes 124, Qt's order)", () => {
    const both = session({ variances: [variance({})], receiptState: "AWAITING", cashAwaiting: 50 });
    expect(approveButton(both, "x")).toEqual({
      enabled: true,
      tip: "Book the cash difference this closed session left undecided",
      label: "Approve",
      action: "closedGap",
    });
    expect(approveButton(session({ variances: [variance({})] }), "019c-cashier")).toMatchObject({
      enabled: true,
      action: "closedGap",
    });
    // A bag waiting goes first; the gap's own tip only without one.
    const withBag = session({
      variances: [variance({}), variance({ tvrId: "rcv", tvrStage: "RECEIVE", tvrMovementId: "m1" })],
    });
    expect(approveButton(withBag, "x")).toMatchObject({
      enabled: true,
      tip: "Approve with a treatment, or send it back to recount",
      action: "bag",
    });
    // Not closed: no closed gap — a counting session's pending gap waits for its decision.
    expect(approveButton(session({ tssStatus: "COUNTING", variances: [variance({})] }), "x").enabled).toBe(false);
  });

  it("force-closes a live session, never by its cashier", () => {
    expect(exceptionButtons(session({ tssStatus: "SUSPENDED" }), "boss").forceClose).toEqual({
      enabled: true,
      tip: "Count the drawer and close the session for a cashier who has gone",
    });
    expect(exceptionButtons(session({ tssStatus: "OPEN" }), "019c-cashier").forceClose).toEqual({
      enabled: false,
      tip: "You are this session's cashier: a store manager force-closes it",
    });
    expect(exceptionButtons(session({ tssStatus: "PENDING_APPROVAL" }), "boss").forceClose).toEqual({
      enabled: false,
      tip: "Only a session still open, suspended or counting",
    });
  });

  it("reopens a closed session whose cash is not yet in the safe", () => {
    expect(exceptionButtons(session({ receiptState: "AWAITING" }), "boss").reopen).toEqual({
      enabled: true,
      tip: "Back to counting: the hand-over is voided and the close reversed",
    });
    expect(exceptionButtons(session({ receiptState: "APPROVED" }), "boss").reopen).toEqual({
      enabled: false,
      tip: "Its cash is already approved into the safe: the session stays closed",
    });
    expect(exceptionButtons(session({ receiptState: "DIFFERENCE" }), "boss").reopen.enabled).toBe(false);
    expect(exceptionButtons(session({ tssStatus: "COUNTING" }), "boss").reopen.tip).toBe("Only a closed session is reopened");
    expect(exceptionButtons(session(), "019c-cashier").reopen.tip).toBe(
      "You are this session's cashier: a store manager reopens it",
    );
  });

  it("reads X on a live or waiting session, prints Z on a closed one", () => {
    expect(exceptionButtons(session({ tssStatus: "PENDING_APPROVAL" }), "boss").xRead).toEqual({
      enabled: true,
      tip: "Read the session's expected figures now (journalled)",
    });
    expect(exceptionButtons(session({ tssStatus: "OPEN" }), "019c-cashier").xRead).toEqual({
      enabled: false,
      tip: "Your own session's figures stay hidden until it closes (blind close)",
    });
    const closed = exceptionButtons(session(), "boss");
    expect(closed.xRead).toEqual({ enabled: false, tip: "A closed session prints its Z instead" });
    expect(closed.printZ).toEqual({ enabled: true, tip: "Print the session's Z (80 mm)" });
    expect(exceptionButtons(session({ tssStatus: "OPEN" }), "boss").printZ).toEqual({
      enabled: false,
      tip: "A Z is printed once the session is closed: X read reads a live one",
    });
  });

  it("re-tenders only a posted bill picked on the Bills tab", () => {
    const bill = { tb_id: "b1", tb_kind: "BILL", tb_status: "POSTED", tb_refno: "SB/77" };
    expect(retenderableBill(bill)).toBe(bill);
    expect(retenderableBill({ ...bill, tb_kind: "RETURN" })).toBeNull();
    expect(retenderableBill({ ...bill, tb_status: "DRAFT" })).toBeNull();
    expect(retenderableBill(null)).toBeNull();
    expect(retenderButton(bill)).toEqual({ enabled: true, tip: "Change how bill SB/77 was paid" });
    expect(retenderButton(null)).toEqual({
      enabled: false,
      tip: "Pick a posted bill on the Bills tab to change how it was paid",
    });
    expect(retenderTargetOf(bill, KEY)).toEqual({
      key: { sbId: "b1", sbCompanyId: "co", sbBranchId: "br", sbAccYear: "2026-2027" },
      refno: "SB/77",
    });
  });

  it("moves the Bills tab's pick with the arrow keys", () => {
    expect(pickedIndexAfter("ArrowDown", -1, 3)).toBe(0);
    expect(pickedIndexAfter("ArrowDown", 2, 3)).toBe(2);
    expect(pickedIndexAfter("ArrowUp", 2, 3)).toBe(1);
    expect(pickedIndexAfter("ArrowUp", 0, 3)).toBe(0);
    expect(pickedIndexAfter("End", 0, 3)).toBe(2);
    expect(pickedIndexAfter("Home", 2, 3)).toBe(0);
    expect(pickedIndexAfter("Enter", 0, 3)).toBe(-1);
    expect(pickedIndexAfter("ArrowDown", -1, 0)).toBe(-1);
  });

  it("names the session's Z and X as print documents", () => {
    expect(sessionPrintTarget(KEY, "C01 261009 01", "z")).toEqual({
      docId: "tss",
      companyId: "co",
      accYear: "2026-2027",
      branchId: "br",
      filename: "z-C01_261009_01",
    });
    expect(sessionPrintTarget(KEY, "C01-261009-01", "x").filename).toBe("x-C01-261009-01");
    expect(printZLabel("C01-261009-01")).toBe("Session Z C01-261009-01");
    expect(xReadLabel("C01-261009-01")).toBe("X read C01-261009-01");
  });
});

// ─── Print slip (Qt 3b5069d, notes 135) ──────────────────────────────────────

describe("Print slip on the Money documents tab", () => {
  const money = (kind: string, over: Record<string, unknown> = {}) => ({
    md_id: "tcm-1",
    md_doc: "tpi/00031",
    md_kind: kind,
    md_amount: "150.00",
    md_status: "POSTED",
    ...over,
  });

  it("takes any till movement, any state — never a voucher", () => {
    for (const kind of ["FLOAT_ISSUE", "TOP_UP", "PICKUP", "DROP", "CLOSE_HANDOVER", "PAID_IN", "EXCHANGE"]) {
      expect(printableSlip(money(kind))).not.toBeNull();
    }
    expect(printableSlip(money("DROP", { md_status: "VOIDED" }))).not.toBeNull();
    expect(printableSlip(money("RECEIPT"))).toBeNull();
    expect(printableSlip(money("PAYMENT"))).toBeNull();
    expect(printableSlip(money(""))).toBeNull();
    expect(printableSlip(null)).toBeNull();
  });

  it("says why the button is off, and which slip it prints", () => {
    expect(printSlipButton(null)).toEqual({ enabled: false, tip: "Pick a till movement on the Money documents tab (not a voucher)" });
    expect(printSlipButton(money("RECEIPT")).enabled).toBe(false);
    expect(printSlipButton(money("PICKUP"))).toEqual({ enabled: true, tip: "Print the slip of tpi/00031" });
  });

  it("names the slip as a print document on the cockpit's key, the '/' of the number as '-'", () => {
    expect(slipPrintTarget(money("PICKUP"), KEY)).toEqual({
      docId: "tcm-1",
      companyId: "co",
      accYear: "2026-2027",
      branchId: "br",
      filename: "slip-tpi-00031",
    });
    expect(slipPrintLabel(money("PICKUP"))).toBe("Slip tpi/00031");
  });
});

// ─── the bag decide ──────────────────────────────────────────────────────────

describe("decide variance on a received bag (setBag)", () => {
  const s = session({
    variances: [variance({ tvrStage: "RECEIVE", tvrVariance: -20, tvrMovementId: "m1" })],
    movements: [movement({ tcmReceiptStatus: "RECEIVED" })],
  });

  it("opens on the bag's difference, its doc no in the Event fact", () => {
    const request = bagDecideRequestOf(s, KEY);
    expect(request).toEqual({
      key: KEY,
      event: "CASH_VARIANCE",
      variancePaise: -2000,
      sessionNo: "C01-261009-01",
      cashier: "RAVI K",
      bag: { tcmId: "m1", docNo: "TDrp/12" },
    });
    expect(decideEventText(request)).toBe("RECEIVE_VARIANCE · TDrp/12");
    expect(decideEventText({ ...request, bag: null })).toBe("CASH_VARIANCE");
    expect(BAG_DECIDE_HINT).toMatch(/^The cash was approved for other than was handed over/);
    expect(BAG_DECIDED_MESSAGE).toBe("Approved: the bag's difference is booked.");
  });

  it("sends the bag's tcmId with the approval", () => {
    const form = { ...initialDecideForm("CASH_VARIANCE"), reasonId: "v1", note: "short in the bag" };
    expect(decideBody(KEY, form, "m1")).toEqual({
      ...KEY,
      decision: "APPROVE",
      treatment: "EXPENSE",
      reasonId: "v1",
      note: "short in the bag",
      tcmId: "m1",
    });
    expect(decideBody(KEY, form)).not.toHaveProperty("tcmId");
  });
});

// ─── Approve Cash ────────────────────────────────────────────────────────────

describe("Approve Cash", () => {
  const closed = session({
    receiptState: "AWAITING",
    cashAwaiting: 5500,
    movements: [
      movement({ tcmId: "h", tcmKind: "HANDOVER", tcmDocNo: "TDrp/12", tcmAmount: 5000 }),
      movement({ tcmId: "d", tcmKind: "DROP", tcmDocNo: "TDrp/9", tcmAmount: 500 }),
      movement({ tcmId: "x", tcmKind: "DROP", tcmDocNo: "TDrp/8", tcmAmount: 300, tcmStatus: "VOIDED" }),
      movement({ tcmId: "y", tcmKind: "DROP", tcmDocNo: "TDrp/7", tcmAmount: 200, tcmReceiptStatus: "RECEIVED" }),
    ],
    variances: [variance({ tvrStage: "CLOSE", tvrTolerance: 10, tvrTreatment: "WITHIN_TOLERANCE" })],
  });

  it("totals what waits, part by part, with the close count's tolerance", () => {
    const facts = approveCashFacts(closed);
    expect(facts).toEqual({
      sessionNo: "C01-261009-01",
      cashier: "RAVI K",
      handedPaise: 550000,
      parts: ["Close hand-over TDrp/12  5,000.00", "Drop TDrp/9  500.00"],
      tolerancePaise: 1000,
    });
    expect(partsLine(facts)).toBe("Close hand-over TDrp/12  5,000.00   ·   Drop TDrp/9  500.00");
    expect(partsLine({ ...facts, parts: facts.parts.slice(0, 1) })).toBe("");
    // No movements listed: the session's own total; no close variance: tolerance unknown.
    expect(approveCashFacts(session({ cashAwaiting: 120 }))).toMatchObject({ handedPaise: 12000, parts: [], tolerancePaise: -1 });
  });

  it("starts at the amount handed over: PIN and go", () => {
    const facts = approveCashFacts(closed);
    const form = initialApproveCashForm(facts);
    expect(form.received).toBe("5500.00");
    const state = approveCashState(facts, form);
    expect(state).toMatchObject({
      differs: false,
      differenceText: "matches",
      differenceTone: "success",
      showTreatment: false,
      showReason: false,
      hint: "The cash goes into the safe, signed with your PIN.",
      problem: "Type your till PIN.",
    });
    expect(approveCashBody(KEY, facts, { ...form, pin: "5678", note: "  " })).toEqual({ ...KEY, approverPin: "5678" });
  });

  it("books a difference within tolerance by itself", () => {
    const facts = approveCashFacts(closed);
    const form = { ...initialApproveCashForm(facts), received: "5490", pin: "5678", note: " all there " };
    const state = approveCashState(facts, form);
    expect(state).toMatchObject({
      differencePaise: -1000,
      differs: true,
      beyond: false,
      differenceText: "difference −10.00",
      differenceTone: "danger",
      showTreatment: false,
      hint: "Within the tolerance of 10.00: the difference is booked to Cash Short & Excess at once.",
      problem: "",
    });
    expect(approveCashBody(KEY, facts, form)).toEqual({ ...KEY, approverPin: "5678", receivedAmount: 5490, notes: "all there" });
  });

  it("beyond tolerance: send it on, or decide it with a reason", () => {
    const facts = approveCashFacts(closed);
    const base = { ...initialApproveCashForm(facts), received: "5600", pin: "5678" };
    const send = approveCashState(facts, base);
    expect(send).toMatchObject({
      beyond: true,
      differenceText: "difference +100.00",
      differenceTone: "warning",
      showTreatment: true,
      showReason: false,
      hint: "Another approver decides the difference (Approve on this session). The cash you received goes into the safe now.",
      problem: "",
    });
    expect(approveCashBody(KEY, facts, base)).toEqual({ ...KEY, approverPin: "5678", receivedAmount: 5600 });

    const deciding = { ...base, treatment: "RECOVER" as const };
    expect(approveCashState(facts, deciding)).toMatchObject({
      showReason: true,
      hint: "You decide it now: your approval limit must cover 100.00, or the server says so.",
      problem: "Pick the reason.",
    });
    expect(approveCashBody(KEY, facts, { ...deciding, reasonId: "v1" })).toEqual({
      ...KEY,
      approverPin: "5678",
      receivedAmount: 5600,
      treatment: "RECOVER",
      reasonId: "v1",
    });
  });

  it("with no known tolerance every difference is the supervisor's choice", () => {
    const facts = { ...approveCashFacts(closed), tolerancePaise: -1 };
    expect(approveCashState(facts, { ...initialApproveCashForm(facts), received: "5499.99" }).beyond).toBe(true);
  });

  it("waits for what was received", () => {
    const facts = approveCashFacts(closed);
    expect(approveCashState(facts, { ...initialApproveCashForm(facts), received: " " }).problem).toBe(
      "Type what you received.",
    );
  });

  it("offers the treatments and the live VARIANCE reasons", () => {
    expect(approveCashTreatments().map((o) => o.value)).toEqual(["", "EXPENSE", "RECOVER", "SUSPENSE"]);
    expect(approveCashTreatments()[0].label).toBe("Send to another approver");
    expect(approveCashReasons(REASONS)).toEqual([
      { value: "", label: "Pick a reason" },
      { value: "v1", label: "Counting error" },
    ]);
  });

  it("says how it went, outcome by outcome", () => {
    const result = (over: Partial<TillCashApprovalResult>) =>
      ({ received: 5490, difference: -10, treatment: null, varianceVoucherNo: null, outcome: "APPROVED", ...over }) as TillCashApprovalResult;
    expect(approveCashOutcome(result({ received: 5500, difference: 0 }))).toBe("5,500.00 approved into the safe.");
    expect(approveCashOutcome(result({ outcome: "WITHIN_TOLERANCE" }))).toBe(
      "5,490.00 approved into the safe. The difference −10.00 is within tolerance and booked to Cash Short & Excess.",
    );
    expect(approveCashOutcome(result({ outcome: "DECIDED", treatment: "RECOVER", varianceVoucherNo: "TVar/3" }))).toBe(
      "5,490.00 approved into the safe. The difference −10.00 is booked (RECOVER, voucher TVar/3).",
    );
    expect(approveCashOutcome(result({ outcome: "SENT_FOR_APPROVAL" }))).toBe(
      "5,490.00 approved into the safe. The difference −10.00 waits for another approver: they open this session and press Approve.",
    );
  });
});

// ─── Force close / Reopen ────────────────────────────────────────────────────

describe("Force close", () => {
  it("names the session it closes", () => {
    expect(sessionFacts(session({ tssStatus: "PENDING_APPROVAL" }))).toEqual({
      sessionNo: "C01-261009-01",
      cashier: "RAVI K",
      counter: "C01",
      status: "PENDING APPROVAL",
      z: "41",
    });
    expect(sessionFacts(session({ tssZNo: null })).z).toBe("");
  });

  it("asks for a FORCE_CLOSE reason, its note when needed, then the PIN", () => {
    expect(categoryReasons(REASONS, "FORCE_CLOSE").map((o) => o.value)).toEqual(["", "f1", "f2"]);
    expect(noteNeeded(REASONS, "f1")).toBe(true);
    expect(noteNeeded(REASONS, "f2")).toBe(false);
    expect(noteNeeded(REASONS, "")).toBe(false);
    expect(notePlaceholder(true)).toBe("required for this reason");
    expect(notePlaceholder(false)).toBe("optional");
    expect(forceCloseProblem(EMPTY_FORCE_CLOSE, false)).toBe("Pick the reason.");
    expect(forceCloseProblem({ reasonId: "f1", note: " ", pin: "" }, true)).toBe("This reason needs a note: what happened.");
    expect(forceCloseProblem({ reasonId: "f2", note: "", pin: "" }, false)).toBe("Type your till PIN: it signs the force close.");
    expect(forceCloseProblem({ reasonId: "f2", note: "", pin: "5678" }, false)).toBe("");
    expect(forceCloseHint(0)).toBe("An empty drawer counts as 0.00 — the whole expected cash becomes the difference.");
    expect(forceCloseHint(100)).toBe("Never the session's cashier. The FORCE_CLOSE rule needs a store manager or above.");
  });

  it("posts the count with the reason and PIN", () => {
    const lines = [{ tenderTypeId: 1, denominationId: "d500", qty: 2 }];
    expect(forceCloseBody(KEY, { reasonId: "f1", note: " left at 3 ", pin: "5678" }, lines)).toEqual({
      ...KEY,
      reasonId: "f1",
      approverPin: "5678",
      lines,
      notes: "left at 3",
    });
    expect(forceCloseBody(KEY, { reasonId: "f2", note: "", pin: "5678" }, [])).not.toHaveProperty("notes");
  });

  it("says what the server says, then what follows", () => {
    const closedResult = { outcome: "CLOSED", session: session({ tssZNo: 42 }) } as TillForceCloseResult;
    expect(forceCloseMessage(closedResult)).toBe(
      "Session C01-261009-01 force-closed — Z 42\n\nWithin tolerance the session is closed and its cash waits for " +
        "Approve Cash; beyond it the session waits for Approve.",
    );
    const sent = { outcome: "SENT_FOR_APPROVAL", session: session({ tssStatus: "PENDING_APPROVAL" }) } as TillForceCloseResult;
    expect(forceCloseMessage(sent).split("\n\n")[0]).toBe(
      "Session C01-261009-01: the count is out of tolerance and waits for a decision",
    );
  });
});

describe("Reopen", () => {
  it("asks for a REOPEN reason, its note when needed, then the PIN", () => {
    expect(categoryReasons(REASONS, "REOPEN").map((o) => o.value)).toEqual(["", "r1"]);
    expect(reopenProblem(EMPTY_REOPEN, false)).toBe("Pick the reason.");
    expect(reopenProblem({ reasonId: "r1", note: "", pin: "" }, true)).toBe("This reason needs a note: what was wrong.");
    expect(reopenProblem({ reasonId: "r1", note: "keyed 500 as 50", pin: "" }, true)).toBe(
      "Type your till PIN: it signs the reopen.",
    );
    expect(reopenBody(KEY, { reasonId: "r1", note: " keyed 500 as 50 ", pin: "5678" })).toEqual({
      ...KEY,
      reasonId: "r1",
      approverPin: "5678",
      notes: "keyed 500 as 50",
    });
    expect(REOPEN_HINT).toMatch(/^The hand-over is voided/);
  });

  it("says what the server says, then what follows", () => {
    const result = { tapId: "a", reversalVoucherIds: [], session: session({ tssStatus: "COUNTING", tssReopenCount: 2 }) } as TillSessionReopenResult;
    expect(reopenMessage(result)).toBe(
      "Session C01-261009-01 reopened (×2)\n\nCount / close (End Shift) closes it again; the Z number is kept.",
    );
  });
});

// ─── X read ──────────────────────────────────────────────────────────────────

describe("X read", () => {
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
      counted: null,
      variance: null,
      ...over,
    };
  }

  it("titles, describes and tabulates the read", () => {
    const local = new Date(2026, 9, 9, 14, 5);
    const opened = new Date(2026, 9, 9, 9, 0);
    const x = {
      ...session({ tssStatus: "OPEN" }),
      tssOpenedOn: opened.toISOString(),
      xNo: 3,
      xReadOn: local.toISOString(),
      tenders: [
        tender({}),
        tender({ tenderTypeId: 2, tenderTypeName: "CARD", tenderName: "HDFC EDC", closeMode: "SLIPS", expected: 1200, movedIn: null }),
        tender({ tenderTypeId: 1, tenderName: "Petty", expected: null }),
      ],
    } as TillXReport;
    const view = xReadView(x);
    expect(view.title).toBe("X 3 · C01-261009-01 · 02:05 PM");
    expect(view.sub).toBe("RAVI K · Counter 1 (C01) · opened 09:00 AM · status OPEN");
    expect(view.rows[0]).toMatchObject({
      tender: "CASH",
      mode: "DENOM",
      cells: ["2,000.00", "10,500.50", "0.00", "0.00", "0.00", "0.00", "0.00", "5,000.00", "7,500.50"],
    });
    expect(view.rows[1].cells[6]).toBe("—");
    expect(view.rows[2].cells[8]).toBe("—");
    expect(view.cash).toBe("7,500.50");
    expect(xReadView({ ...x, tenders: [tender({ expected: null })] }).cash).toBe("—");
    expect(X_NOTE).toBe("Journalled as X_REPORT. Print gives the 80 mm X read.");
  });
});

// ─── refusals ────────────────────────────────────────────────────────────────

describe("a dialog's refusal", () => {
  it("is the server's first error, a PIN one clearing the PIN", () => {
    const flat = {
      status: 403,
      data: {
        success: false,
        message: "Not allowed",
        errors: [{ field: "approverPin", code: "TILL_RECEIVER_PIN", message: "The till PIN is wrong" }],
      },
    };
    expect(dialogRefusal(flat, "x")).toMatchObject({ line: "The till PIN is wrong", pin: true });
    const nested = {
      status: 409,
      data: {
        statusCode: 409,
        message: { message: "Refused", errors: [{ field: "tssId", code: "TILL_CASH_ALREADY_APPROVED", message: "Already in the safe" }] },
      },
    };
    expect(dialogRefusal(nested, "x")).toMatchObject({ line: "Already in the safe", pin: false });
    expect(dialogRefusal({ status: 403, data: { errors: [{ code: "TILL_APPROVER_PIN" }], message: "PIN" } }, "x")).toMatchObject({
      line: "PIN",
      pin: true,
    });
    expect(dialogRefusal({ status: "FETCH_ERROR", error: "Failed to fetch" }, "fallback").line).toBe("Failed to fetch");
  });
});

// ─── a closed session's undecided cash gap (Qt 425fa80, notes 124) ───────────

describe("the cash gap a closed session left undecided (setClosedGap)", () => {
  it("is the first pending cash row outside the RECEIVE stage", () => {
    const card = variance({ tvrId: "card", tvrTenderTypeId: 2, tvrTenderId: "hdfc" });
    const receive = variance({ tvrId: "rcv", tvrStage: "RECEIVE" });
    const decided = variance({ tvrId: "done", tvrTreatment: "EXPENSE" });
    const cash = variance({ tvrId: "cash", tvrVariance: -42 });
    expect(closedCashGap(session({ variances: [card, receive, decided, cash] }))?.tvrId).toBe("cash");
    expect(closedCashGap(session({ variances: [card, receive, decided] }))).toBeNull();
    expect(closedCashGap(null)).toBeNull();
  });

  it("opens the decide dialog APPROVE only, on that gap, with its own hint", () => {
    const s = session({ variances: [variance({ tvrId: "card", tvrTenderTypeId: 2, tvrVariance: -5 }), variance({ tvrVariance: -42 })] });
    const request = closedGapDecideRequestOf(s, KEY);
    expect(request).toEqual({
      key: KEY,
      event: "CASH_VARIANCE",
      variancePaise: -4200,
      sessionNo: "C01-261009-01",
      cashier: "RAVI K",
      closedGap: true,
    });
    expect(approveOnly(request)).toBe(true);
    expect(approveOnly(bagDecideRequestOf(s, KEY))).toBe(true);
    expect(approveOnly(decideRequestOf(s, KEY))).toBe(false);
    expect(decideHint(request)).toBe(CLOSED_GAP_DECIDE_HINT);
    expect(decideHint(decideRequestOf(s, KEY))).toBe(DECIDE_HINT);
    expect(CLOSED_GAP_DECIDE_HINT).toBe(
      "This session closed with the difference undecided. Approve books it now — the cash was already handed over, " +
        "so there is no recount. SUSPENSE if it needs looking into first.",
    );
    expect(CLOSED_GAP_DECIDED_MESSAGE).toBe("Approved: the closed session's difference is booked.");
    // The body is today's decide-variance one: no tcmId.
    const form = { ...initialDecideForm("CASH_VARIANCE"), treatment: "SUSPENSE" as const, reasonId: "v1", note: "old gap" };
    expect(decideBody(request.key, form)).toEqual({
      ...KEY,
      decision: "APPROVE",
      treatment: "SUSPENSE",
      reasonId: "v1",
      note: "old gap",
    });
  });
});

describe("Cash to safe (the old Witness slot, notes 129 §1)", () => {
  const at = "2026-10-09T13:10:00.000Z";

  it("names who took the cash into the safe and when", () => {
    const facts = cockpitFacts(session({ receivedByName: "ANU", receivedOn: at }), new Date(at));
    expect(facts.cashToSafe).toMatch(/^ANU · \d{2}:\d{2} (AM|PM)$/);
    expect(facts.cashToSafeSelf).toBe(false);
  });

  it("flags the session's own cashier, amber", () => {
    const facts = cockpitFacts(session({ receivedByName: "RAVI K", receivedOn: at, receivedBySelf: true }), new Date(at));
    expect(facts.cashToSafe).toMatch(/^RAVI K · \d{2}:\d{2} (AM|PM) · own cashier$/);
    expect(facts.cashToSafeSelf).toBe(true);
  });

  it("is a dash while nobody has", () => {
    expect(cashToSafeText(session())).toBe("—");
    // A stray flag with no receiver is not amber.
    expect(cockpitFacts(session({ receivedBySelf: true }), new Date(at))).toMatchObject({ cashToSafe: "—", cashToSafeSelf: false });
    // No time: the name alone.
    expect(cashToSafeText(session({ receivedByName: "ANU", receivedOn: null }))).toBe("ANU");
  });
});
