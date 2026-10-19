import { describe, expect, it } from "vitest";

import type { LiveSession } from "../../shared/live-cash";
import { MINUS } from "./decimal";
import {
  CASH_OFFICE_HREF,
  blankHead,
  cashOfficeHref,
  checkLines,
  daySafeSection,
  dayHead,
  foldGreenChecks,
  greenFoldLabel,
  noDayHead,
  noDayReading,
  plural,
  readDay,
  sessionKeysById,
  type Check,
  type RowsState,
} from "./day-reading";
import type { CloseCheckItem, DaySafe, GridRow, TillCloseCheck, TillDay } from "./wire";

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
  tbdClosedByName: "",
  tbdZNo: "",
  tbdReopenCount: 0,
  sessions: [
    { status: "CLOSED", count: 4 },
    { status: "PENDING_APPROVAL", count: 1 },
  ],
  handoverReceipt: "NONE",
  awaitingReceipt: { thisDay: 0, earlierDays: 0, oldestOn: null },
  safe: null,
};

/** Notes 118 — the day's safe, counted: 1,20,000.00 against 1,20,500.00. */
const COUNTED_SAFE: DaySafe = {
  opening: BigInt(9500000),
  expected: BigInt(12050000),
  counted: BigInt(12000000),
  remitted: BigInt(5000000),
};

const OPEN_DAY: TillDay = { ...DAY, tbdStatus: "OPEN", safe: COUNTED_SAFE };

const REMIT = { label: "Remit  →", session: null, href: "/sales/till/cash-office?tab=remit" };
const COUNT_SAFE = { label: "Count safe  →", session: null, href: "/sales/till/cash-office?tab=count" };

function item(code: string, tone: CloseCheckItem["tone"], detail: string, sessionIds: string[] = []): CloseCheckItem {
  return { code, tone, count: sessionIds.length, detail, sessionIds };
}

function serverCheck(items: CloseCheckItem[], over: Partial<TillCloseCheck> = {}): TillCloseCheck {
  return {
    tbdId: "d1",
    tbdAccYear: "2026-2027",
    tbdBusinessDate: "2026-10-07",
    tbdStatus: "OPEN",
    items,
    canClose: false,
    canCloseWithException: false,
    ...over,
  };
}

const ALL_GREEN = [
  item("SESSIONS_LIVE", "GREEN", "No session is open"),
  item("SESSIONS_PENDING_APPROVAL", "GREEN", "No session waits for a variance decision"),
  item("CASH_TO_APPROVE", "GREEN", "All cash handed over has been approved into the safe"),
  item("VARIANCE_UNDECIDED", "GREEN", "Every cash difference is decided"),
  item("MOVEMENTS_UNPOSTED", "GREEN", "Every movement and variance is posted"),
  item("SLIP_GAPS", "GREEN", "No slip gap is open"),
  item("HELD_BILLS", "GREEN", "No held bill is parked"),
  item("SAFE_OVER_INSURED", "GREEN", "No safe is over its insured limit"),
];

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

function live(tssId: string, over: Partial<LiveSession> = {}): LiveSession {
  return {
    key: { companyId: "c1", branchId: "b1", accYear: "2026-2027", tssId },
    sessionNo: tssId,
    counter: "C01",
    cashier: "RAVI K",
    status: "OPEN",
    businessDate: "",
    cashPaise: 745000,
    ...over,
  };
}

describe("the head", () => {
  it("reads an open day as Qt shows it", () => {
    const head = dayHead({ ...DAY, tbdStatus: "OPEN" }, CONTEXT);
    expect(head.title).toBe("Business Day  07-10-2026");
    expect(head.sub).toBe("Acme Foods Pvt Ltd · opened 08:58 AM");
    expect(head.pill).toBe("OPEN");
    expect(head.pillTone).toBe("info");
    expect(head.facts).toEqual({
      status: "OPEN — sessions may open",
      opened: "08:58 AM",
      sessions: "5 · 4 closed",
      storeZ: "issued on close",
      cutoff: "04:00 AM",
      reopened: "0",
    });
  });

  it("says who closed a CLOSED day and when", () => {
    const closed = dayHead(
      { ...DAY, tbdStatus: "CLOSED", tbdClosedOn: new Date(2026, 9, 7, 22, 42).toISOString(), tbdClosedByName: "MEENA T" },
      CONTEXT,
    );
    expect(closed.facts.status).toBe("CLOSED 10:42 PM by MEENA T");
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
    expect(blankHead(CONTEXT).sub).toBe("Acme Foods Pvt Ltd");
  });

  it("names another store than the header's after the company (Cash Position's drill, Qt 3b5069d)", () => {
    const scoped = { ...CONTEXT, branchName: "Zone store" };
    expect(dayHead({ ...DAY, tbdStatus: "OPEN" }, scoped).sub).toBe("Acme Foods Pvt Ltd · Zone store · opened 08:58 AM");
    expect(noDayHead("2026-10-10", scoped).sub).toMatch(/^Acme Foods Pvt Ltd · Zone store · not opened yet/);
    expect(blankHead(scoped).sub).toBe("Acme Foods Pvt Ltd · Zone store");
    expect(blankHead({ ...CONTEXT, branchName: "" }).sub).toBe("Acme Foods Pvt Ltd");
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
    expect(reading.verdict.text).toBe(
      "Nothing waits by the screen's own reading — the server's check could not be read, so F10 waits for it.",
    );
    expect(checkLines(reading.checks)).toEqual([
      "GREEN Sessions closed — All 2 sessions closed",
      "GREEN Approvals pending — None waiting",
      "GREEN Remittance — No safe over its insured limit",
      "LATER Cash to approve — Hand-over receipt is off (till.handover_receipt = NONE): hand-overs go straight to the safe",
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
    expect(approvals.detail).toBe("1 session wait for an approver: C03-261007-01 · PRIYA M");
    expect(approvals.action?.session?.tssId).toBe("s-p");
    expect(reading.verdict.pill).toBe("1 RED");
    expect(reading.verdict.tone).toBe("danger");
    expect(reading.verdict.text).toBe("Blocks the day close: Sessions closed. Clear each from its row above.");
  });

  it("is AMBER when sessions are counted but not closed", () => {
    const reading = readDay(
      ready([session({ tss_session_no: "C02-261007-01", cashier: "SURESH B", tss_status: "COUNTING" })]),
      NO_SAFES,
    );
    expect(reading.checks[0].tone).toBe("amber");
    expect(reading.checks[0].detail).toBe("1 session counted but not closed: C02-261007-01 · SURESH B (counting)");
    expect(reading.verdict.pill).toBe("1 AMBER");
    expect(reading.verdict.text).toBe(
      "No red item by the screen's own reading — the server's check could not be read, so F10 waits for it.",
    );
  });

  it("raises a remittance for a safe over its insured limit, on the Cash Office's Remit tab", () => {
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
    expect(remittance?.action).toEqual(REMIT);
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

  it("is RED for a drawer still out from an earlier day, with its cockpit", () => {
    const today = session({ tss_session_no: "C01-261007-01", cashier: "RAVI K", tss_status: "OPEN" });
    const reading = readDay(ready([today]), NO_SAFES, [
      live("s-C01-261007-01"),
      live("y1", {
        sessionNo: "C02-261006-01",
        cashier: "MEENA T",
        status: "SUSPENDED",
        key: { companyId: "c1", branchId: "b1", accYear: "2025-2026", tssId: "y1" },
      }),
      live("y2", { sessionNo: "C03-261005-01", cashier: "SURESH B", status: "COUNTING", cashPaise: null }),
    ]);
    expect(checkLines(reading.checks)).toEqual([
      "RED Sessions closed — 1 session still billing or being counted: C01-261007-01 · RAVI K",
      "GREEN Approvals pending — None waiting",
      "GREEN Remittance — No safe over its insured limit",
      "LATER Cash to approve — Hand-over receipt is off (till.handover_receipt = NONE): hand-overs go straight to the safe",
      "RED Drawers still out from an earlier day — 2 sessions opened before this day and not closed: " +
        "C02-261006-01 · MEENA T · ₹ 7,450.00, C03-261005-01 · SURESH B · cash hidden",
    ]);
    expect(reading.checks[4].action).toEqual({
      label: "Open cockpit  →",
      session: { companyId: "c1", branchId: "b1", accYear: "2025-2026", tssId: "y1" },
    });
    expect(reading.verdict.pill).toBe("2 RED");
    expect(reading.verdict.text).toBe(
      "Blocks the day close: Sessions closed, Drawers still out from an earlier day. Clear each from its row above.",
    );
  });

  it("looking back at an older day, flags only drawers opened before it (Qt bec3f98)", () => {
    const titles = (businessDate: string) =>
      readDay(ready([]), NO_SAFES, [live("x", { businessDate })], "2026-10-07").checks.map((check) => check.title);
    expect(titles("2026-10-06")).toContain("Drawers still out from an earlier day");
    // On or after the day shown: not that day's business (today's live till on 13-10's page).
    expect(titles("2026-10-07")).not.toContain("Drawers still out from an earlier day");
    expect(titles("2026-10-14")).not.toContain("Drawers still out from an earlier day");
    // A date it cannot read stays flagged, as Qt flags every live drawer off the day's list.
    expect(titles("")).toContain("Drawers still out from an earlier day");
  });

  it("puts the live cash first under CASH IN TILLS, only while a drawer is out", () => {
    const cashInTills = (liveSessions: LiveSession[] | null) =>
      readDay(ready([]), NO_SAFES, liveSessions).numbers.find((section) => section.name === "CASH IN TILLS")?.lines;
    expect(cashInTills([live("a"), live("b", { cashPaise: null }), live("c", { cashPaise: 12345650 })])?.[0]).toEqual({
      name: "Live now (3 sessions, any day)",
      value: "1,30,906.50",
      tone: "info",
    });
    expect(cashInTills([])?.[0].name).toBe("Expected (0 closed)");
    expect(cashInTills(null)?.[0].name).toBe("Expected (0 closed)");
  });

  it("adds no drawer check before the live read answers, or when every live one is the day's", () => {
    const today = session({ tss_session_no: "A", tss_status: "CLOSED" });
    for (const liveSessions of [null, [], [live("s-A")]]) {
      const titles = readDay(ready([today]), NO_SAFES, liveSessions).checks.map((check) => check.title);
      expect(titles).not.toContain("Drawers still out from an earlier day");
    }
  });

  it("says when the safes could not be read instead of a false green", () => {
    const reading = readDay(ready([]), { status: "error", rows: [] });
    expect(reading.checks.find((check) => check.title === "Remittance")?.tone).toBe("grey");
  });

  it("says on a grey row why the server's close-check is not behind the list", () => {
    const reading = readDay(ready([]), NO_SAFES, null, "2026-10-07", {
      day: OPEN_DAY,
      check: null,
      checkError: "This user may not check the business day",
    });
    expect(checkLines(reading.checks)).toContain(
      "LATER Server close-check — Could not be read (This user may not check the business day) — " +
        "this list is the screen's own reading of the sessions",
    );
  });
});

describe("cash to approve (the screen's own reading)", () => {
  const NOW = new Date(2026, 9, 15, 18, 0);
  const required = (awaiting: TillDay["awaitingReceipt"]): TillDay => ({
    ...OPEN_DAY,
    handoverReceipt: "REQUIRED",
    awaitingReceipt: awaiting,
  });
  const cashCheck = (day: TillDay, rows: GridRow[] = []) =>
    readDay(ready(rows), NO_SAFES, null, "2026-10-07", { day, now: NOW }).checks.find(
      (check) => check.title === "Cash to approve",
    );

  it("is green when nothing waits", () => {
    expect(cashCheck(required({ thisDay: 0, earlierDays: 0, oldestOn: null }))).toEqual({
      tone: "green",
      title: "Cash to approve",
      detail: "Every closed session's cash is approved into the safe",
    });
  });

  it("is red with today's and earlier counts, the oldest as a clock when it is today", () => {
    const check = cashCheck(
      required({ thisDay: 2, earlierDays: 1, oldestOn: new Date(2026, 9, 15, 9, 5).toISOString() }),
    );
    expect(check?.tone).toBe("red");
    expect(check?.detail).toBe(
      "3 hand-overs / drops not yet approved by a supervisor: 2 today · 1 from earlier days · oldest 09:05 AM",
    );
    // Not on this day's list: Till Sessions finds it.
    expect(check?.action).toEqual({ label: "Till Sessions  →", session: null, href: "/sales/till/sessions" });
  });

  it("dates an oldest one from an earlier day, and opens the newest listed row TO APPROVE", () => {
    const check = cashCheck(
      required({ thisDay: 1, earlierDays: 0, oldestOn: new Date(2026, 9, 14, 18, 17).toISOString() }),
      [
        session({ tss_session_no: "A", cash_receipt: "TO APPROVE", tss_id: "s-a" }),
        session({ tss_session_no: "B", cash_receipt: "APPROVED" }),
        session({ tss_session_no: "C", cash_receipt: "TO APPROVE", tss_id: "s-c" }),
      ],
    );
    expect(check?.detail).toBe("1 hand-over / drop not yet approved by a supervisor: 1 today · oldest 14-10 06:17 PM");
    expect(check?.action?.session?.tssId).toBe("s-c");
  });
});

describe("with the server's close-check", () => {
  const rows = [session({ tss_session_no: "C01-261007-01", cashier: "RAVI K", tss_status: "OPEN", tss_id: "s1" })];

  it("lists the server's items under the screen's titles, with their jumps", () => {
    const check = serverCheck(
      [
        item("SESSIONS_LIVE", "RED", "1 session(s) still open or being counted: C01-261007-01", ["s1"]),
        item("SESSIONS_PENDING_APPROVAL", "GREEN", "No session waits for a variance decision"),
        item("CASH_TO_APPROVE", "RED", "1 hand-over not approved", ["s-elsewhere"]),
        item("VARIANCE_UNDECIDED", "GREEN", "Every cash difference is decided"),
        item("MOVEMENTS_UNPOSTED", "GREEN", "Every movement and variance is posted"),
        item("SLIP_GAPS", "AMBER", "1 slip gap open"),
        item("HELD_BILLS", "GREEN", "No held bill is parked"),
        item("SAFE_OVER_INSURED", "AMBER", "S1 over its insured limit"),
        item("SOMETHING_NEW", "AMBER", "A code the screen does not know"),
      ],
      { canCloseWithException: false },
    );
    const reading = readDay(ready(rows), NO_SAFES, null, "2026-10-07", { day: OPEN_DAY, check });
    expect(checkLines(reading.checks)).toEqual([
      "RED Sessions closed — 1 session(s) still open or being counted: C01-261007-01",
      "GREEN Approvals pending — No session waits for a variance decision",
      "RED Cash to approve — 1 hand-over not approved",
      "GREEN Cash differences decided — Every cash difference is decided",
      "GREEN Everything posted — Every movement and variance is posted",
      "AMBER Slip gaps — 1 slip gap open",
      "GREEN Held bills — No held bill is parked",
      "AMBER Remittance — S1 over its insured limit — raise a remittance",
      "AMBER SOMETHING_NEW — A code the screen does not know",
      // No SAFE_NOT_COUNTED on the check: the day's own safe says it was counted.
      "GREEN Safe counted — Counted 1,20,000.00 today (should hold 1,20,500.00)",
    ]);
    // The day's own row …
    expect(reading.checks[0].action).toEqual({
      label: "Open cockpit  →",
      session: { companyId: "c1", branchId: "b1", accYear: "2026-2027", tssId: "s1" },
    });
    // … or a key made from the day for one not on its list.
    expect(reading.checks[2].action?.session).toEqual({
      companyId: "c1",
      branchId: "b1",
      accYear: "2026-2027",
      tssId: "s-elsewhere",
    });
    expect(reading.checks[7].action).toEqual(REMIT);
    expect(reading.checks[5].action).toBeUndefined();
    expect(reading.checks[9].action).toBeUndefined();
    expect(reading.verdict).toEqual({
      pill: "2 RED",
      tone: "danger",
      text: "Blocks the day close: Sessions closed, Cash to approve. Clear each from its row above.",
    });
  });

  it("says Close with exception when only live sessions block", () => {
    const check = serverCheck(
      [item("SESSIONS_LIVE", "RED", "1 session(s) still open", ["s1"]), ...ALL_GREEN.slice(1)],
      { canCloseWithException: true },
    );
    const reading = readDay(ready(rows), NO_SAFES, null, "2026-10-07", { day: OPEN_DAY, check });
    expect(reading.verdict.text).toBe(
      "Only sessions still open block the close. Close them from the cockpit, or Close with exception: " +
        "count their drawers there and a store manager approves.",
    );
  });

  it("makes a drawer from an earlier day amber beside the server's check", () => {
    const check = serverCheck(ALL_GREEN, { canClose: true });
    const reading = readDay(ready([]), NO_SAFES, [live("y1", { sessionNo: "C02-261006-01" })], "2026-10-07", {
      day: OPEN_DAY,
      check,
    });
    const older = reading.checks.find((entry) => entry.title === "Drawers still out from an earlier day");
    expect(older?.tone).toBe("amber");
    expect(reading.checks.map((entry) => entry.title)).not.toContain("Server close-check");
    expect(reading.verdict).toEqual({
      pill: "1 AMBER",
      tone: "warning",
      text: "No red item: F10 closes the day. Look at what is amber first — it is not checked again.",
    });
  });

  it("is READY for F10 when every item is green", () => {
    const reading = readDay(ready([]), NO_SAFES, [], "2026-10-07", {
      day: OPEN_DAY,
      check: serverCheck(ALL_GREEN, { canClose: true }),
    });
    expect(reading.verdict).toEqual({
      pill: "READY",
      tone: "success",
      text: "Every session is closed and nothing waits: F10 closes the day.",
    });
  });

  it("ignores a check read for another day", () => {
    const reading = readDay(ready([]), NO_SAFES, [], "2026-10-07", {
      day: OPEN_DAY,
      check: serverCheck(ALL_GREEN, { tbdId: "another-day", canClose: true }),
    });
    expect(reading.checks[0].detail).toBe("No till session today");
    expect(reading.verdict.text).toContain("the server's check could not be read");
  });

  it("shows the server's list while the day's sessions are still being read", () => {
    const reading = readDay({ status: "loading", rows: [] }, NO_SAFES, [live("y1")], "2026-10-07", {
      day: OPEN_DAY,
      check: serverCheck(ALL_GREEN, { canClose: true }),
    });
    expect(reading.checks).toHaveLength(ALL_GREEN.length + 1);
    expect(reading.numbers).toEqual([]);
    expect(reading.verdict.pill).toBe("READY");
  });

  it("names a session by id from the day's list, else from the day", () => {
    expect(sessionKeysById("s1", rows, OPEN_DAY)?.accYear).toBe("2026-2027");
    expect(sessionKeysById("zz", [], OPEN_DAY)).toEqual({
      companyId: "c1",
      branchId: "b1",
      accYear: "2026-2027",
      tssId: "zz",
    });
    expect(sessionKeysById("zz", [], null)).toBeNull();
  });
});

describe("a closed day", () => {
  it("says who closed it and how to reopen it, whatever the checklist", () => {
    const closed: TillDay = {
      ...DAY,
      tbdStatus: "CLOSED",
      tbdClosedOn: new Date(2026, 9, 7, 23, 5).toISOString(),
      tbdClosedByName: "ANITA S",
      tbdZNo: "14",
    };
    const reading = readDay(ready([]), NO_SAFES, [], "2026-10-07", {
      day: closed,
      check: serverCheck([item("SESSIONS_LIVE", "RED", "late")], { tbdStatus: "CLOSED" }),
    });
    expect(reading.verdict).toEqual({
      pill: "CLOSED",
      tone: "success",
      text: "Closed 11:05 PM by ANITA S — store Z 14. Reopen day opens it again (an area manager's PIN).",
    });
    // Even before the sessions are read.
    expect(readDay({ status: "loading", rows: [] }, NO_SAFES, null, "", { day: closed }).verdict.pill).toBe("CLOSED");
  });
});

describe("the safe (notes 118)", () => {
  const titled = (title: string, reading: ReturnType<typeof readDay>) =>
    reading.checks.filter((check) => check.title === title);

  it("opens the Cash Office on its tab", () => {
    expect(CASH_OFFICE_HREF).toBe("/sales/till/cash-office");
    expect(cashOfficeHref("count")).toBe("/sales/till/cash-office?tab=count");
    expect(cashOfficeHref("remit")).toBe("/sales/till/cash-office?tab=remit");
  });

  it("takes the server's SAFE_NOT_COUNTED as the Safe counted row, with Count safe while it is not green", () => {
    const red = serverCheck([...ALL_GREEN, item("SAFE_NOT_COUNTED", "RED", "Not counted today: MAIN SAFE")], {
      canCloseWithException: true,
    });
    const reading = readDay(ready([]), NO_SAFES, [], "2026-10-07", { day: OPEN_DAY, check: red });
    const rows = titled("Safe counted", reading);
    expect(rows).toEqual([
      { tone: "red", title: "Safe counted", detail: "Not counted today: MAIN SAFE", action: COUNT_SAFE },
    ]);
    // Only the safe blocks: the verdict says so, not "sessions still open".
    expect(reading.verdict).toEqual({
      pill: "1 RED",
      tone: "danger",
      text:
        "Only the safe count blocks the close. Count the safe on the Cash Office, or Close with exception: " +
        "a store manager approves.",
    });

    const amber = serverCheck([
      ...ALL_GREEN,
      item("SAFE_NOT_COUNTED", "AMBER", "Not counted today: MAIN SAFE (till.day_close_safe_count is off)"),
    ]);
    expect(
      titled("Safe counted", readDay(ready([]), NO_SAFES, [], "2026-10-07", { day: OPEN_DAY, check: amber }))[0].action,
    ).toEqual(COUNT_SAFE);

    // GREEN from the server: its row, no jump — and not the day's own row beside it.
    const green = serverCheck([
      ...ALL_GREEN,
      item("SAFE_NOT_COUNTED", "GREEN", "Every safe holding cash has been counted"),
    ]);
    expect(
      titled(
        "Safe counted",
        readDay(ready([]), NO_SAFES, [], "2026-10-07", { day: { ...OPEN_DAY, safe: null }, check: green }),
      ),
    ).toEqual([{ tone: "green", title: "Safe counted", detail: "Every safe holding cash has been counted" }]);
  });

  it("names both covered reds when sessions are live and the safe is not counted", () => {
    const check = serverCheck(
      [
        item("SESSIONS_LIVE", "RED", "1 session(s) still open", ["s1"]),
        ...ALL_GREEN.slice(1),
        item("SAFE_NOT_COUNTED", "RED", "x"),
      ],
      { canCloseWithException: true },
    );
    expect(readDay(ready([]), NO_SAFES, [], "2026-10-07", { day: OPEN_DAY, check }).verdict.text).toBe(
      "Only sessions still open and the safe count block the close. Close them from the cockpit and count the " +
        "safe, or Close with exception: count their drawers there and a store manager approves.",
    );
  });

  it("reads the day's own safe when the check does not speak for it", () => {
    const notCounted: TillDay = { ...OPEN_DAY, safe: { ...COUNTED_SAFE, counted: null } };
    const check = serverCheck(ALL_GREEN, { canClose: true });
    const reading = readDay(ready([]), NO_SAFES, [], "2026-10-07", { day: notCounted, check });
    expect(titled("Safe counted", reading)).toEqual([
      {
        tone: "amber",
        title: "Safe counted",
        detail: "Not counted today (not needed to close the day)",
        action: COUNT_SAFE,
      },
    ]);
    expect(reading.verdict.pill).toBe("1 AMBER");
    // A server that sends no safe block reads as not counted, as Qt reads it.
    expect(titled("Safe counted", readDay(ready([]), NO_SAFES, [], "", { day: DAY }))[0].tone).toBe("amber");
    // No day, no safe row.
    expect(titled("Safe counted", readDay(ready([]), NO_SAFES))).toEqual([]);
  });

  it("shows SAFE · TODAY from the day's figures, Opening only once it is closed", () => {
    expect(daySafeSection(OPEN_DAY)).toEqual({
      name: "SAFE · TODAY",
      lines: [
        { name: "Should hold", value: "1,20,500.00", tone: "" },
        { name: "Counted", value: "1,20,000.00", tone: "" },
        { name: "Sent to bank", value: "50,000.00", tone: "" },
      ],
    });
    const closed = daySafeSection({ ...OPEN_DAY, tbdStatus: "CLOSED", safe: { ...COUNTED_SAFE, counted: null } });
    expect(closed?.lines.map((line) => [line.name, line.value])).toEqual([
      ["Opening", "95,000.00"],
      ["Should hold", "1,20,500.00"],
      ["Counted", "not yet"],
      ["Sent to bank", "50,000.00"],
    ]);
    expect(daySafeSection(DAY)).toBeNull();
    expect(daySafeSection(null)).toBeNull();
  });

  it("puts SAFE · TODAY after the safes and before EXCEPTIONS", () => {
    const reading = readDay(ready([]), ready([{ tsf_code: "S1", balance: "10.00", tsf_insured_limit: null }]), [], "", {
      day: OPEN_DAY,
    });
    expect(reading.numbers.map((section) => section.name)).toEqual([
      "SALES",
      "CASH IN TILLS",
      "SAFE · S1",
      "SAFE · TODAY",
      "EXCEPTIONS",
    ]);
    expect(readDay(ready([]), NO_SAFES, [], "", { day: DAY }).numbers.map((section) => section.name)).not.toContain(
      "SAFE · TODAY",
    );
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

describe("the books (Qt 425fa80, notes 126)", () => {
  const AMBER_BOOKS: Check = {
    tone: "amber",
    title: "Books = drawers",
    detail: "CASH IN HAND says 12,950.00, the drawers should hold 12,450.00 — 500.00 posted outside the till",
  };
  const GREEN_SAFE: Check = { tone: "green", title: "Books = safe", detail: "Every safe's ledger = its safe book" };

  it("come after the safe count, and an amber one counts in the verdict without blocking", () => {
    const check = serverCheck(ALL_GREEN, { canClose: true });
    const reading = readDay(ready([]), NO_SAFES, [], "2026-10-07", {
      day: OPEN_DAY,
      check,
      books: [AMBER_BOOKS, GREEN_SAFE],
    });
    expect(reading.checks.slice(-3).map((row) => row.title)).toEqual(["Safe counted", "Books = drawers", "Books = safe"]);
    expect(reading.verdict.pill).toBe("1 AMBER");
    expect(reading.verdict.tone).toBe("warning");
  });

  it("are left out while the sessions are still being read", () => {
    const reading = readDay({ status: "loading", rows: [] }, NO_SAFES, null, "2026-10-07", {
      day: OPEN_DAY,
      books: [AMBER_BOOKS],
    });
    expect(reading.checks.map((row) => row.title)).toEqual(["Sessions closed"]);
  });
});

describe("the green fold (Qt 425fa80)", () => {
  const red: Check = { tone: "red", title: "Sessions closed", detail: "1 session still billing" };
  const amber: Check = { tone: "amber", title: "Slip gaps", detail: "1 slip gap open" };
  const grey: Check = { tone: "grey", title: "Books = drawers", detail: "Checked on today's day only" };
  const green = (title: string): Check => ({ tone: "green", title, detail: `${title}: fine` });

  it("puts every green row under one row, the others above it in order", () => {
    const checks = [green("Approvals pending"), red, green("Everything posted"), amber, grey, green("Books = safe")];
    const { rows, fold } = foldGreenChecks(checks);
    expect(rows).toEqual([red, amber, grey]);
    expect(fold).toEqual({
      title: "3 checks OK",
      detail: "Approvals pending · Everything posted · Books = safe",
      greens: [green("Approvals pending"), green("Everything posted"), green("Books = safe")],
    });
  });

  it("says one check in the singular, and has no fold without a green row", () => {
    expect(foldGreenChecks([green("Safe counted")]).fold?.title).toBe("1 check OK");
    expect(foldGreenChecks([red, amber])).toEqual({ rows: [red, amber], fold: null });
    expect(foldGreenChecks([])).toEqual({ rows: [], fold: null });
  });

  it("folds the drawing only: the verdict still counts what it folds", () => {
    const reading = readDay(ready([]), NO_SAFES, [], "2026-10-07", {
      day: OPEN_DAY,
      check: serverCheck(ALL_GREEN, { canClose: true }),
    });
    const { rows, fold } = foldGreenChecks(reading.checks);
    expect(rows).toEqual([]);
    expect(fold?.greens).toHaveLength(reading.checks.length);
    expect(reading.verdict.pill).toBe("READY");
  });

  it("labels its button as Qt does", () => {
    expect(greenFoldLabel(false)).toBe("Show  ▾");
    expect(greenFoldLabel(true)).toBe("Hide  ▴");
  });
});
