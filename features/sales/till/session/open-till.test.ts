import { describe, expect, it } from "vitest";
import { EMPTY_COUNT, toDenominations, withQty } from "../shared/denom";
import type { TillReason } from "../shared/reasons";
import type { TillOpenCheck, TillOpenCheckSession } from "../shared/wire/types";
import {
  carriedFromOf,
  chosenCounterId,
  counterDisplay,
  dayText,
  gaugeText,
  isCarried,
  livePanelOf,
  openBody,
  openFigures,
  openProblem,
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

  it("draws the gauge in quarters", () => {
    expect(gaugeText(2, "NORMAL")).toBe("●●○○");
    expect(gaugeText(4, "ALERT")).toBe("●●●●  pickup due");
    expect(gaugeText(null, "BLOCKED")).toBe("○○○○  billing blocked");
  });
});
