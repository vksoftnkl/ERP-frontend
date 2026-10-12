import { describe, expect, it } from "vitest";
import {
  addDaysIso,
  cockpitHref,
  ddmmyyyy,
  durationText,
  eventTone,
  flagOf,
  intOf,
  sortRowsBy,
  statusTone,
  textOf,
  todayIso,
} from "./format";

describe("row readers", () => {
  it("reads text, flags and counts the way the runner sends them", () => {
    const row = { a: "x", b: 2, c: null, f1: "t", f2: true, f3: "false", n: "12" };
    expect(textOf(row, "a")).toBe("x");
    expect(textOf(row, "b")).toBe("2");
    expect(textOf(row, "c")).toBe("");
    expect(flagOf(row, "f1")).toBe(true);
    expect(flagOf(row, "f2")).toBe(true);
    expect(flagOf(row, "f3")).toBe(false);
    expect(intOf(row, "n")).toBe(12);
    expect(intOf(row, "missing")).toBe(0);
  });

  it("puts rows back in time order, ties as they came", () => {
    const rows = [
      { id: "b", at: "2026-10-09T10:00:00Z" },
      { id: "a", at: "2026-10-09T09:00:00Z" },
      { id: "c", at: "2026-10-09T10:00:00Z" },
      { id: "d", at: "" },
    ];
    expect(sortRowsBy(rows, "at").map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("dates", () => {
  it("moves and writes dates", () => {
    expect(todayIso(new Date(2026, 9, 9))).toBe("2026-10-09");
    expect(addDaysIso("2026-10-09", -7)).toBe("2026-10-02");
    expect(addDaysIso("2026-03-01", -1)).toBe("2026-02-28");
    expect(ddmmyyyy("2026-10-09T00:00:00.000Z")).toBe("09-10-2026");
    expect(ddmmyyyy("")).toBe("");
  });

  it("measures a shift", () => {
    const now = new Date("2026-10-09T12:00:00Z");
    expect(durationText("2026-10-09T09:02:00Z", "2026-10-09T16:14:00Z", now)).toBe("7 h 12 m");
    expect(durationText("2026-10-09T11:30:00Z", null, now)).toBe("0 h 30 m");
    expect(durationText(null, null, now)).toBe("—");
  });
});

describe("routes and colours", () => {
  it("addresses the cockpit by the whole key", () => {
    expect(cockpitHref({ companyId: "c", branchId: "b", accYear: "2026-2027", tssId: "t 1" })).toBe(
      "/sales/till/sessions/c/b/2026-2027/t%201",
    );
  });

  it("colours the journal and the statuses as Qt does", () => {
    expect(eventTone("SESSION_OPEN")).toBe("green");
    expect(eventTone("no_sale")).toBe("amber");
    expect(eventTone("CASH_BLOCK")).toBe("red");
    expect(eventTone("RETENDER")).toBe("blue");
    expect(eventTone("SOMETHING_NEW")).toBe("grey");
    expect(statusTone("PENDING APPROVAL")).toBe("amber");
    expect(statusTone("CLOSED")).toBe("green");
    expect(statusTone("SUSPENDED")).toBe("grey");
  });
});
