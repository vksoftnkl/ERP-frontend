import { describe, expect, it } from "vitest";

import { MINUS } from "./decimal";
import {
  blankHead,
  checkLines,
  dayHead,
  noDayHead,
  noDayReading,
  plural,
  readDay,
  type RowsState,
} from "./day-reading";
import type { GridRow, TillDay } from "./wire";

const CONTEXT = { companyName: "Acme Foods Pvt Ltd", cutoff: "04:00" };

const DAY: TillDay = {
  tbdId: "d1",
  tbdAccYear: "2026-2027",
  tbdCompanyId: "c1",
  tbdBranchId: "b1",
  tbdBusinessDate: "2026-10-07",
  tbdStatus: "CLOSING",
  tbdOpenedOn: new Date(2026, 9, 7, 8, 58).toISOString(),
  tbdOpenedBy: "u1",
  tbdClosedOn: null,
  tbdZNo: "",
  tbdReopenCount: 0,
  sessions: [
    { status: "CLOSED", count: 4 },
    { status: "PENDING_APPROVAL", count: 1 },
  ],
};

function session(overrides: GridRow): GridRow {
  return {
    tss_id: `s-${String(overrides.tss_session_no)}`,
    tss_company_id: "c1",
    tss_branch_id: "b1",
    tss_acc_year: "2026-2027",
    tss_status: "CLOSED",
    bills: "0",
    flags: "",
    cash_expected: null,
    cash_counted: null,
    cash_variance: null,
    net_sales: null,
    ...overrides,
  };
}

const ready = (rows: GridRow[]): RowsState => ({ status: "ready", rows });
const NO_SAFES = ready([]);

describe("the head", () => {
  it("reads an open day as Qt shows it", () => {
    const head = dayHead({ ...DAY, tbdStatus: "OPEN" }, CONTEXT);
    expect(head.title).toBe("Business Day  07-10-2026");
    expect(head.sub).toBe("Acme Foods Pvt Ltd · opened 08:58");
    expect(head.pill).toBe("OPEN");
    expect(head.pillTone).toBe("info");
    expect(head.facts).toEqual({
      status: "OPEN — sessions may open",
      opened: "08:58",
      sessions: "5 · 4 closed",
      storeZ: "issued on close",
      cutoff: "04:00",
      reopened: "0",
    });
  });

  it("tones CLOSING and CLOSED", () => {
    expect(dayHead(DAY, CONTEXT).pillTone).toBe("warning");
    expect(dayHead(DAY, CONTEXT).facts.status).toBe("CLOSING — no new session may open");
    const closed = dayHead({ ...DAY, tbdStatus: "CLOSED", tbdZNo: "12", tbdReopenCount: 1 }, CONTEXT);
    expect(closed.pillTone).toBe("success");
    expect(closed.facts.status).toBe("CLOSED");
    expect(closed.facts.storeZ).toBe("12");
    expect(closed.facts.reopened).toBe("1");
  });

  it("says when today is not opened yet", () => {
    const head = noDayHead("2026-10-10", { ...CONTEXT, cutoff: null });
    expect(head.title).toBe("Business Day  10-10-2026");
    expect(head.pill).toBe("NOT OPEN");
    expect(head.facts.status).toBe("NOT OPEN — no session yet");
    expect(head.facts.cutoff).toBe("till.day_cutoff");
    expect(head.sub).toContain("not opened yet — the first till session opens it (till.day_auto_open)");
  });

  it("keeps the placeholders before anything is read", () => {
    expect(blankHead(CONTEXT).title).toBe("Business Day");
    expect(blankHead(CONTEXT).facts.status).toBe("—");
  });
});

describe("readDay", () => {
  it("is READY when every session is closed and no safe is over", () => {
    const reading = readDay(
      ready([
        session({
          tss_session_no: "C04-261007-01",
          cashier: "MEENA T",
          bills: "188",
          cash_expected: "20000.00",
          cash_counted: "20000.00",
          cash_variance: "0.00",
          net_sales: "50000.50",
        }),
        session({
          tss_session_no: "C01-261007-02",
          cashier: "RAVI K",
          bills: "214",
          cash_expected: "30000.10",
          cash_counted: "29920.10",
          cash_variance: "-80.00",
          net_sales: "60000.20",
        }),
      ]),
      ready([{ tsf_code: "S1", balance: "100000.00", tsf_insured_limit: "150000.00" }]),
    );
    expect(reading.verdict.pill).toBe("READY");
    expect(reading.verdict.tone).toBe("success");
    expect(checkLines(reading.checks)).toEqual([
      "GREEN Sessions closed — All 2 sessions closed",
      "GREEN Approvals pending — None waiting",
      "GREEN Remittance — No safe over its insured limit",
      "LATER Drop bags verified · safe counted — The cash office (S9: bag verification, safe count) is not on the server yet",
      "LATER Server close-check — GET /till/days/close-check is not built — this list is the screen's own reading of the sessions",
    ]);
    const lines = Object.fromEntries(
      reading.numbers.flatMap((section) => section.lines.map((line) => [`${section.name}/${line.name}`, line])),
    );
    expect(lines["SALES/Bills"].value).toBe("402");
    expect(lines["SALES/Net sales (closed sessions)"].value).toBe("1,10,000.70");
    expect(lines["CASH IN TILLS/Expected (2 closed)"].value).toBe("50,000.10");
    expect(lines["CASH IN TILLS/Counted"].value).toBe("49,920.10");
    expect(lines["CASH IN TILLS/Variance"]).toEqual({ name: "Variance", value: `${MINUS}80.00`, tone: "danger" });
    expect(lines["SAFE · S1/Balance (movements + counts)"].value).toBe("1,00,000.00");
    expect(lines["SAFE · S1/Insured limit"].value).toBe("1,50,000.00");
    expect(lines["EXCEPTIONS/Pending approvals"]).toEqual({ name: "Pending approvals", value: "0", tone: "" });
  });

  it("is RED while a session still bills, with the cockpit of the first live one", () => {
    const reading = readDay(
      ready([
        session({ tss_session_no: "C01-261007-01", cashier: "RAVI K", tss_status: "OPEN", bills: "12" }),
        session({ tss_session_no: "C02-261007-01", cashier: "SURESH B", tss_status: "COUNTING" }),
        session({ tss_session_no: "C03-261007-01", cashier: "PRIYA M", tss_status: "PENDING_APPROVAL", tss_id: "s-p" }),
      ]),
      NO_SAFES,
    );
    const [sessions, approvals] = reading.checks;
    expect(sessions.tone).toBe("red");
    expect(sessions.detail).toBe(
      "2 sessions still billing or being counted: C01-261007-01 · RAVI K, C02-261007-01 · SURESH B (counting)",
    );
    expect(sessions.action?.session?.tssId).toBe("s-C01-261007-01");
    expect(approvals.tone).toBe("amber");
    expect(approvals.detail).toBe(
      "1 session wait for an approver: C03-261007-01 · PRIYA M — the approval gate is phase 3",
    );
    expect(approvals.action?.session?.tssId).toBe("s-p");
    expect(reading.verdict.pill).toBe("1 RED");
    expect(reading.verdict.tone).toBe("danger");
  });

  it("is AMBER when sessions are counted but not closed", () => {
    const reading = readDay(
      ready([session({ tss_session_no: "C02-261007-01", cashier: "SURESH B", tss_status: "COUNTING" })]),
      NO_SAFES,
    );
    expect(reading.checks[0].tone).toBe("amber");
    expect(reading.checks[0].detail).toBe("1 session counted but not closed: C02-261007-01 · SURESH B (counting)");
    expect(reading.verdict.pill).toBe("1 AMBER");
  });

  it("raises a remittance for a safe over its insured limit, with nothing to do it yet", () => {
    const reading = readDay(
      ready([]),
      ready([
        { tsf_code: "S1", balance: "208350.00", tsf_insured_limit: "150000.00" },
        { tsf_code: "S2", balance: "999999.00", tsf_insured_limit: null },
      ]),
    );
    const remittance = reading.checks.find((check) => check.title === "Remittance");
    expect(remittance?.tone).toBe("amber");
    expect(remittance?.detail).toBe("S1 2,08,350.00 over the insured 1,50,000.00 — raise a remittance");
    expect(remittance?.action).toEqual({ label: "Remit  →", session: null });
    expect(reading.checks[0].detail).toBe("No till session today");
    const safeS2 = reading.numbers.find((section) => section.name === "SAFE · S2");
    expect(safeS2?.lines[1].value).toBe("none");
  });

  it("counts recounts and force closes from the flags", () => {
    const reading = readDay(
      ready([
        session({ tss_session_no: "A", flags: "RECOUNT · FORCE CLOSED" }),
        session({ tss_session_no: "B", flags: "RECOUNT" }),
      ]),
      NO_SAFES,
    );
    const exceptions = reading.numbers.find((section) => section.name === "EXCEPTIONS");
    expect(exceptions?.lines.map((line) => [line.value, line.tone])).toEqual([
      ["0", ""],
      ["2", "warning"],
      ["1", "warning"],
    ]);
  });

  it("does not call the day READY before the sessions are read", () => {
    const loading = readDay({ status: "loading", rows: [] }, NO_SAFES);
    expect(loading.verdict.pill).toBe("…");
    expect(loading.numbers).toEqual([]);
    const failed = readDay({ status: "error", rows: [] }, NO_SAFES);
    expect(failed.verdict.pill).toBe("NOT READ");
    expect(failed.checks[0].tone).toBe("grey");
  });

  it("says when the safes could not be read instead of a false green", () => {
    const reading = readDay(ready([]), { status: "error", rows: [] });
    expect(reading.checks.find((check) => check.title === "Remittance")?.tone).toBe("grey");
  });
});

describe("no day", () => {
  it("has one info line and nothing to close", () => {
    const reading = noDayReading();
    expect(checkLines(reading.checks)).toEqual([
      "INFO Day not opened — The first till session of the day opens it (till.day_auto_open), or Day Open here.",
    ]);
    expect(reading.verdict).toEqual({
      pill: "NOT OPEN",
      tone: "",
      text: "Nothing to close: today's business day has not been opened yet.",
    });
  });
});

describe("plural", () => {
  it("reads Qt's %n session(s)", () => {
    expect(plural(1, "session")).toBe("1 session");
    expect(plural(3, "session")).toBe("3 sessions");
  });
});
