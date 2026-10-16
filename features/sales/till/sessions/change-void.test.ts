/**
 * Qt bec3f98 on the Session Cockpit: Change between counters (Qt
 * tests/till/change_void.cpp) and the cockpit's Change… / Void movement…
 * buttons on the Money documents tab (tests/till/live_void.cpp), plus the
 * plain-words refusal the exception dialogs now show (ec9d92d).
 */
import { describe, expect, it } from "vitest";
import { tillErrorOf } from "../shared/errors";
import { toReasons } from "../shared/reasons";
import type { GridRow, TillMovementFull, TillSessionKey, TillSessionPayload } from "../shared/wire/types";
import {
  CHANGE_HINT,
  EMPTY_CHANGE,
  changeBody,
  changeGridParams,
  changeMessage,
  changeParties,
  changeProblem,
  otherTillLabel,
  otherTillPlaceholder,
  otherTillsOf,
  pinCaptions,
  refusedChangePin,
  thisTillOf,
  tillName,
  type ChangeForm,
} from "./change";
import { changeButton, movementVoidRequestOf, voidMovementButton, voidableMovement } from "./cockpit";
import { categoryReasons, noteNeeded } from "./force-close";
import { dialogRefusal } from "./refusal";

const SUP = "22222222-2222-2222-2222-222222222222";
const RAVI = "11111111-1111-1111-1111-111111111111";
const KEY = { companyId: "co", branchId: "br", accYear: "2026-2027" };

const REASONS = toReasons([
  { trs_id: "p1", trs_category: "PICKUP", trs_name: "Cash over limit", trs_needs_note: false, trs_is_active: true, overridden: false },
  { trs_id: "p2", trs_category: "PICKUP", trs_name: "Security", trs_needs_note: true, trs_is_active: true, overridden: false },
  { trs_id: "p3", trs_category: "PICKUP", trs_name: "Old", trs_needs_note: false, trs_is_active: false, overridden: false },
  { trs_id: "f1", trs_category: "FORCE_CLOSE", trs_name: "Gone", trs_needs_note: false, trs_is_active: true, overridden: false },
  { trs_id: "v1", trs_category: "MOVEMENT_VOID", trs_name: "Duplicate", trs_needs_note: false, trs_is_active: true, overridden: false },
]);

function session(over: Partial<TillSessionPayload> = {}): TillSessionPayload {
  return {
    tssId: "aaaa",
    tssSessionNo: "ZT1-261015-05",
    operatorName: "RAVI",
    tssOperatorId: RAVI,
    counterCode: "ZT1",
    tssStatus: "OPEN",
    ...over,
  } as TillSessionPayload;
}

const OTHERS: GridRow[] = [
  { tss_id: "aaaa", tss_acc_year: "2026-2027", tss_session_no: "ZT1-261015-05", cashier: "RAVI", counter_code: "ZT1" },
  { tss_id: "bbbb", tss_acc_year: "2026-2027", tss_session_no: "ZT2-261015-01", cashier: "MEENA", counter_code: "ZT2" },
  { tss_id: "cccc", tss_acc_year: "2025-2026", tss_session_no: "OLD-1", cashier: "OLD", counter_code: "ZT9" },
];

const LINES = [{ tenderTypeId: 1, denominationId: "d500", qty: 2 }];

describe("Change between counters (change_void.cpp)", () => {
  const me = thisTillOf(session());
  const others = otherTillsOf(OTHERS, me.tssId, KEY.accYear);
  const state = (form: ChangeForm, caller = SUP, counted = 100000) => {
    const parties = changeParties(me, others, form, caller);
    return { parties, problem: changeProblem(parties, form, counted, noteNeeded(REASONS, form.reasonId)) };
  };

  it("lists the other live tills: this one and another year left out", () => {
    expect(others.map((t) => t.tssId)).toEqual(["bbbb"]);
    expect(otherTillLabel(others[0])).toBe("ZT2 · MEENA · ZT2-261015-01");
    expect(otherTillPlaceholder(null)).toBe("Loading tills…");
    expect(otherTillPlaceholder(others)).toBe("Pick the other till");
    // A till read twice (OPEN, then SUSPENDED) is listed once.
    expect(otherTillsOf([...OTHERS, OTHERS[1]], me.tssId, KEY.accYear)).toHaveLength(1);
  });

  it("reads grid 144 once per live status, every date", () => {
    expect(changeGridParams(KEY, "SUSPENDED")).toEqual({
      icompany_id: "co",
      ibranch_id: "br",
      ifrom_date: "",
      ito_date: "",
      istatus: "SUSPENDED",
      ivariance: "",
    });
  });

  it("offers the two active PICKUP reasons", () => {
    expect(categoryReasons(REASONS, "PICKUP").map((o) => o.value)).toEqual(["", "p1", "p2"]);
  });

  it("asks in Qt's order: the other till, the count, the reason, its note, then each cashier's PIN", () => {
    expect(state(EMPTY_CHANGE).problem).toBe("Pick the other till.");
    const picked = { ...EMPTY_CHANGE, otherId: "bbbb" };
    const { parties } = state(picked);
    // Default: this till TAKES, MEENA gives.
    expect(tillName(parties.giver)).toBe("ZT2 · MEENA");
    expect(tillName(parties.taker)).toBe("ZT1 · RAVI");
    expect(state(picked, SUP, 0).problem).toBe("Count the change that moves.");
    expect(state(picked).problem).toBe("Pick the reason.");
    const security = { ...picked, reasonId: "p2" };
    expect(state(security).problem).toBe("This reason needs a note.");
    const noted = { ...security, note: "two 500s for change" };
    expect(state(noted).problem).toBe("MEENA types their till PIN.");
    expect(pinCaptions(state(noted).parties)).toEqual({ from: "MEENA's PIN *", to: "RAVI's PIN *" });
    expect(state({ ...noted, fromPin: "1111" }).problem).toBe("RAVI types their till PIN.");
    expect(state({ ...noted, fromPin: "1111", toPin: "2222" }).problem).toBe("");
  });

  it("names the roles until the other till is picked", () => {
    expect(tillName(state(EMPTY_CHANGE).parties.giver)).toBe("—");
    expect(pinCaptions(state(EMPTY_CHANGE).parties)).toEqual({ from: "Giving cashier's PIN *", to: "RAVI's PIN *" });
  });

  it("posts from the other till to this one with both PINs, the reason, the note and the count", () => {
    const form = { ...EMPTY_CHANGE, otherId: "bbbb", reasonId: "p2", note: " two 500s for change ", fromPin: "1111", toPin: "2222" };
    expect(changeBody(KEY, state(form).parties, form, LINES)).toEqual({
      ...KEY,
      fromTssId: "bbbb",
      toTssId: "aaaa",
      lines: LINES,
      reasonId: "p2",
      fromWitnessPin: "1111",
      toWitnessPin: "2222",
      notes: "two 500s for change",
    });
  });

  it("gives: this till to the other, no note sent when there is none", () => {
    const form = { ...EMPTY_CHANGE, gives: true, otherId: "bbbb", reasonId: "p1", fromPin: "2222", toPin: "1111" };
    const { parties } = state(form);
    expect(tillName(parties.giver)).toBe("ZT1 · RAVI");
    expect(tillName(parties.taker)).toBe("ZT2 · MEENA");
    const body = changeBody(KEY, parties, form, LINES);
    expect([body.fromTssId, body.toTssId]).toEqual(["aaaa", "bbbb"]);
    expect(body).not.toHaveProperty("notes");
  });

  it("the taking cashier may carry it (no PIN of their own), the giving one never", () => {
    const gives = { ...EMPTY_CHANGE, gives: true, otherId: "bbbb", reasonId: "p1", fromPin: "1", toPin: "2" };
    expect(state(gives, RAVI).problem).toBe("You are the giving cashier: another person carries the change.");
    const takes = { ...EMPTY_CHANGE, otherId: "bbbb", reasonId: "p1", fromPin: "1111" };
    const carried = state(takes, RAVI.toUpperCase());
    expect(carried.parties.takerIsCaller).toBe(true);
    expect(carried.problem).toBe("");
    expect(changeBody(KEY, carried.parties, takes, LINES)).not.toHaveProperty("toWitnessPin");
  });

  it("says so when no other till is open", () => {
    const none = otherTillsOf([OTHERS[0]], me.tssId, KEY.accYear);
    expect(otherTillPlaceholder(none)).toBe("No other till is open");
    expect(changeProblem(changeParties(me, none, EMPTY_CHANGE, SUP), EMPTY_CHANGE, 100000, false)).toBe("Pick the other till.");
  });

  it("clears the PIN the server refused, and words its answer as the controller does", () => {
    expect(refusedChangePin("fromWitnessPin")).toBe("from");
    expect(refusedChangePin("toWitnessPin")).toBe("to");
    expect(refusedChangePin("lines")).toBeNull();
    const pinRefusal = {
      status: 403,
      data: { success: false, message: "Wrong PIN", errors: [{ field: "toWitnessPin", code: "TILL_WITNESS_PIN", message: "Wrong PIN" }] },
    };
    expect(refusedChangePin(tillErrorOf(pinRefusal).field)).toBe("to");
    expect(tillErrorOf(pinRefusal).refusal.plain?.title).toBe("Wrong PIN");
    const move = (over: Partial<TillMovementFull>): TillMovementFull => ({
      tcmId: "m",
      tcmAccYear: "2026-2027",
      tcmKind: "PICKUP",
      tcmDocNo: "TDrp/7",
      tcmAmount: 1000,
      tcmStatus: "POSTED",
      ...over,
    });
    expect(changeMessage({ from: move({}), to: move({ tcmKind: "TOP_UP", tcmDocNo: "TFlt/3" }) })).toBe("TDrp/7 → TFlt/3: 1000 carried");
    expect(CHANGE_HINT).toMatch(/through the safe/);
  });
});

describe("the cockpit's Change… and Void movement… (live_void.cpp)", () => {
  const scope: TillSessionKey = { ...KEY, tssId: "aaaa" };
  const money = (kind: string, status = "POSTED", over: GridRow = {}): GridRow => ({
    md_id: `id-${kind}`,
    md_doc: "tpi00031",
    md_kind: kind,
    md_amount: "150.00",
    md_status: status,
    ...over,
  });

  it("Change… is lit on an OPEN or SUSPENDED session only", () => {
    expect(changeButton(session({ tssStatus: "OPEN" })).enabled).toBe(true);
    expect(changeButton(session({ tssStatus: "SUSPENDED" })).enabled).toBe(true);
    const counting = changeButton(session({ tssStatus: "COUNTING" }));
    expect(counting).toEqual({ enabled: false, tip: "Only an open or suspended session takes or gives change" });
    expect(changeButton(null).enabled).toBe(false);
  });

  it("voids a posted hand-posted movement only — never the float, a voucher or a voided row", () => {
    expect(voidableMovement(money("FLOAT_ISSUE"))).toBeNull();
    expect(voidableMovement(money("CLOSE_HANDOVER"))).toBeNull();
    expect(voidableMovement(money("RECEIPT"))).toBeNull();
    expect(voidableMovement(money("PAID_IN", "VOIDED"))).toBeNull();
    for (const kind of ["DROP", "PAID_IN", "EXCHANGE", "PICKUP", "TOP_UP"]) {
      expect(voidableMovement(money(kind))).not.toBeNull();
    }
    expect(voidableMovement(null)).toBeNull();
  });

  it("Void movement… waits for a pick, and for a session still taking money", () => {
    const open = session({ tssStatus: "OPEN" });
    expect(voidMovementButton(open, null)).toEqual({
      enabled: false,
      tip: "Pick a drop, paid in, pickup or top-up on the Money documents tab",
    });
    expect(voidMovementButton(open, money("PAID_IN"))).toEqual({ enabled: true, tip: "Void tpi00031" });
    expect(voidMovementButton(session({ tssStatus: "COUNTING" }), money("DROP")).enabled).toBe(true);
    expect(voidMovementButton(session({ tssStatus: "CLOSED" }), money("DROP"))).toEqual({
      enabled: false,
      tip: "Only while the session still takes money",
    });
  });

  it("opens the void on grid 147's id with the cockpit's key", () => {
    expect(movementVoidRequestOf(money("PAID_IN", "POSTED", { md_id: "mmmm" }), scope)).toEqual({
      key: { ...KEY, tcmId: "mmmm" },
      docNo: "tpi00031",
      kind: "PAID_IN",
      amount: 150,
    });
  });
});

describe("the exception dialogs' refusal in plain words (ec9d92d)", () => {
  it("carries the plain words with the server's sentence for the grey line", () => {
    const refused = dialogRefusal(
      { status: 403, data: { success: false, message: "Refused", errors: [{ field: "approverPin", code: "TILL_APPROVER_PIN", message: "PIN wrong" }] } },
      "x",
    );
    expect(refused.pin).toBe(true);
    expect(refused.refusal.plain).toEqual({ title: "Wrong PIN", line: "PIN is empty or wrong.", todo: "Type again." });
    expect(refused.refusal.detail).toContain("TILL_APPROVER_PIN");
  });
});
