import { describe, expect, it } from "vitest";
import type { TillOpenCheck, TillOpenCheckSession } from "@/features/sales/till/shared/wire/types";
import {
  OPEN_TILL_FIRST,
  openedAtText,
  parseAskedKeys,
  serializeAskedKeys,
  tillCheckKey,
  tillCheckOutcome,
} from "./till-session-check";

const ME = "019c-me";
// A local instant, so the expected text does not depend on the test machine's zone.
const OPENED = new Date(2026, 9, 12, 9, 5).toISOString();

function liveSession(over: Partial<TillOpenCheckSession> = {}): TillOpenCheckSession {
  return {
    sessionId: "tss",
    accYear: "2026-2027",
    sessionNo: "C01-261012-01",
    counterId: "c01",
    counterCode: "C01",
    operatorId: "019c-ravi",
    operatorName: "RAVI K",
    deviceId: "dev",
    deviceName: "COUNTER PC 2",
    openedOn: OPENED,
    status: "OPEN",
    ...over,
  };
}

function check(over: Partial<TillOpenCheck> = {}): TillOpenCheck {
  return {
    requireSession: true,
    deviceSession: null,
    userSessionElsewhere: null,
    ...over,
  } as TillOpenCheck;
}

const CAN = { canOpenTill: true, onOpenTill: false };

describe("the shell's till check", () => {
  it("is keyed by user and branch, once all three are known", () => {
    expect(tillCheckKey({ userId: "u", companyId: "co", branchId: "br" })).toBe("u|br");
    expect(tillCheckKey({ userId: "u", companyId: "co", branchId: null })).toBeNull();
    expect(tillCheckKey({ userId: "u", companyId: "", branchId: "br" })).toBeNull();
    expect(tillCheckKey({ userId: null, companyId: "co", branchId: "br" })).toBeNull();
  });

  it("does nothing on a device that takes no money", () => {
    expect(tillCheckOutcome(check({ requireSession: false }), ME, CAN)).toEqual({ kind: "none" });
    expect(tillCheckOutcome(null, ME, CAN)).toEqual({ kind: "none" });
  });

  it("says who holds this counter when it is someone else", () => {
    expect(tillCheckOutcome(check({ deviceSession: liveSession({ status: "SUSPENDED" }) }), ME, CAN)).toEqual({
      kind: "warn",
      text:
        "Counter C01 has RAVI K's session C01-261012-01 open (since 12/10 09:05 AM, SUSPENDED).\n\n" +
        "You cannot bill on this counter until RAVI K ends the shift, or a supervisor force-closes it.",
    });
  });

  it("says where the user's own session is still open", () => {
    expect(tillCheckOutcome(check({ userSessionElsewhere: liveSession({ operatorId: ME }) }), ME, CAN)).toEqual({
      kind: "warn",
      text:
        "Your session C01-261012-01 is still open on COUNTER PC 2 (since 12/10 09:05 AM).\n\n" +
        "End that shift there before you open one on this counter.",
    });
    const unnamed = tillCheckOutcome(check({ userSessionElsewhere: liveSession({ deviceName: null }) }), ME, CAN);
    expect(unnamed.kind === "warn" && unnamed.text).toMatch(/^Your session C01-261012-01 is still open on another device /);
  });

  it("opens Open Till otherwise — to resume the user's own session on this counter too", () => {
    expect(tillCheckOutcome(check(), ME, CAN)).toEqual({ kind: "open" });
    expect(tillCheckOutcome(check({ deviceSession: liveSession({ operatorId: "019C-ME" }) }), ME, CAN)).toEqual({
      kind: "open",
    });
    // Already there: it says the rest.
    expect(tillCheckOutcome(check(), ME, { canOpenTill: true, onOpenTill: true })).toEqual({ kind: "none" });
    // The menu does not carry it.
    expect(tillCheckOutcome(check(), ME, { canOpenTill: false, onOpenTill: false })).toEqual({
      kind: "info",
      text: OPEN_TILL_FIRST,
    });
    expect(OPEN_TILL_FIRST).toBe("This device takes money: open a till session first (Open Till Session, menu 272).");
  });

  it("reads the opening time as local dd/MM hh:mm AM", () => {
    expect(openedAtText(OPENED)).toBe("12/10 09:05 AM");
    expect(openedAtText(new Date(2026, 9, 12, 21, 40).toISOString())).toBe("12/10 09:40 PM");
    expect(openedAtText(new Date(2026, 9, 12, 0, 15).toISOString())).toBe("12/10 12:15 AM");
    expect(openedAtText("not a date")).toBe("");
    expect(openedAtText(null)).toBe("");
  });

  it("keeps the asked keys for the login that asked them", () => {
    const raw = serializeAskedKeys("sid-1", new Set(["u|a", "u|b"]));
    expect(parseAskedKeys(raw, "sid-1")).toEqual(["u|a", "u|b"]);
    expect(parseAskedKeys(raw, "sid-2")).toEqual([]);
    expect(parseAskedKeys(serializeAskedKeys(null, ["u|a"]), null)).toEqual(["u|a"]);
    expect(parseAskedKeys("{broken", "sid-1")).toEqual([]);
    expect(parseAskedKeys(null, "sid-1")).toEqual([]);
  });
});
