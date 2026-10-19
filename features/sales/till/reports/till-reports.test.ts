import { describe, expect, it } from "vitest";
import type { GridRow } from "../shared/wire/types";
import {
  EXCEPTION_COLUMNS,
  LEDGER_COLUMNS,
  LEG_COLUMNS,
  NO_PICKS,
  PERF_SESSION_COLUMNS,
  PERFORMANCE_COLUMNS,
  REPORT_TABS,
  ROW_ORDER,
  SAFE_BOOK_MAX_DAYS,
  TENDER_COLUMNS,
  TENDER_ROW_COLUMNS,
  VARIANCE_COLUMNS,
  approverParams,
  baseParams,
  branchPickerParams,
  buildTable,
  cashierSessionsParams,
  cellText,
  counterOptions,
  countLabel,
  csvText,
  dayHead,
  daysBetween,
  decisionsHead,
  decisionsParams,
  defaultRange,
  eventCodeTone,
  eventsHead,
  eventsTable,
  exceptionEventsParams,
  exceptionHoursParams,
  exceptionsParams,
  exceptionsTable,
  exportFileName,
  hourLabel,
  hourStrip,
  ledgerLegsParams,
  ledgerParams,
  ledgerTable,
  legsHead,
  legsTable,
  listedValue,
  moneyText,
  offCount,
  paletteBucket,
  parseReportView,
  peopleParams,
  perfSessionsHead,
  perfSessionsTable,
  performanceTable,
  pickRowById,
  pickRowOrFirst,
  pickSafeDay,
  pickTenderRow,
  pickVarianceRow,
  pickedSafeId,
  printDocument,
  printTitle,
  remitAge,
  remitHint,
  remitStatusTone,
  remittanceParams,
  remitsTable,
  reportRange,
  safeBookProblem,
  safeDayLinesParams,
  safeDaysParams,
  safeDaysTable,
  safeHint,
  safeOptions,
  scopeFromSearch,
  searchTable,
  sessionTarget,
  sessionsHead,
  sessionsTable,
  settleStatusTone,
  statusTone,
  tenderParams,
  tenderRowKey,
  tenderRowsHead,
  tenderRowsParams,
  tenderRowsTable,
  tenderStateTone,
  tenderTable,
  treatmentTone,
  undecidedLine,
  varianceParams,
  varianceTable,
  verdictTone,
  withoutScopeParams,
  type ReportColumn,
  type ReportFilters,
  type TableView,
} from "./till-reports";

const COMPANY = "019c8ea6-19e9-78a8-b15f-749e1cde7292";
const BRANCH = "019c8ea7-b0f5-72d5-96a5-1abfc80cc8ab";
const TODAY = "2026-10-17";

const filters = (patch: Partial<ReportFilters> = {}): ReportFilters => ({
  companyId: COMPANY,
  branchId: BRANCH,
  fromDate: "2026-10-11",
  toDate: TODAY,
  counterId: "",
  cashierId: "",
  approverId: "",
  event: "",
  safeId: "",
  withNonCash: false,
  ledgerDiffOnly: false,
  tenderPendingOnly: false,
  ...patch,
});

const keys = (params: Record<string, string>) => Object.keys(params).sort();
const BASE = ["icompany_id", "ibranch_id", "ifrom_date", "ito_date", "icounter_id", "ioperator_id"];

/** The texts of a table, row by row — what the operator reads. */
const texts = (table: TableView) => table.rows.map((row) => row.cells.map((cell) => cell.text));

/** A table's cell on one row, by column key. */
const cellAt = (table: TableView, columns: readonly ReportColumn[], row: number, key: string) =>
  table.rows[row].cells[columns.findIndex((column) => column.key === key)];

// Rows as the dev server answered them (2026-10-17).
const VARIANCE_ROW: GridRow = {
  cashier_id: "019e441b-6e48-7918-b246-b857ffb35db1",
  cashier: "VKPOS",
  sessions: "2",
  hours: "0.1",
  net_sales: "0.00",
  short_n: "0",
  short_amt: null,
  excess_n: "0",
  excess_amt: null,
  net_variance: "0.00",
  per_lakh: null,
  recounts: "0",
  force_closed: "1",
  noncash_gap: null,
  pending: "0",
  treatments: "",
};

const EVENT_ROWS: GridRow[] = [
  {
    at: "2026-10-17T04:54:11.879Z",
    at_text: "17-10-2026 10:24 AM",
    session_no: "ZT1-261017-01",
    tss_id: "01a14835-1410-7975-b31e-f495550577b6",
    tss_acc_year: "2026-2027",
    tss_company_id: COMPANY,
    tss_branch_id: BRANCH,
    counter_code: "ZT1",
    person: "VKPOS",
    event_code: "SESSION_FORCE_CLOSE",
    amount: null,
    detail: "ZT1-261017-01 · by zt-approver-10121202",
    device: "VKPOS1",
  },
  {
    at: "2026-10-17T04:54:11.566Z",
    at_text: "17-10-2026 10:24 AM",
    session_no: "ZT1-261017-01",
    tss_id: "01a14835-1410-7975-b31e-f495550577b6",
    tss_acc_year: "2026-2027",
    tss_company_id: COMPANY,
    tss_branch_id: BRANCH,
    counter_code: "ZT1",
    person: "zt-approver-10121202",
    event_code: "PIN_FAIL",
    amount: null,
    detail: "ZT1-261017-01 · FORCE_CLOSE",
    device: "VKPOS1",
  },
];

describe("the grids' tokens — every one sent, '' = all", () => {
  it("159–167 share the base six, the range the right way round", () => {
    const params = baseParams(filters({ fromDate: TODAY, toDate: "2026-10-11", cashierId: "u1" }), TODAY);
    expect(keys(params)).toEqual([...BASE].sort());
    expect(params).toMatchObject({ ifrom_date: "2026-10-11", ito_date: TODAY, ioperator_id: "u1", icounter_id: "" });
  });

  it("each grid adds exactly what its SQL binds", () => {
    const f = filters();
    expect(keys(varianceParams(f, TODAY))).toEqual([...BASE, "inoncash"].sort());
    expect(varianceParams(filters({ withNonCash: true }), TODAY).inoncash).toBe("1");
    expect(varianceParams(f, TODAY).inoncash).toBe("");
    expect(keys(cashierSessionsParams(f, TODAY, "c1"))).toEqual([...BASE].sort());
    expect(cashierSessionsParams(filters({ cashierId: "x" }), TODAY, "c1").ioperator_id).toBe("c1");
    expect(keys(exceptionsParams(filters({ event: "PIN_FAIL" }), TODAY))).toEqual([...BASE, "ievent"].sort());
    // The per-person grid counts every code: the Event filter is the event list's.
    expect(exceptionsParams(filters({ event: "PIN_FAIL" }), TODAY).ievent).toBe("");
    expect(exceptionHoursParams(filters({ event: "PIN_FAIL" }), TODAY).ievent).toBe("PIN_FAIL");
    expect(keys(exceptionEventsParams(f, TODAY, null, null))).toEqual([...BASE, "ievent", "ihour"].sort());
    expect(keys(approverParams(f, TODAY))).toEqual([...BASE, "iapprover_id"].sort());
    expect(keys(decisionsParams(f, TODAY, null))).toEqual([...BASE, "iapprover_id"].sort());
    expect(keys(safeDaysParams(f, TODAY))).toEqual([...BASE, "isafe_id"].sort());
    expect(keys(safeDayLinesParams(f, "2026-10-17T00:00:00Z"))).toEqual(["ibranch_id", "icompany_id", "iday", "isafe_id"]);
    expect(safeDayLinesParams(f, "2026-10-17T00:00:00Z").iday).toBe("2026-10-17");
    expect(keys(remittanceParams(f, TODAY))).toEqual(["ibranch_id", "icompany_id", "ifrom_date", "istatus", "ito_date"]);
    expect(branchPickerParams(COMPANY, BRANCH)).toEqual({ icompany_id: COMPANY, ibranch_id: BRANCH, iinactive: "true" });
    expect(peopleParams(COMPANY, "", "APPROVER")).toEqual({ icompany_id: COMPANY, ibranch_id: "", irole: "APPROVER" });
  });

  it("the event list: the picked person over the Cashier filter, the hour as text", () => {
    const params = exceptionEventsParams(filters({ cashierId: "x", event: "PIN_FAIL" }), TODAY, "p1", 9);
    expect(params).toMatchObject({ ioperator_id: "p1", ievent: "PIN_FAIL", ihour: "9" });
    expect(exceptionEventsParams(filters({ cashierId: "x" }), TODAY, null, null)).toMatchObject({ ioperator_id: "x", ihour: "" });
  });

  it("decisions: the picked approver, else the Approver filter", () => {
    expect(decisionsParams(filters({ approverId: "f" }), TODAY, "a1").iapprover_id).toBe("a1");
    expect(decisionsParams(filters({ approverId: "f" }), TODAY, null).iapprover_id).toBe("f");
  });

  it("175–180: the base six and the radios; the detail grids only the company and the session", () => {
    const f = filters();
    // 175 reads the base six as they are; 176 the picked cashier (cashierSessionsParams, as 160).
    expect(keys(ledgerParams(f, TODAY))).toEqual([...BASE, "idiff"].sort());
    expect(ledgerParams(f, TODAY).idiff).toBe("");
    expect(ledgerParams(filters({ ledgerDiffOnly: true }), TODAY).idiff).toBe("1");
    expect(ledgerLegsParams(COMPANY, "t1")).toEqual({ icompany_id: COMPANY, itss_id: "t1" });
    expect(keys(tenderParams(f, TODAY))).toEqual([...BASE, "ipending"].sort());
    expect(tenderParams(f, TODAY).ipending).toBe("");
    expect(tenderParams(filters({ tenderPendingOnly: true }), TODAY).ipending).toBe("1");
    expect(tenderRowsParams(COMPANY, "t1", "3")).toEqual({ icompany_id: COMPANY, itss_id: "t1", itender_type_id: "3" });
  });
});

describe("the tabs", () => {
  it("the three of 3b5069d follow the Safe book, in Qt's order and words", () => {
    expect(REPORT_TABS.map((entry) => entry.value)).toEqual([
      "variance",
      "exceptions",
      "approvers",
      "safe",
      "performance",
      "ledger",
      "tender",
    ]);
    expect(REPORT_TABS.slice(4).map((entry) => entry.label)).toEqual([
      "Cashier performance",
      "Ledger check",
      "Tender reconciliation",
    ]);
    expect(exportFileName("performance", TODAY)).toBe("till-cashier-performance-2026-10-17.csv");
    expect(exportFileName("tender", TODAY)).toBe("till-tender-reconciliation-2026-10-17.csv");
    expect(printTitle("ledger", "2026-10-11", TODAY, "Every branch")).toBe(
      "Till Reports — Ledger check · 11-10-2026 to 17-10-2026 · Every branch",
    );
  });
});

describe("the period", () => {
  it("defaults to a week to today", () => {
    expect(defaultRange(TODAY)).toEqual({ fromDate: "2026-10-11", toDate: TODAY });
  });

  it("reads an unreadable From as today and To as From (Qt base())", () => {
    expect(reportRange("", "", TODAY)).toEqual({ from: TODAY, to: TODAY });
    expect(reportRange("2026-10-01", "nope", TODAY)).toEqual({ from: "2026-10-01", to: "2026-10-01" });
    expect(reportRange("2026-02-30", TODAY, TODAY)).toEqual({ from: TODAY, to: TODAY });
  });

  it("the safe book: a branch, a safe, and at most three months", () => {
    expect(safeBookProblem(filters({ branchId: "" }), TODAY, false)).toMatch(/^Pick a branch/);
    expect(safeBookProblem(filters(), TODAY, false)).toBe("This branch has no safe.");
    expect(safeBookProblem(filters(), TODAY, true)).toMatch(/Reading/);
    const from = "2026-07-17";
    expect(daysBetween(from, TODAY)).toBe(SAFE_BOOK_MAX_DAYS);
    expect(safeBookProblem(filters({ safeId: "s", fromDate: from }), TODAY, false)).toBe("");
    expect(safeBookProblem(filters({ safeId: "s", fromDate: "2026-07-16" }), TODAY, false)).toMatch(/three months/);
  });
});

describe("cells", () => {
  const column = (kind: (typeof VARIANCE_COLUMNS)[number]["kind"]) => ({ key: "v", title: "V", kind });

  it("a count of nothing is blank; hours to one place", () => {
    expect(cellText(column("count"), { v: "0" })).toBe("");
    expect(cellText(column("count"), { v: 3 })).toBe("3");
    expect(cellText(column("count"), { v: null })).toBe("");
    expect(cellText(column("hours"), { v: "0.1" })).toBe("0.1");
    expect(cellText(column("hours"), { v: "7" })).toBe("7.0");
  });

  it("money the Qt way: Indian grouping, a TRUE minus, + only when signed", () => {
    expect(moneyText(12345650)).toBe("1,23,456.50");
    expect(moneyText(-400000)).toBe("−4,000.00");
    expect(moneyText(500, true)).toBe("+5.00");
    expect(moneyText(0, true)).toBe("0.00");
    expect(cellText(column("money"), { v: "-4000.00" })).toBe("−4,000.00");
    expect(cellText(column("signed"), { v: "12.5" })).toBe("+12.50");
    expect(cellText(column("money"), { v: null })).toBe("");
  });

  it("a signed figure is toned: short red, excess green, nil plain", () => {
    const table = buildTable([column("signed")], [{ v: "-1" }, { v: "1" }, { v: "0" }], { rowKey: (_r, i) => String(i) });
    expect(table.rows.map((row) => row.cells[0].tone)).toEqual(["red", "green", ""]);
  });
});

describe("pills", () => {
  it("treatments in the till's own colours, the count stripped to find the word", () => {
    expect(treatmentTone("PENDING 2")).toBe("amber");
    expect(treatmentTone("EXPENSE 3")).toBe("blue");
    expect(treatmentTone("RECOVER 1")).toBe("red");
    expect(treatmentTone("SUSPENSE 1")).toBe("slate");
    expect(treatmentTone("WITHIN TOL. 4")).toBe("green");
    expect(statusTone("PENDING APPROVAL")).toBe("amber");
    expect(statusTone("CLOSED")).toBe("green");
  });

  it("the palette's vocabulary, most specific first; an unknown word is grey", () => {
    expect(paletteBucket("VOIDED")).toBe("danger");
    expect(paletteBucket("part_paid")).toBe("progress");
    expect(paletteBucket("frobnicated")).toBe("neutral");
  });

  it("events, remittances", () => {
    expect(eventCodeTone("PIN_FAIL")).toBe("red");
    expect(eventCodeTone("PICKUP")).toBe("blue");
    expect(eventCodeTone("SESSION_SUSPEND")).toBe("amber");
    expect(remitStatusTone("IN TRANSIT")).toBe("amber");
    expect(remitStatusTone("CONFIRMED")).toBe("green");
    expect(remitStatusTone("VOIDED")).toBe("red");
  });
});

describe("Cashier variance", () => {
  it("the live row: counts blank at 0, force closed as a red pill, a totals row", () => {
    const table = varianceTable([VARIANCE_ROW]);
    expect(texts(table)[0].slice(0, 5)).toEqual(["VKPOS", "2", "0.1", "0.00", ""]);
    const forced = table.rows[0].cells[VARIANCE_COLUMNS.findIndex((c) => c.key === "force_closed")];
    expect(forced.pills).toEqual([{ text: "1", tone: "red" }]);
    expect(table.rows[1].total).toBe(true);
    expect(table.rows[1].cells[0].text).toBe("1 cashier");
    // Net sales 0: no per ₹1 lakh on the totals row.
    expect(table.rows[1].cells[VARIANCE_COLUMNS.findIndex((c) => c.key === "per_lakh")].text).toBe("");
  });

  it("totals sum the marked columns; per ₹1 lakh is the range's, not a sum", () => {
    const rows: GridRow[] = [
      { ...VARIANCE_ROW, cashier_id: "a", net_sales: "60000.00", net_variance: "-300.00", per_lakh: "-500.00", hours: "1.1" },
      { ...VARIANCE_ROW, cashier_id: "b", net_sales: "40000.00", net_variance: "-200.00", per_lakh: "-500.00", hours: "2.2" },
    ];
    const total = varianceTable(rows).rows[2];
    const at = (key: string) => total.cells[VARIANCE_COLUMNS.findIndex((c) => c.key === key)];
    expect(at("cashier").text).toBe("2 cashiers");
    expect(at("sessions").text).toBe("4");
    expect(at("hours").text).toBe("3.3");
    expect(at("net_sales").text).toBe("1,00,000.00");
    expect(at("net_variance")).toMatchObject({ text: "−500.00", tone: "red" });
    expect(at("per_lakh")).toMatchObject({ text: "−500.00", tone: "red" });
    expect(at("treatments").text).toBe("");
  });

  it("splits the treatments into one pill each", () => {
    const table = varianceTable([{ ...VARIANCE_ROW, treatments: "PENDING 1 · EXPENSE 2", pending: "1" }]);
    const cells = table.rows[0].cells;
    expect(cells[VARIANCE_COLUMNS.length - 1].pills).toEqual([
      { text: "PENDING 1", tone: "amber" },
      { text: "EXPENSE 2", tone: "blue" },
    ]);
    expect(cells[VARIANCE_COLUMNS.findIndex((c) => c.key === "pending")].pills).toEqual([{ text: "1", tone: "amber" }]);
  });

  it("the sessions: status and treatment pills, no totals", () => {
    const table = sessionsTable([{ tss_id: "s", status_text: "CLOSED", treatment: "WITHIN TOL.", cash_variance: "0.00", attempts: 1 }]);
    expect(table.rows).toHaveLength(1);
    const status = table.rows[0].cells.find((cell) => cell.text === "CLOSED");
    expect(status?.pills).toEqual([{ text: "CLOSED", tone: "green" }]);
  });

  it("keeps the picked cashier across a reload, else the first", () => {
    const rows = [{ cashier_id: "a" }, { cashier_id: "b" }];
    expect(pickVarianceRow(rows, "b")?.cashier_id).toBe("b");
    expect(pickVarianceRow(rows, "gone")?.cashier_id).toBe("a");
    expect(pickVarianceRow([], "a")).toBeNull();
  });

  it("the sessions' head", () => {
    expect(sessionsHead("VKPOS", false)).toMatch(/^VKPOS — every session in the range/);
    expect(sessionsHead(null, true)).toBe("No till session in this range.");
  });
});

describe("Exceptions", () => {
  const ROWS: GridRow[] = [
    { person_id: "v", person: "VKPOS", force_closed: "1", pin_fails: "0", total: "1" },
    { person_id: "z", person: "zt-approver-10121202", force_closed: "0", pin_fails: "3", total: "3" },
  ];

  it("per person: red flags, people counted on the totals row", () => {
    const table = exceptionsTable(ROWS);
    const at = (key: string) => EXCEPTION_COLUMNS.findIndex((c) => c.key === key);
    expect(table.rows[0].cells[at("force_closed")].pills).toEqual([{ text: "1", tone: "red" }]);
    expect(table.rows[1].cells[at("pin_fails")].pills).toEqual([{ text: "3", tone: "red" }]);
    expect(table.rows[2].cells[0].text).toBe("2 people");
    expect(table.rows[2].cells[at("total")].text).toBe("4");
    expect(EXCEPTION_COLUMNS[at("no_sales")].tip).toMatch(/not built yet/);
  });

  it("nobody picked reads everyone", () => {
    expect(pickRowById(ROWS, "person_id", "")).toBeNull();
    expect(pickRowById(ROWS, "person_id", "z")?.person).toBe("zt-approver-10121202");
  });

  it("the Qt test: searching PIN_FAIL leaves one event", () => {
    const events = searchTable(eventsTable(EVENT_ROWS), "PIN_FAIL");
    expect(events.rows).toHaveLength(1);
    expect(events.rows[0].row?.event_code).toBe("PIN_FAIL");
  });

  it("the search keeps the totals row", () => {
    const shown = searchTable(exceptionsTable(ROWS), "vkpos");
    expect(shown.rows.map((row) => row.key)).toEqual(["v", "__total"]);
    expect(searchTable(exceptionsTable(ROWS), "   ").rows).toHaveLength(3);
  });

  it("the events newest first, whatever order they came in", () => {
    expect(ROW_ORDER.events([...EVENT_ROWS].reverse()).map((row) => row.event_code)).toEqual([
      "SESSION_FORCE_CLOSE",
      "PIN_FAIL",
    ]);
  });

  it("the heat strip: 8 AM to 10 PM, wider for an event outside, shaded by the busiest hour", () => {
    const strip = hourStrip([
      { hr: 10, events: "2" },
      { hr: 23, events: "1" },
    ]);
    expect(strip[0]).toMatchObject({ hour: 8, count: 0, heat: 0, label: "8 AM" });
    expect(strip[strip.length - 1]).toMatchObject({ hour: 23, count: 1, heat: 0.5, label: "11 PM" });
    expect(strip.find((cell) => cell.hour === 10)).toMatchObject({ heat: 1, tip: "2 events between 10 AM and 11 AM — click to list them" });
    expect(hourStrip([])).toHaveLength(15);
    expect(hourLabel(0)).toBe("12 AM");
    expect(hourLabel(12)).toBe("12 PM");
  });

  it("the events' head", () => {
    expect(eventsHead(null, "", null, 2)).toBe("Everyone · every exception — 2 events · Enter opens the session's Cockpit");
    expect(eventsHead("VKPOS", "PIN_FAIL", 14, 1)).toBe("VKPOS · PIN fails · 2 PM hour — 1 event · Enter opens the session's Cockpit");
  });
});

describe("Approver activity", () => {
  it("the not-decided band", () => {
    expect(undecidedLine([])).toEqual({ text: "Every request in the range was decided.", tone: "green" });
    const line = undecidedLine([
      { tap_status: "EXPIRED", event_code: "CASH_PAYMENT", amount: "1500.00", ref: "ZT1-01", requested_at: "17-10-2026 10:00 AM", waited: "30 min" },
      { tap_status: "PENDING", event_code: "FORCE_CLOSE", amount: "0", ref: "ZT1-02", requested_at: "17-10-2026 11:00 AM", waited: "5 min" },
    ]);
    expect(line.tone).toBe("amber");
    expect(line.text).toBe(
      "NOT DECIDED — 2 requests: 1 expired, 1 still pending.  " +
        "expired CASH_PAYMENT 1,500.00 (ZT1-01, 17-10-2026 10:00 AM · waited 30 min) · " +
        "pending FORCE_CLOSE 0.00 (ZT1-02, 17-10-2026 11:00 AM · waiting 5 min)",
    );
  });

  it("the decisions' head", () => {
    expect(decisionsHead(null, 2)).toBe("Everyone — 2 decisions · Enter opens the request's session (Cockpit)");
  });
});

describe("Safe book", () => {
  const DAYS: GridRow[] = [
    { day: "2026-10-16", day_text: "16-10-2026", opening: "100", from_tills: "0", floats_out: "0", book_closing: "100", diff: null, bags_awaiting: "0", limit_flag: "", tsf_insured_limit: "0.00" },
    { day: "2026-10-17", day_text: "17-10-2026", opening: "100", from_tills: "50", floats_out: "-4000.00", book_closing: "-3850.00", diff: "-10.00", bags_awaiting: "1", limit_flag: "OVER LIMIT", tsf_insured_limit: "0.00" },
  ];

  it("the totals row: the first opening, the last closing + difference", () => {
    const table = safeDaysTable(DAYS);
    const total = texts(table)[2];
    expect(total[0]).toBe("2 days");
    expect(total[1]).toBe("100.00");
    expect(total[2]).toBe("50.00");
    expect(total[3]).toBe("−4,000.00");
    expect(total[7]).toBe("−3,860.00");
    expect(table.rows[1].cells[12].pills).toEqual([{ text: "OVER LIMIT", tone: "red" }]);
    expect(table.rows[1].cells[10].pills).toEqual([{ text: "1", tone: "blue" }]);
  });

  it("picks the day kept, else the last", () => {
    expect(pickSafeDay(DAYS, "2026-10-16")?.day).toBe("2026-10-16");
    expect(pickSafeDay(DAYS, "")?.day).toBe("2026-10-17");
    expect(dayHead(DAYS[1])).toBe("17-10-2026 — the day's lines · opening 100.00");
  });

  it("the hint names the insured limit", () => {
    expect(safeHint(DAYS)).toMatch(/^No insured limit on this safe\. Opening = /);
    expect(safeHint([{ tsf_insured_limit: "50000.00" }])).toMatch(/^Insured limit 50,000\.00 \(safe master\)/);
  });

  it("the remittances: age, total, what is on the way", () => {
    const rows: GridRow[] = [
      { tcm_id: "1", rm_status: "IN TRANSIT", rm_age: 3, rm_amount: "1000.00", rm_bank_date: "" },
      { tcm_id: "2", rm_status: "CONFIRMED", rm_age: null, rm_amount: "500.00", rm_bank_date: "16-10-2026" },
    ];
    expect(remitAge(rows[0])).toBe("3 days");
    expect(remitAge(rows[1])).toBe("bank 16-10");
    const table = remitsTable(rows);
    expect(texts(table)[2]).toEqual(["2 remittances", "", "", "1,500.00", "", ""]);
    expect(remitHint(rows)).toMatch(/^In transit 1,000\.00 — /);
  });
});

describe("Cashier performance", () => {
  // Grid 175 as the dev DB answers it: counts as strings, rates to one place, money to two.
  const ROWS: GridRow[] = [
    {
      cashier_id: "a",
      cashier: "VKPOS",
      sessions: "2",
      hours: "1.50",
      bills: "30",
      lines: "90",
      items_per_bill: "3.0",
      bills_per_hour: "20.0",
      sales: "60000.00",
      avg_bill: "2000.00",
      gap_minutes: "2.5",
      cancelled: "1",
      retenders: "0",
    },
    {
      cashier_id: "b",
      cashier: "zt-cashier",
      sessions: "1",
      hours: "0.50",
      bills: "10",
      lines: "10",
      items_per_bill: "1.0",
      bills_per_hour: "20.0",
      sales: "10000.00",
      avg_bill: "1000.00",
      gap_minutes: null,
      cancelled: "0",
      retenders: "2",
    },
  ];

  it("the columns, in Qt's order, with its titles", () => {
    expect(PERFORMANCE_COLUMNS.map((column) => column.key)).toEqual([
      "cashier", "sessions", "hours", "bills", "lines", "items_per_bill", "bills_per_hour", "sales", "avg_bill",
      "gap_minutes", "cancelled", "retenders",
    ]);
    expect(PERFORMANCE_COLUMNS.find((column) => column.key === "gap_minutes")).toMatchObject({ title: "Min. between bills", kind: "hours" });
    expect(PERFORMANCE_COLUMNS.find((column) => column.key === "retenders")).toMatchObject({ title: "Re-tenders", total: true });
    expect(PERFORMANCE_COLUMNS.filter((column) => column.total).map((column) => column.key)).toEqual([
      "sessions", "hours", "bills", "lines", "sales", "cancelled", "retenders",
    ]);
    expect(PERF_SESSION_COLUMNS.map((column) => column.key)).toEqual([
      "tss_session_no", "business_date", "counter_code", "opened_at", "hours", "bills", "lines", "items_per_bill",
      "bills_per_hour", "sales", "avg_bill", "gap_minutes", "cancelled", "retenders", "status_text",
    ]);
    expect(PERF_SESSION_COLUMNS.some((column) => column.total)).toBe(false);
  });

  it("the totals row's rates are the range's, not sums", () => {
    const table = performanceTable(ROWS);
    expect(table.rows).toHaveLength(3);
    const total = 2;
    expect(cellAt(table, PERFORMANCE_COLUMNS, total, "cashier").text).toBe("2 cashiers");
    expect(cellAt(table, PERFORMANCE_COLUMNS, total, "sessions").text).toBe("3");
    expect(cellAt(table, PERFORMANCE_COLUMNS, total, "hours").text).toBe("2.0");
    expect(cellAt(table, PERFORMANCE_COLUMNS, total, "bills").text).toBe("40");
    expect(cellAt(table, PERFORMANCE_COLUMNS, total, "lines").text).toBe("100");
    expect(cellAt(table, PERFORMANCE_COLUMNS, total, "sales").text).toBe("70,000.00");
    // 100 lines ÷ 40 bills; 40 bills ÷ 2.0 hours; 70,000 ÷ 40 — not 3.0 + 1.0, 20 + 20, 2,000 + 1,000.
    expect(cellAt(table, PERFORMANCE_COLUMNS, total, "items_per_bill").text).toBe("2.5");
    expect(cellAt(table, PERFORMANCE_COLUMNS, total, "bills_per_hour").text).toBe("20.0");
    expect(cellAt(table, PERFORMANCE_COLUMNS, total, "avg_bill").text).toBe("1,750.00");
    expect(cellAt(table, PERFORMANCE_COLUMNS, total, "gap_minutes").text).toBe("");
  });

  it("no bills, no rates; no hours, no bills per hour", () => {
    const idle = performanceTable([{ ...ROWS[0], bills: "0", lines: "0", sales: "0.00", hours: "0.00" }]);
    expect(cellAt(idle, PERFORMANCE_COLUMNS, 1, "items_per_bill").text).toBe("");
    expect(cellAt(idle, PERFORMANCE_COLUMNS, 1, "bills_per_hour").text).toBe("");
    expect(cellAt(idle, PERFORMANCE_COLUMNS, 1, "avg_bill").text).toBe("");
    const noHours = performanceTable([{ ...ROWS[0], hours: "0.00" }]);
    expect(cellAt(noHours, PERFORMANCE_COLUMNS, 1, "bills_per_hour").text).toBe("");
    expect(cellAt(noHours, PERFORMANCE_COLUMNS, 1, "items_per_bill").text).toBe("3.0");
    expect(performanceTable([]).rows).toHaveLength(0);
  });

  it("cancelled a red pill, re-tenders amber, nothing at 0", () => {
    const table = performanceTable(ROWS);
    expect(cellAt(table, PERFORMANCE_COLUMNS, 0, "cancelled").pills).toEqual([{ text: "1", tone: "red" }]);
    expect(cellAt(table, PERFORMANCE_COLUMNS, 0, "retenders").pills).toEqual([]);
    expect(cellAt(table, PERFORMANCE_COLUMNS, 1, "cancelled").pills).toEqual([]);
    expect(cellAt(table, PERFORMANCE_COLUMNS, 1, "retenders").pills).toEqual([{ text: "2", tone: "amber" }]);
    expect(table.rows.map((row) => row.key)).toEqual(["a", "b", "__total"]);
  });

  it("the picked cashier's sessions: a status pill, no totals, newest first", () => {
    const sessions: GridRow[] = [
      { tss_id: "s1", tss_session_no: "ZT1-261016-01", tss_opened_on: "2026-10-16T04:00:00Z", status_text: "CLOSED", bills: "0" },
      { tss_id: "s2", tss_session_no: "ZT1-261017-01", tss_opened_on: "2026-10-17T04:00:00Z", status_text: "OPEN", bills: "3" },
    ];
    const table = perfSessionsTable(ROW_ORDER.sessions(sessions));
    expect(table.rows.map((row) => row.key)).toEqual(["s2", "s1"]);
    expect(cellAt(table, PERF_SESSION_COLUMNS, 0, "status_text").pills).toEqual([{ text: "OPEN", tone: "blue" }]);
    expect(cellAt(table, PERF_SESSION_COLUMNS, 0, "bills").text).toBe("3");
    expect(cellAt(table, PERF_SESSION_COLUMNS, 1, "bills").text).toBe("");
  });

  it("the head, and the empty state", () => {
    expect(perfSessionsHead("VKPOS", false)).toBe("VKPOS — every session in the range · Enter opens the Session Cockpit");
    expect(perfSessionsHead(null, false)).toBe("");
    expect(perfSessionsHead(null, true)).toBe("No till session in this range.");
  });
});

describe("Ledger check", () => {
  // Grid 177 as the dev DB answers it, in ITS order: OFF first, then newest.
  const ROWS: GridRow[] = [
    {
      tss_id: "off", tss_acc_year: "2026-2027", tss_company_id: COMPANY, tss_branch_id: BRANCH,
      tss_session_no: "ZT1-261016-02", business_date: "16-10-2026", counter_code: "ZT1", cashier: "VKPOS",
      status_text: "CLOSED", tss_float_mode: "CARRIED", tss_float_issued: "2000.00", tss_float_left: "2000.00",
      books: "150.00", should: "0.00", diff: "150.00", legs: "4", verdict: "OFF",
    },
    {
      tss_id: "live", tss_acc_year: "2026-2027", tss_company_id: COMPANY, tss_branch_id: BRANCH,
      tss_session_no: "ZT2-261017-01", business_date: "17-10-2026", counter_code: "ZT2", cashier: "zt-cashier",
      status_text: "OPEN", tss_float_mode: "ISSUED", tss_float_issued: "2000.00", tss_float_left: null,
      books: "1500.00", should: null, diff: null, legs: "2", verdict: "LIVE",
    },
    {
      tss_id: "ok", tss_acc_year: "2026-2027", tss_company_id: COMPANY, tss_branch_id: BRANCH,
      tss_session_no: "ZT1-261017-01", business_date: "17-10-2026", counter_code: "ZT1", cashier: "VKPOS",
      status_text: "CLOSED", tss_float_mode: "ISSUED", tss_float_issued: "2000.00", tss_float_left: "2000.00",
      books: "2000.00", should: "2000.00", diff: "0.00", legs: "3", verdict: "OK",
    },
  ];

  it("the columns: only the legs are summed", () => {
    expect(LEDGER_COLUMNS.map((column) => column.key)).toEqual([
      "tss_session_no", "business_date", "counter_code", "cashier", "status_text", "tss_float_mode", "tss_float_issued",
      "tss_float_left", "books", "should", "diff", "legs", "verdict",
    ]);
    expect(LEDGER_COLUMNS.filter((column) => column.total).map((column) => column.key)).toEqual(["legs"]);
    expect(LEDGER_COLUMNS.find((column) => column.key === "diff")).toMatchObject({ title: "Difference", kind: "signed" });
    expect(LEDGER_COLUMNS.find((column) => column.key === "verdict")?.title).toBe("Check");
  });

  it("keeps the grid's order, pills the check and the status, counts the sessions OFF", () => {
    const table = ledgerTable(ROWS);
    expect(table.rows.map((row) => row.key)).toEqual(["off", "live", "ok", "__total"]);
    expect(cellAt(table, LEDGER_COLUMNS, 0, "verdict").pills).toEqual([{ text: "OFF", tone: "red" }]);
    expect(cellAt(table, LEDGER_COLUMNS, 1, "verdict").pills).toEqual([{ text: "LIVE", tone: "blue" }]);
    expect(cellAt(table, LEDGER_COLUMNS, 2, "verdict").pills).toEqual([{ text: "OK", tone: "green" }]);
    expect(cellAt(table, LEDGER_COLUMNS, 1, "status_text").pills).toEqual([{ text: "OPEN", tone: "blue" }]);
    expect(cellAt(table, LEDGER_COLUMNS, 0, "diff")).toMatchObject({ text: "+150.00", tone: "green" });
    expect(cellAt(table, LEDGER_COLUMNS, 1, "should").text).toBe("");
    expect(cellAt(table, LEDGER_COLUMNS, 3, "tss_session_no").text).toBe("1 session OFF");
    expect(cellAt(table, LEDGER_COLUMNS, 3, "legs").text).toBe("9");
    expect(cellAt(table, LEDGER_COLUMNS, 3, "books").text).toBe("");
    expect(offCount(ROWS)).toBe(1);
    expect(cellAt(ledgerTable(ROWS.slice(1)), LEDGER_COLUMNS, 2, "tss_session_no").text).toBe("2 sessions, none OFF");
    expect(cellAt(ledgerTable([ROWS[2]]), LEDGER_COLUMNS, 1, "tss_session_no").text).toBe("1 session, none OFF");
    expect(verdictTone("OK")).toBe("green");
    expect(verdictTone("OFF")).toBe("red");
    expect(verdictTone("LIVE")).toBe("blue");
  });

  it("the picked session is kept by tss_id, else the first; a main row names its session", () => {
    expect(pickRowOrFirst(ROWS, "tss_id", "ok")?.tss_id).toBe("ok");
    expect(pickRowOrFirst(ROWS, "tss_id", "gone")?.tss_id).toBe("off");
    expect(pickRowOrFirst(ROWS, "tss_id", "")?.tss_id).toBe("off");
    expect(pickRowOrFirst([], "tss_id", "ok")).toBeNull();
    const session = sessionTarget(ROWS[1]);
    expect(session?.key).toEqual({ companyId: COMPANY, branchId: BRANCH, accYear: "2026-2027", tssId: "live" });
    expect(session).toMatchObject({ sessionNo: "ZT2-261017-01", status: "OPEN", cashier: "zt-cashier", counterCode: "ZT2" });
  });

  it("the legs: oldest first, Dr / Cr summed, the totals row's Running is the last leg's", () => {
    const legs: GridRow[] = [
      { av_id: "2", av_created_on: "2026-10-17T05:00:00Z", at_text: "17-10 10:30 AM", refno: "TDrp/1", type_code: "TDrp", type_name: "Till drop", dr: null, cr: "500.00", running: "1500.00", remarks: "" },
      { av_id: "1", av_created_on: "2026-10-17T04:00:00Z", at_text: "17-10 09:30 AM", refno: "TFlt/1", type_code: "TFlt", type_name: "Till float", dr: "2000.00", cr: null, running: "2000.00", remarks: "float" },
    ];
    const table = legsTable(ROW_ORDER.legs(legs));
    expect(table.rows.map((row) => row.key)).toEqual(["1", "2", "__total"]);
    expect(LEG_COLUMNS.map((column) => column.key)).toEqual(["at_text", "refno", "type_code", "type_name", "dr", "cr", "running", "remarks"]);
    expect(texts(table)[2]).toEqual(["2 legs", "", "", "", "2,000.00", "500.00", "+1,500.00", ""]);
    expect(cellAt(table, LEG_COLUMNS, 2, "running").tone).toBe("green");
    expect(cellAt(table, LEG_COLUMNS, 0, "running")).toMatchObject({ text: "+2,000.00", tone: "green" });
    expect(sessionTarget(legs[0])).toBeNull();
    expect(legsTable([]).rows).toHaveLength(0);
  });

  it("the legs' head, and the empty state by the radio", () => {
    expect(legsHead("ZT2-261017-01", false, false)).toBe(
      "ZT2-261017-01 — its legs on the till cash ledger, in the order written · Enter opens the Cockpit",
    );
    expect(legsHead(null, false, true)).toBe("");
    expect(legsHead(null, true, true)).toBe("No session is OFF in this range.");
    expect(legsHead(null, true, false)).toBe("No till session in this range.");
  });
});

describe("Tender reconciliation", () => {
  // Grid 179 as the dev DB would answer it, in ITS order: FAILED first, then newest.
  const ROWS: GridRow[] = [
    {
      tss_id: "s1", tss_acc_year: "2026-2027", tss_company_id: COMPANY, tss_branch_id: BRANCH,
      tss_session_no: "ZT1-261017-01", business_date: "17-10-2026", counter_code: "ZT1", cashier: "VKPOS",
      tender_type_id: 2, tender: "Card", txns: "3", expected: "3000.00", settled: "1000.00", mdr: "15.00",
      gap: "2000.00", pending_n: "1", failed_n: "1", oldest_days: "4", state: "FAILED",
    },
    {
      tss_id: "s1", tss_acc_year: "2026-2027", tss_company_id: COMPANY, tss_branch_id: BRANCH,
      tss_session_no: "ZT1-261017-01", business_date: "17-10-2026", counter_code: "ZT1", cashier: "VKPOS",
      tender_type_id: 3, tender: "UPI", txns: "2", expected: "500.00", settled: "500.00", mdr: "0.00",
      gap: "0.00", pending_n: "0", failed_n: "0", oldest_days: null, state: "SETTLED",
    },
    {
      tss_id: "s2", tss_acc_year: "2026-2027", tss_company_id: COMPANY, tss_branch_id: BRANCH,
      tss_session_no: "ZT1-261016-01", business_date: "16-10-2026", counter_code: "ZT1", cashier: "VKPOS",
      tender_type_id: 5, tender: "Cheque", txns: "1", expected: "-200.00", settled: "0.00", mdr: "0.00",
      gap: "-200.00", pending_n: "0", failed_n: "0", oldest_days: null, state: "NOT TRACKED",
    },
  ];

  it("the columns", () => {
    expect(TENDER_COLUMNS.map((column) => column.key)).toEqual([
      "tss_session_no", "business_date", "counter_code", "cashier", "tender", "txns", "expected", "settled", "mdr", "gap",
      "pending_n", "failed_n", "oldest_days", "state",
    ]);
    expect(TENDER_COLUMNS.filter((column) => column.total).map((column) => column.key)).toEqual([
      "txns", "expected", "settled", "mdr", "gap", "pending_n", "failed_n",
    ]);
    expect(TENDER_COLUMNS.find((column) => column.key === "oldest_days")).toMatchObject({ title: "Oldest (days)", kind: "count" });
    expect(TENDER_ROW_COLUMNS.map((column) => column.key)).toEqual([
      "at_text", "doc_type", "doc_refno", "tender_name", "amount", "reference", "settle_status", "settled_on", "settled",
      "mdr", "settle_ref", "age_days",
    ]);
    expect(TENDER_ROW_COLUMNS.filter((column) => column.total).map((column) => column.key)).toEqual(["amount", "settled", "mdr"]);
    expect(TENDER_ROW_COLUMNS.find((column) => column.key === "amount")?.kind).toBe("signed");
  });

  it("a row is the session and the tender type together; kept by that key, else the first", () => {
    expect(tenderRowKey(ROWS[0])).toBe("s12");
    expect(tenderRowKey(ROWS[1])).toBe("s13");
    expect(tenderRowKey(null)).toBe("");
    expect(pickTenderRow(ROWS, "s13")?.tender).toBe("UPI");
    expect(pickTenderRow(ROWS, "s19")?.tender).toBe("Card");
    expect(pickTenderRow(ROWS, "")?.tender).toBe("Card");
    expect(pickTenderRow([], "s12")).toBeNull();
    expect(tenderTable(ROWS).rows.map((row) => row.key)).toEqual(["s12", "s13", "s25", "__total"]);
  });

  it("keeps the grid's order, pills the state and the failures, totals the money", () => {
    const table = tenderTable(ROWS);
    expect(cellAt(table, TENDER_COLUMNS, 0, "state").pills).toEqual([{ text: "FAILED", tone: "red" }]);
    expect(cellAt(table, TENDER_COLUMNS, 1, "state").pills).toEqual([{ text: "SETTLED", tone: "green" }]);
    expect(cellAt(table, TENDER_COLUMNS, 2, "state").pills).toEqual([{ text: "NOT TRACKED", tone: "grey" }]);
    expect(tenderStateTone("PENDING")).toBe("amber");
    expect(tenderStateTone("PARTIAL")).toBe("amber");
    expect(cellAt(table, TENDER_COLUMNS, 0, "failed_n").pills).toEqual([{ text: "1", tone: "red" }]);
    expect(cellAt(table, TENDER_COLUMNS, 1, "failed_n").pills).toEqual([]);
    expect(cellAt(table, TENDER_COLUMNS, 2, "gap")).toMatchObject({ text: "−200.00", tone: "red" });
    const total = 3;
    expect(cellAt(table, TENDER_COLUMNS, total, "tss_session_no").text).toBe("3 session-tenders");
    expect(cellAt(table, TENDER_COLUMNS, total, "txns").text).toBe("6");
    expect(cellAt(table, TENDER_COLUMNS, total, "expected").text).toBe("3,300.00");
    expect(cellAt(table, TENDER_COLUMNS, total, "gap")).toMatchObject({ text: "+1,800.00", tone: "green" });
    expect(cellAt(table, TENDER_COLUMNS, total, "oldest_days").text).toBe("");
    expect(cellAt(tenderTable([ROWS[1]]), TENDER_COLUMNS, 1, "tss_session_no").text).toBe("1 session-tender");
    expect(sessionTarget(ROWS[0])?.key.tssId).toBe("s1");
  });

  it("the tender rows: oldest first, the settlement pilled, the amount signed and summed", () => {
    const rows: GridRow[] = [
      { td_id: "b", td_created_on: "2026-10-17T06:00:00Z", at_text: "17-10 11:30 AM", doc_type: "SALE_RETURN", doc_refno: "SR/2", tender_name: "HDFC Card", amount: "-200.00", reference: "xx1234", settle_status: "NA", settled_on: "", settled: null, mdr: null, settle_ref: "", age_days: null },
      { td_id: "a", td_created_on: "2026-10-17T05:00:00Z", at_text: "17-10 10:30 AM", doc_type: "SALE_BILL", doc_refno: "SB/1", tender_name: "HDFC Card", amount: "1000.00", reference: "AUTH1 · xx1234", settle_status: "SETTLED", settled_on: "18-10-2026", settled: "1000.00", mdr: "15.00", settle_ref: "BATCH9", age_days: null },
      { td_id: "c", td_created_on: "2026-10-17T07:00:00Z", at_text: "17-10 12:30 PM", doc_type: "SALE_BILL", doc_refno: "SB/3", tender_name: "HDFC Card", amount: "2000.00", reference: "", settle_status: "FAILED", settled_on: "", settled: null, mdr: null, settle_ref: "", age_days: "4" },
    ];
    const table = tenderRowsTable(ROW_ORDER.tenderRows(rows));
    expect(table.rows.map((row) => row.key)).toEqual(["a", "b", "c", "__total"]);
    expect(cellAt(table, TENDER_ROW_COLUMNS, 0, "settle_status").pills).toEqual([{ text: "SETTLED", tone: "green" }]);
    expect(cellAt(table, TENDER_ROW_COLUMNS, 1, "settle_status").pills).toEqual([{ text: "NA", tone: "grey" }]);
    expect(cellAt(table, TENDER_ROW_COLUMNS, 2, "settle_status").pills).toEqual([{ text: "FAILED", tone: "red" }]);
    expect(settleStatusTone("PENDING")).toBe("amber");
    expect(settleStatusTone("PARTIAL")).toBe("amber");
    expect(cellAt(table, TENDER_ROW_COLUMNS, 1, "amount")).toMatchObject({ text: "−200.00", tone: "red" });
    expect(cellAt(table, TENDER_ROW_COLUMNS, 2, "age_days").text).toBe("4");
    expect(texts(table)[3]).toEqual(["3 rows", "", "", "", "+2,800.00", "", "", "", "1,000.00", "15.00", "", ""]);
    expect(sessionTarget(rows[0])).toBeNull();
  });

  it("the rows' head, and the empty state by the radio", () => {
    expect(tenderRowsHead(ROWS[1], false, false)).toBe("ZT1-261017-01 · UPI — the rows and how each settled");
    expect(tenderRowsHead(null, false, false)).toBe("");
    expect(tenderRowsHead(null, true, true)).toBe("Everything in this range is settled.");
    expect(tenderRowsHead(null, true, false)).toBe(
      "No card, UPI, wallet, cheque or bank tender in a till session in this range.",
    );
  });
});

describe("pickers", () => {
  it("counters by code, safes code · name with the default", () => {
    expect(counterOptions([{ tcn_id: "c1", tcn_code: "ZT1" }])).toEqual([{ value: "c1", label: "ZT1" }]);
    const safes = safeOptions([
      { tsf_id: "s1", tsf_code: "A", tsf_name: "Back", tsf_is_default: false },
      { tsf_id: "s2", tsf_code: "ZTS", tsf_name: "ZT S1 test safe", tsf_is_default: true },
    ]);
    expect(safes[1]).toEqual({ value: "s2", label: "ZTS · ZT S1 test safe", isDefault: true });
    expect(pickedSafeId(safes, "", true)).toBe("s2");
    expect(pickedSafeId(safes, "s1", true)).toBe("s1");
    expect(pickedSafeId(safes, "gone", true)).toBe("s2");
    expect(pickedSafeId([], "kept", false)).toBe("kept");
  });

  it("a value not listed once the list has answered is All; kept while it loads", () => {
    const options = [{ value: "a", label: "A" }];
    expect(listedValue(options, "a", true)).toBe("a");
    expect(listedValue(options, "b", true)).toBe("");
    expect(listedValue([], "b", false)).toBe("b");
  });
});

describe("the session a row names", () => {
  it("an event row, on its own tenant key", () => {
    const session = sessionTarget(EVENT_ROWS[1]);
    expect(session?.key).toEqual({ companyId: COMPANY, branchId: BRANCH, accYear: "2026-2027", tssId: "01a14835-1410-7975-b31e-f495550577b6" });
    expect(session?.sessionNo).toBe("ZT1-261017-01");
    expect(session?.cashier).toBe("zt-approver-10121202");
  });

  it("a decision names it by ref; a safe line names none", () => {
    expect(sessionTarget({ tss_id: "t", ref: "ZT1-261017-02", requested_by: "VKPOS" })?.sessionNo).toBe("ZT1-261017-02");
    expect(sessionTarget({ doc_no: "tfl00001", kind: "FLOAT ISSUE" })).toBeNull();
    expect(sessionTarget(null)).toBeNull();
  });
});

describe("print and export", () => {
  it("CSV: every field quoted, the true minus as '-', pills' text where a cell has none", () => {
    const table: TableView = {
      columns: [
        { key: "a", title: 'Say "hi"', kind: "text" },
        { key: "b", title: "Short ₹", kind: "signed" },
      ],
      rows: [
        {
          key: "1",
          row: {},
          total: false,
          cells: [
            { text: "", numeric: false, tone: "", pills: [{ text: "PENDING 1", tone: "amber" }, { text: "EXPENSE 2", tone: "blue" }] },
            { text: "−12.00", numeric: true, tone: "red", pills: [] },
          ],
        },
      ],
    };
    expect(csvText([table, table])).toBe(
      '﻿"Say ""hi""","Short ₹"\r\n"PENDING 1 · EXPENSE 2","-12.00"\r\n\r\n' +
        '"Say ""hi""","Short ₹"\r\n"PENDING 1 · EXPENSE 2","-12.00"\r\n\r\n',
    );
    expect(exportFileName("variance", TODAY)).toBe("till-cashier-variance-2026-10-17.csv");
  });

  it("the printable page: landscape, the title, each table under its caption, escaped", () => {
    const title = printTitle("safe", "2026-10-11", TODAY, "Acme <Main>");
    expect(title).toBe("Till Reports — Safe book · 11-10-2026 to 17-10-2026 · Acme <Main>");
    const page = printDocument(title, [{ caption: "Safe book", table: safeDaysTable([]) }]);
    expect(page).toContain("size:A4 landscape");
    expect(page).toContain("Acme &lt;Main&gt;");
    expect(page).toContain("<h3>Safe book</h3>");
  });
});

describe("back from the Cockpit", () => {
  it("reads a stored view back, field by field", () => {
    const view = parseReportView({
      tab: "exceptions",
      branch: { id: BRANCH, text: "Coimbatore" },
      fromDate: "2026-10-11",
      toDate: TODAY,
      event: "PIN_FAIL",
      withNonCash: true,
      picks: { person: "p1", hour: 10 },
    });
    expect(view).toMatchObject({ tab: "exceptions", branch: { id: BRANCH, text: "Coimbatore" }, event: "PIN_FAIL", withNonCash: true });
    expect(view?.picks).toEqual({ ...NO_PICKS, person: "p1", hour: 10 });
    // A view stored before the three new tabs: the radios off, the picks none.
    expect(view).toMatchObject({ ledgerDiffOnly: false, tenderPendingOnly: false });
  });

  it("the new tabs' radios and picks", () => {
    const view = parseReportView({
      tab: "tender",
      branch: null,
      ledgerDiffOnly: true,
      tenderPendingOnly: true,
      picks: { performer: "c1", ledgerSession: "t1", tenderKey: "t12" },
    });
    expect(view).toMatchObject({ tab: "tender", ledgerDiffOnly: true, tenderPendingOnly: true });
    expect(view?.picks).toEqual({ ...NO_PICKS, performer: "c1", ledgerSession: "t1", tenderKey: "t12" });
    expect(parseReportView({ tab: "ledger", ledgerDiffOnly: "1", picks: { performer: 3 } })).toMatchObject({
      ledgerDiffOnly: false,
      picks: NO_PICKS,
    });
    expect(parseReportView({ tab: "performance" })?.tab).toBe("performance");
  });

  it("refuses what is not one", () => {
    expect(parseReportView(null)).toBeNull();
    expect(parseReportView({ tab: "nope" })).toBeNull();
    expect(parseReportView({ tab: "safe", event: "DROP TABLE", branch: null })?.event).toBe("");
  });

  it("plurals", () => {
    expect(countLabel(1, "day")).toBe("1 day");
    expect(countLabel(3, "person", "people")).toBe("3 people");
  });
});

describe("opened on a scope (Cash Position's drill)", () => {
  it("the branch and period off the address; a day that is not one leaves the default", () => {
    const scope = scopeFromSearch(`?branch=${BRANCH}&branchName=Coimbatore+Main&from=2026-10-01&to=2026-10-17`);
    expect(scope).toEqual({ branch: { id: BRANCH, text: "Coimbatore Main" }, fromDate: "2026-10-01", toDate: "2026-10-17" });
    expect(scopeFromSearch(`branch=${BRANCH}`)).toEqual({ branch: { id: BRANCH, text: "" }, fromDate: "", toDate: "" });
    expect(scopeFromSearch(`branch=${BRANCH}&from=2026-02-30&to=17-10-2026`)).toMatchObject({ fromDate: "", toDate: "" });
  });

  it("no branch, no scope", () => {
    expect(scopeFromSearch("")).toBeNull();
    expect(scopeFromSearch("?from=2026-10-01&to=2026-10-17")).toBeNull();
    expect(scopeFromSearch("?branch=%20&branchName=X")).toBeNull();
  });

  it("the four leave the address; anything else stays", () => {
    expect(withoutScopeParams(`?branch=${BRANCH}&branchName=Main&from=2026-10-01&to=2026-10-17`)).toBe("");
    expect(withoutScopeParams(`?tab=safe&branch=${BRANCH}&x=1`)).toBe("?tab=safe&x=1");
    expect(withoutScopeParams("")).toBe("");
  });
});
