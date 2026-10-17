import { describe, expect, it } from "vitest";
import type { ApprovalNeed } from "../shared/approval-gate";
import { EMPTY_COUNT, toDenominations, withQty } from "../shared/denom";
import type { TillReason } from "../shared/reasons";
import type { TillOpenCheck, TillOpenCheckSession } from "../shared/wire/types";
import {
  LIVE_DATE_UNKNOWN,
  WAIT_POLL_MS,
  carriedFromOf,
  chosenCounterId,
  counterDisplay,
  dayEndedText,
  dayText,
  floatApprovalRequest,
  forceCloseRequestOf,
  gaugeText,
  isCarried,
  isDeviceRefusal,
  liveDateOf,
  livePanelOf,
  openBody,
  openFigures,
  openProblem,
  resumePlan,
  waitPollDue,
  withApproval,
  type OpenTillInputs,
} from "./open-till";

const DENOMS = toDenominations([
  { tdnId: "d500", tdnLabel: "₹500", tdnKind: "NOTE", tdnValue: 500 },
  { tdnId: "d10", tdnLabel: "₹10", tdnKind: "COIN", tdnValue: 10 },
]);

const REASONS: TillReason[] = [
  {
    id: "r-miscount",
    category: "FLOAT_MISMATCH",
    code: "MISCOUNT",
    name: "Miscount at the safe",
    ledgerId: "",
    ledgerName: "",
    needsNote: false,
    needsRef: false,
    maxAmountPaise: 0,
    active: true,
    overridden: false,
  },
];

const CARRIED = { sessionId: "prev-1", accYear: "2026-2027", sessionNo: "C01-261008-02", floatLeft: 1500 };

function check(over: Partial<TillOpenCheck> = {}): TillOpenCheck {
  return {
    requireSession: true,
    businessDay: { dayId: "day", accYear: "2026-2027", date: "2026-10-09", status: "OPEN", autoOpen: false },
    linkedCounter: null,
    freeCounters: [
      { counterId: "c1", code: "C01", name: "Counter 1", defaultFloat: 2000, carriedFrom: CARRIED },
      { counterId: "c2", code: "C02", name: "Counter 2", defaultFloat: 1000, carriedFrom: null },
    ],
    busyCounters: [],
    deviceSession: null,
    userSessionElsewhere: null,
    carriedFrom: null,
    ...over,
  };
}

function inputs(over: Partial<OpenTillInputs> = {}, form: Partial<OpenTillInputs["form"]> = {}): OpenTillInputs {
  return {
    check: check(),
    checkError: "",
    denominations: DENOMS,
    reasons: REASONS,
    me: "u-me",
    ...over,
    form: { pickedCounterId: "c1", floatChoice: "ISSUED", issuedPaise: 200000, count: EMPTY_COUNT, reasonId: "", ...form },
  };
}

const live = (over: Partial<TillOpenCheckSession> = {}): TillOpenCheckSession => ({
  sessionId: "tss-1",
  accYear: "2026-2027",
  sessionNo: "C01-261009-01",
  counterId: "c1",
  counterCode: "C01",
  operatorId: "u-me",
  operatorName: "RAVI K",
  deviceId: "dev",
  deviceName: "VKPOS1",
  openedOn: "2026-10-09T03:32:00.000Z",
  status: "OPEN",
  ...over,
});

describe("the counter", () => {
  it("is the linked one, the one free one, or the one picked", () => {
    const linked = check({
      linkedCounter: { counterId: "L", code: "ZT1", name: "Zone", defaultFloat: 0, carriedFrom: null, liveSessionId: null, inactive: false },
      freeCounters: [],
    });
    expect(chosenCounterId(linked, "c2")).toBe("L");
    expect(counterDisplay(linked)).toEqual({ kind: "text", text: "ZT1 · Zone  (this device)" });
    expect(chosenCounterId(check({ freeCounters: [check().freeCounters[1]] }), "")).toBe("c2");
    expect(chosenCounterId(check(), "")).toBe("");
    expect(chosenCounterId(check(), "c2")).toBe("c2");
    expect(counterDisplay(check({ freeCounters: [] }))).toEqual({ kind: "text", text: "none free" });
  });

  it("carries the picked free counter's own float", () => {
    expect(carriedFromOf(check(), "c1")).toEqual(CARRIED);
    expect(carriedFromOf(check(), "c2")).toBeNull();
    expect(carriedFromOf(check({ carriedFrom: { ...CARRIED, sessionNo: "TOP" } }), "c2")?.sessionNo).toBe("TOP");
  });

  it("says what the day is", () => {
    expect(dayText(check())).toBe("OPEN");
    expect(dayText(check({ businessDay: { ...check().businessDay, status: null, autoOpen: true } }))).toBe(
      "opens with this session",
    );
    expect(dayText(check({ businessDay: { ...check().businessDay, status: null } }))).toBe("NOT OPEN");
  });
});

describe("the figures", () => {
  it("waits for the count before calling it a difference", () => {
    const figures = openFigures(inputs());
    expect(figures).toMatchObject({ issued: 200000, counted: 0, short: true, mismatch: false });
  });

  it("calls a short drawer short, with a true minus", () => {
    const figures = openFigures(inputs({}, { count: withQty(EMPTY_COUNT, "d500", 3) }));
    expect(figures.diff).toBe(-50000);
    expect(figures.mismatch).toBe(true);
    expect(figures.diffText).toBe("−500.00  short");
    expect(figures.diffTone).toBe("danger");
  });

  it("uses the carried figure when carried", () => {
    const i = inputs({}, { floatChoice: "CARRIED" });
    expect(isCarried(i)).toBe(true);
    expect(openFigures(i).issued).toBe(150000);
    // Nothing to carry on C02: the choice falls back to issued.
    expect(isCarried(inputs({}, { floatChoice: "CARRIED", pickedCounterId: "c2" }))).toBe(false);
  });
});

describe("why Open (Ctrl+Enter) refuses", () => {
  it("names each stop in Qt's words", () => {
    expect(openProblem(inputs({ check: null }))).toBe("Still asking the server about this device…");
    expect(openProblem(inputs({ check: null, checkError: "Not registered" }))).toBe("Not registered");
    expect(openProblem(inputs({ check: check({ requireSession: false }) }))).toBe("No till session is needed on this device.");
    expect(openProblem(inputs({ check: check({ deviceSession: live() }) }))).toBe(
      "This device already holds session C01-261009-01.",
    );
    expect(openProblem(inputs({ check: check({ businessDay: { ...check().businessDay, status: null } }) }))).toMatch(
      /Day Open first/,
    );
    expect(openProblem(inputs({ check: check({ businessDay: { ...check().businessDay, status: "CLOSING" } }) }))).toBe(
      "The business day is CLOSING — no session opens on it.",
    );
    expect(
      openProblem(
        inputs({
          check: check({
            freeCounters: [],
            busyCounters: [{ counterId: "c9", code: "C09", name: "x", session: live({ operatorName: "ANU" }) }],
          }),
        }),
      ),
    ).toBe("No free counter in this branch — in use: C09 (ANU).");
    expect(openProblem(inputs({}, { pickedCounterId: "" }))).toBe("Pick the counter you are opening.");
    expect(openProblem(inputs())).toBe("Count the drawer: every note and coin in it.");
    expect(openProblem(inputs({}, { count: withQty(EMPTY_COUNT, "d500", 3) }))).toBe(
      "The count differs from the float: pick a reason.",
    );
    expect(openProblem(inputs({}, { count: withQty(EMPTY_COUNT, "d500", 4) }))).toBe("");
  });
});

describe("the body Open (Ctrl+Enter) posts", () => {
  it("names the picked counter and the issued float", () => {
    const body = openBody(inputs({}, { count: withQty(EMPTY_COUNT, "d500", 4) }), { companyId: "co", branchId: "br" });
    expect(body).toEqual({
      companyId: "co",
      branchId: "br",
      counterId: "c1",
      floatMode: "ISSUED",
      floatIssued: 2000,
      lines: [{ tenderTypeId: 1, denominationId: "d500", qty: 4 }],
    });
  });

  it("carries with the previous session, and files a mismatch under its reason", () => {
    const body = openBody(
      inputs({}, { floatChoice: "CARRIED", count: withQty(EMPTY_COUNT, "d10", 100), reasonId: "r-miscount" }),
      { companyId: "co", branchId: "br" },
    );
    expect(body.floatMode).toBe("CARRIED");
    expect(body.prevSessionId).toBe("prev-1");
    expect(body.floatIssued).toBeUndefined();
    expect(body.reasonId).toBe("r-miscount");
    expect(body.notes).toBe("FLOAT_MISMATCH −500.00: Miscount at the safe");
  });

  it("leaves the counter out on a linked device", () => {
    const linked = check({
      linkedCounter: { counterId: "L", code: "ZT1", name: "Zone", defaultFloat: 0, carriedFrom: null, liveSessionId: null, inactive: false },
      freeCounters: [],
    });
    const body = openBody(inputs({ check: linked }, { issuedPaise: 0 }), { companyId: "co", branchId: "br" });
    expect(body.counterId).toBeUndefined();
    expect(body.floatIssued).toBe(0);
  });
});

describe("the approval gate (Qt 425fa80, notes 124 §5)", () => {
  const need = (over: Partial<ApprovalNeed> = {}): ApprovalNeed => ({
    event: "FLOAT_MISMATCH",
    amount: -500,
    requiredRole: "SUPERVISOR",
    channel: "COUNTER",
    twoPerson: false,
    srcDocType: "TILL_COUNTER",
    srcDocId: "c1",
    ...over,
  });
  // 2,000.00 issued, 1,500.00 counted: 500.00 short.
  const short = inputs({}, { count: withQty(EMPTY_COUNT, "d500", 3), reasonId: "r-miscount" });

  it("asks for a FLOAT_MISMATCH on the counter, of the gap's size, at the 428's level", () => {
    const state = floatApprovalRequest(need({ requiredRole: "STORE_MANAGER" }), short, { companyId: "co", branchId: "br" });
    expect(state).toEqual({
      ask: {
        companyId: "co",
        branchId: "br",
        event: "FLOAT_MISMATCH",
        amount: 500,
        srcDocType: "TILL_COUNTER",
        srcDocId: "c1",
      },
      requiredRole: "STORE_MANAGER",
    });
  });

  it("takes the screen's own difference when the 428 sends no amount", () => {
    const state = floatApprovalRequest(need({ amount: null }), short, { companyId: "co", branchId: "br" });
    expect(state.ask.amount).toBe(500);
  });

  it("names the linked counter on a linked device", () => {
    const linked = check({
      linkedCounter: { counterId: "L", code: "ZT1", name: "Zone", defaultFloat: 0, carriedFrom: null, liveSessionId: null, inactive: false },
      freeCounters: [],
    });
    const state = floatApprovalRequest(need(), inputs({ check: linked }), { companyId: "co", branchId: "br" });
    expect(state.ask.srcDocId).toBe("L");
  });

  it("opens again with the approval's id, the body otherwise the same", () => {
    const body = openBody(short, { companyId: "co", branchId: "br" });
    expect(withApproval(body, "tap-1")).toEqual({ ...body, approvalId: "tap-1" });
    expect(withApproval(body, undefined)).toBe(body);
    expect(withApproval(body, "")).toBe(body);
  });
});

describe("the live panel", () => {
  it("offers Resume to its own cashier on this device", () => {
    const panel = livePanelOf(check({ deviceSession: live() }), "u-me");
    expect(panel).toMatchObject({ resumable: true, showResume: true, endShiftLabel: "End shift", showSuspend: true });
    expect(panel?.text).toMatch(/still yours/);
  });

  it("turns End shift into Continue count while counting", () => {
    const panel = livePanelOf(check({ deviceSession: live({ status: "COUNTING" }) }), "u-me");
    expect(panel).toMatchObject({ resumable: false, endShiftEnabled: true, endShiftLabel: "Continue count", cashMovementEnabled: false });
  });

  it("tells another cashier the counter is held", () => {
    const panel = livePanelOf(check({ deviceSession: live({ operatorId: "u-other" }) }), "u-me");
    expect(panel?.showEndShift).toBe(false);
    expect(panel?.text).toBe("Counter C01 is in use by RAVI K. A supervisor must force-close it before a new session opens here.");
  });

  it("offers Force close on another cashier's session here, never on one's own (Qt 1d3e203)", () => {
    const other = livePanelOf(check({ deviceSession: live({ operatorId: "u-other" }) }), "u-me");
    expect(other).toMatchObject({ showForceClose: true, forceCloseEnabled: true });
    expect(other?.forceCloseTip).toBe("A supervisor closes RAVI K's session with their count and PIN (never the session's cashier)");
    const own = livePanelOf(check({ deviceSession: live() }), "u-me");
    expect(own).toMatchObject({ showForceClose: true, forceCloseEnabled: false, forceCloseTip: "Your own session: End shift counts and closes it" });
    expect(livePanelOf(check({ userSessionElsewhere: live({ operatorId: "u-other" }) }), "u-me")).toMatchObject({
      showForceClose: false,
      forceCloseEnabled: false,
    });
  });

  it("keys Force close by the device's session, renamed to the cockpit's fields", () => {
    expect(forceCloseRequestOf(check(), "co", "br")).toBeNull();
    expect(forceCloseRequestOf(check({ deviceSession: live({ operatorId: "u-other", status: "SUSPENDED" }) }), "co", "br")).toEqual({
      key: { companyId: "co", branchId: "br", accYear: "2026-2027", tssId: "tss-1" },
      session: { tssSessionNo: "C01-261009-01", operatorName: "RAVI K", counterCode: "C01", tssStatus: "SUSPENDED" },
    });
  });

  it("points at the cashier's session on another device", () => {
    const panel = livePanelOf(check({ userSessionElsewhere: live({ deviceName: null }) }), "u-me");
    expect(panel?.title).toBe("Your session on another device");
    expect(panel?.showResume).toBe(false);
    expect(panel?.text).toMatch(/open on another device/);
  });

  it("lists the supervisor's movements only on this cashier's own session here", () => {
    const sessionId = live().sessionId;
    expect(livePanelOf(check({ deviceSession: live() }), "u-me")?.supervisorMovesTssId).toBe(sessionId);
    expect(livePanelOf(check({ deviceSession: live({ status: "COUNTING" }) }), "u-me")?.supervisorMovesTssId).toBe(sessionId);
    expect(livePanelOf(check({ deviceSession: live({ operatorId: "u-other" }) }), "u-me")?.supervisorMovesTssId).toBeNull();
    expect(livePanelOf(check({ userSessionElsewhere: live() }), "u-me")?.supervisorMovesTssId).toBeNull();
  });

  it("reads the opening time on a 12-hour clock", () => {
    const panel = livePanelOf(check({ deviceSession: live({ openedOn: new Date(2026, 9, 9, 14, 5).toISOString() }) }), "u-me");
    expect(panel?.head).toBe("C01-261009-01  ·  RAVI K  ·  opened 02:05 PM  ·  OPEN");
  });

  it("says plainly when the session waits for its approver, and looks again", () => {
    const panel = livePanelOf(check({ deviceSession: live({ status: "PENDING_APPROVAL" }) }), "u-me");
    expect(panel).toMatchObject({ resumable: false, endShiftEnabled: false, waitsForApprover: true, textTone: "warning" });
    expect(panel?.text).toBe(
      "The count of session C01-261009-01 did not match, so it waits for a supervisor. It holds this drawer until " +
        "then — no new session opens here.\n\nAsk a supervisor to approve it (or send it for a recount) in Till " +
        "Sessions → Cockpit. This screen checks every 15 seconds: once decided, Continue count closes the session " +
        "and you can open a new one — no need to log out.",
    );
    // Not another cashier's, nor one on another device.
    expect(livePanelOf(check({ deviceSession: live({ status: "PENDING_APPROVAL", operatorId: "u-other" }) }), "u-me")).toMatchObject({
      waitsForApprover: false,
      textTone: "",
    });
    expect(livePanelOf(check({ userSessionElsewhere: live({ status: "PENDING_APPROVAL" }) }), "u-me")?.waitsForApprover).toBe(false);
    // Any other wait keeps the old words.
    const other = livePanelOf(check({ deviceSession: live({ status: "CLOSED" }) }), "u-me");
    expect(other).toMatchObject({ waitsForApprover: false, textTone: "" });
    expect(other?.text).toBe("The session is CLOSED: it waits for an approver, so it cannot take money again.");
    expect(livePanelOf(check({ deviceSession: live() }), "u-me")).toMatchObject({ waitsForApprover: false, textTone: "" });
  });

  it("looks again every 15 s only while visible, idle and undisturbed", () => {
    const waiting = livePanelOf(check({ deviceSession: live({ status: "PENDING_APPROVAL" }) }), "u-me");
    const idle = { visible: true, busy: false, dialogOpen: false };
    expect(WAIT_POLL_MS).toBe(15_000);
    expect(waitPollDue(waiting, idle)).toBe(true);
    expect(waitPollDue(waiting, { ...idle, visible: false })).toBe(false);
    expect(waitPollDue(waiting, { ...idle, busy: true })).toBe(false);
    expect(waitPollDue(waiting, { ...idle, dialogOpen: true })).toBe(false);
    expect(waitPollDue(livePanelOf(check({ deviceSession: live({ status: "COUNTING" }) }), "u-me"), idle)).toBe(false);
    expect(waitPollDue(null, idle)).toBe(false);
  });

  it("draws the gauge in quarters", () => {
    expect(gaugeText(2, "NORMAL")).toBe("●●○○");
    expect(gaugeText(4, "ALERT")).toBe("●●●●  pickup due");
    expect(gaugeText(null, "BLOCKED")).toBe("○○○○  billing blocked");
  });
});

describe("a session of an earlier business date", () => {
  const today = check({ deviceSession: live() }); // business date 2026-10-09
  const ENDED =
    "Session C01-261009-01 belongs to business date 08-10-2026 — today is 09-10-2026. It cannot take bills any " +
    "more.\n\nEnd shift: count the drawer and close it, then open a session for today.";

  it("reads the date off sessions/get", () => {
    expect(liveDateOf({ tssBusinessDate: "2026-10-08" })).toBe("2026-10-08");
    expect(liveDateOf({ tssBusinessDate: "2026-10-08T00:00:00.000Z" })).toBe("2026-10-08");
    expect(liveDateOf({ tssBusinessDate: "" })).toBe("");
    expect(liveDateOf(null)).toBe("");
  });

  it("says nothing while the date is today's, or not known", () => {
    expect(dayEndedText(today, "2026-10-09")).toBe("");
    expect(dayEndedText(today, "")).toBe("");
    expect(dayEndedText(today, LIVE_DATE_UNKNOWN)).toBe("");
    expect(dayEndedText(check({ deviceSession: live(), businessDay: { ...check().businessDay, date: "" } }), "2026-10-08")).toBe("");
  });

  it("says why it cannot bill, and what to do", () => {
    expect(dayEndedText(today, "2026-10-08")).toBe(ENDED);
  });

  it("takes over the live text while Resume is offered", () => {
    expect(livePanelOf(today, "u-me", "2026-10-08")).toMatchObject({ text: ENDED, textTone: "warning", resumable: true });
    expect(livePanelOf(today, "u-me", "2026-10-09")?.text).toMatch(/still yours/);
    // Not resumable: its own words stay.
    const counting = livePanelOf(check({ deviceSession: live({ status: "COUNTING" }) }), "u-me", "2026-10-08");
    expect(counting?.text).toMatch(/^Billing has ended/);
    expect(counting?.textTone).toBe("");
  });

  it("decides Resume: read the date first, refuse an ended day, else adopt or resume", () => {
    expect(resumePlan(today, "u-me", "")).toEqual({ kind: "readDate" });
    expect(resumePlan(today, "u-me", "2026-10-08")).toEqual({ kind: "dayEnded", text: ENDED });
    expect(resumePlan(today, "u-me", "2026-10-09")).toEqual({ kind: "adopt" });
    // Blank on the read: the server judges.
    expect(resumePlan(today, "u-me", LIVE_DATE_UNKNOWN)).toEqual({ kind: "adopt" });
    const suspended = check({ deviceSession: live({ status: "SUSPENDED" }) });
    expect(resumePlan(suspended, "u-me", "2026-10-09")).toEqual({ kind: "resume" });
    expect(resumePlan(suspended, "u-me", "2026-10-07").kind).toBe("dayEnded");
    // Nothing of this cashier's to resume here.
    expect(resumePlan(check({ deviceSession: live({ status: "COUNTING" }) }), "u-me", "")).toEqual({ kind: "none" });
    expect(resumePlan(check({ deviceSession: live({ operatorId: "u-other" }) }), "u-me", "")).toEqual({ kind: "none" });
    expect(resumePlan(check({ userSessionElsewhere: live() }), "u-me", "")).toEqual({ kind: "none" });
    expect(resumePlan(null, "u-me", "")).toEqual({ kind: "none" });
  });
});

describe("an open-check refusal", () => {
  it("keeps the three 'this PC cannot hold a till' answers on the screen", () => {
    expect(isDeviceRefusal("TILL_DEVICE_REQUIRED")).toBe(true);
    expect(isDeviceRefusal("TILL_DEVICE_UNKNOWN")).toBe(true);
    expect(isDeviceRefusal("TILL_DEVICE_BLOCKED")).toBe(true);
    expect(isDeviceRefusal("TILL_COUNTER_BUSY")).toBe(false);
    expect(isDeviceRefusal("")).toBe(false);
  });
});
