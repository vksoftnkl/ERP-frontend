import { describe, expect, it } from "vitest";
import type { GridRow, TillSessionPayload } from "../shared/wire/types";
import {
  CASHIER_COLUMNS,
  NO_TILL_CASH,
  POSITION_EVENT_COLUMNS,
  STORE_COLUMNS,
  asOnDay,
  businessDayHref,
  cashExpectedOf,
  cashiersTable,
  dayStatusText,
  dayStatusTone,
  drillButton,
  eventsTable,
  exportFileName,
  filterStores,
  firstOfMonth,
  flaggedStores,
  hiddenTillTip,
  insuredFraction,
  insuredPercentText,
  insuredTone,
  lastReviewTone,
  numberOf,
  orderEvents,
  positionParams,
  printPage,
  printTitle,
  reportsHref,
  reviewButton,
  safeCountPill,
  sessionsHref,
  storeRows,
  storesTable,
  subtitleText,
  tiles,
  topCashiers,
  transitText,
  type TillCash,
} from "./cash-position";

const COMPANY = "019c8ea6-19e9-78a8-b15f-749e1cde7292";
const CBE = "019c8ea7-b0f5-72d5-96a5-1abfc80cc8ab";
const MDU = "01a13e21-416e-7f58-b301-da9f82d61578";
const TODAY = "2026-10-17";

const store = (patch: GridRow = {}): GridRow => ({
  branch_id: CBE,
  branch_name: "Acme Foods - Coimbatore Branch",
  day_status: "OPEN",
  tbd_id: "day-1",
  tbd_acc_year: "2026-2027",
  old_open_day: "",
  live: "1",
  over_hours: "0",
  longest_hours: "3.5",
  max_hours: "10",
  awaiting: "6500.00",
  safe_book: "-8000.00",
  insured_limit: "0.00",
  safes: "1",
  oldest_count_on: null,
  safe_count: "never",
  in_transit: "0.00",
  transit_days: "0",
  var_day: "0.00",
  var_mtd: "-120.00",
  approvals: "0",
  last_at: null,
  last_activity: "02:10 PM hand-over",
  last_review: "",
  flags: "safe last counted: never",
  ...patch,
});

const madurai = (): GridRow =>
  store({
    branch_id: MDU,
    branch_name: "Acme Foods - Madurai",
    day_status: "CLOSED",
    tbd_id: "",
    tbd_acc_year: "",
    live: "0",
    awaiting: "0.00",
    safe_book: "45000.00",
    insured_limit: "50000.00",
    safe_count: "today",
    in_transit: "12000.00",
    transit_days: "3",
    var_day: "250.00",
    var_mtd: "250.00",
    approvals: "2",
    last_review: "QUERY 16-10",
    flags: "",
  });

const tillCash = (cash: [string, number][], hidden: [string, number][] = []): TillCash => ({
  cash: new Map(cash),
  hidden: new Map(hidden),
});

const cellAt = (table: { columns: readonly { key: string }[]; rows: readonly { cells: readonly unknown[] }[] }, row: number, key: string) =>
  table.rows[row].cells[table.columns.findIndex((column) => column.key === key)];

describe("the day read and the tokens", () => {
  it("sends every quoted token; an empty branch is every branch", () => {
    expect(positionParams(COMPANY, "", TODAY)).toEqual({ icompany_id: COMPANY, ibranch_id: "", iday: TODAY });
    expect(positionParams(COMPANY, CBE, "2026-10-01").ibranch_id).toBe(CBE);
  });

  it("an unreadable As-on is today", () => {
    expect(asOnDay("", TODAY)).toBe(TODAY);
    expect(asOnDay("2026-02-30", TODAY)).toBe(TODAY);
    expect(asOnDay("2026-10-16", TODAY)).toBe("2026-10-16");
  });

  it("the first of the as-on month opens Till Reports", () => {
    expect(firstOfMonth("2026-10-17")).toBe("2026-10-01");
    expect(firstOfMonth("junk")).toBe("junk");
  });

  it("the subtitle: live for today, at the end of a past day", () => {
    const at = new Date(2026, 9, 17, 14, 5);
    expect(subtitleText(true, TODAY, at)).toBe(
      "Every store, live from the server · as on 17-10-2026 02:05 PM · read-only except HO reviews",
    );
    expect(subtitleText(false, "2026-10-16", at)).toBe(
      "Every store at the end of 16-10-2026 · cash in tills is shown for today only",
    );
  });

  it("counts arrive as strings", () => {
    expect(numberOf({ live: "3" }, "live")).toBe(3);
    expect(numberOf({ live: "1,200" }, "live")).toBe(1200);
    expect(numberOf({ live: null }, "live")).toBe(0);
    expect(numberOf({ live: "x" }, "live")).toBe(0);
  });
});

describe("cash in tills", () => {
  const payload = (tenders: { tenderTypeId: number; expected: number | null }[]) =>
    ({ tenders }) as unknown as TillSessionPayload;

  it("is the cash tender's expected figure in paise", () => {
    expect(cashExpectedOf(payload([{ tenderTypeId: 2, expected: 10 }, { tenderTypeId: 1, expected: 1500 }]))).toBe(150_000);
  });

  it("is hidden when the server did not say", () => {
    expect(cashExpectedOf(payload([{ tenderTypeId: 1, expected: null }]))).toBeNull();
    expect(cashExpectedOf(payload([{ tenderTypeId: 2, expected: 10 }]))).toBeNull();
    expect(cashExpectedOf(null)).toBeNull();
  });

  it("the tooltip counts the hidden sessions", () => {
    expect(hiddenTillTip(1)).toBe("1 live session whose expected cash you may not see (Till Sessions Override)");
    expect(hiddenTillTip(2)).toBe("2 live sessions whose expected cash you may not see (Till Sessions Override)");
  });
});

describe("the derived cells", () => {
  it("insured: the book over the limit, blank without a limit or below zero", () => {
    expect(insuredFraction(madurai())).toBeCloseTo(0.9);
    expect(insuredPercentText(madurai())).toBe("90%");
    expect(insuredFraction(store())).toBeNull();
    expect(insuredPercentText(store())).toBe("");
    expect(insuredFraction(store({ insured_limit: "10000.00" }))).toBeNull(); // a negative book draws no bar
    expect(insuredPercentText(store({ safe_book: "4800.00", insured_limit: "10000.00" }))).toBe("48%");
  });

  it("the bar's colour: 95 red, 80 amber, else green", () => {
    expect(insuredTone(0.95)).toBe("red");
    expect(insuredTone(0.8)).toBe("amber");
    expect(insuredTone(0.79)).toBe("green");
  });

  it("in transit: money and days, or blank", () => {
    expect(transitText(madurai())).toBe("12,000.00 · 3 d");
    expect(transitText(store())).toBe("");
  });

  it("an older day still open replaces the status", () => {
    expect(dayStatusText(store())).toBe("OPEN");
    expect(dayStatusText(store({ old_open_day: "16-10" }))).toBe("16-10 OPEN");
  });

  it("the day pill's tone", () => {
    expect(dayStatusTone("CLOSED")).toBe("green");
    expect(dayStatusTone("OPEN")).toBe("blue");
    expect(dayStatusTone("NOT OPEN")).toBe("grey");
    expect(dayStatusTone("16-10 OPEN")).toBe("red");
  });

  it("the safe count pill", () => {
    expect(safeCountPill("today")).toEqual([{ text: "✓ TODAY", tone: "green" }]);
    expect(safeCountPill("never")).toEqual([{ text: "never", tone: "red" }]);
    expect(safeCountPill("14-10")).toEqual([{ text: "14-10", tone: "red" }]);
    expect(safeCountPill("")).toEqual([]);
  });

  it("the HO review pill goes by the first word", () => {
    expect(lastReviewTone("OK 17-10")).toBe("green");
    expect(lastReviewTone("QUERY 16-10")).toBe("amber");
    expect(lastReviewTone("ESCALATED 15-10")).toBe("red");
    expect(lastReviewTone("BANK_MATCHED 15-10")).toBe("blue");
  });

  it("storeRows adds the till figure for a live store today only", () => {
    const rows = storeRows([store(), madurai()], tillCash([[CBE, 150_000]]), true);
    expect(rows[0].tills_cash).toBe("1500.00");
    expect(rows[0].insured_pct).toBe("");
    expect(rows[1].tills_cash).toBeUndefined(); // no live session
    expect(rows[1].insured_pct).toBe("90%");
    expect(rows[1].transit_text).toBe("12,000.00 · 3 d");
    expect(storeRows([store()], tillCash([[CBE, 150_000]]), false)[0].tills_cash).toBeUndefined();
  });
});

describe("the stores table", () => {
  it("has Qt's fourteen columns and a totals row", () => {
    expect(STORE_COLUMNS.map((column) => column.title)).toEqual([
      "Store",
      "Day",
      "Live",
      "Cash in tills",
      "Awaiting receipt",
      "Safe (book)",
      "vs insured",
      "Safe count",
      "In transit",
      "Var. today",
      "Var. MTD",
      "Approvals",
      "Last activity",
      "HO review",
    ]);
    const table = storesTable([store(), madurai()], tillCash([[CBE, 150_000]]), true);
    expect(table.rows).toHaveLength(3);
    const totals = table.rows[2];
    expect(totals.total).toBe(true);
    expect(totals.cells[0].text).toBe("2 stores");
    expect(cellAt(table, 2, "live")).toMatchObject({ text: "1" });
    expect(cellAt(table, 2, "tills_cash")).toMatchObject({ text: "1,500.00" });
    expect(cellAt(table, 2, "awaiting")).toMatchObject({ text: "6,500.00" });
    expect(cellAt(table, 2, "safe_book")).toMatchObject({ text: "37,000.00" });
    expect(cellAt(table, 2, "var_day")).toMatchObject({ text: "+250.00", tone: "green" });
    expect(cellAt(table, 2, "approvals")).toMatchObject({ text: "2" });
  });

  it("the live box's figures: 1 live, 1,500 in tills, 6,500 awaiting, −8,000 in the safe", () => {
    const table = storesTable([store()], tillCash([[CBE, 150_000]]), true);
    expect(cellAt(table, 0, "live")).toMatchObject({ text: "1" });
    expect(cellAt(table, 0, "tills_cash")).toMatchObject({ text: "1,500.00" });
    expect(cellAt(table, 0, "awaiting")).toMatchObject({ text: "6,500.00", amber: true });
    expect(cellAt(table, 0, "safe_book")).toMatchObject({ text: "−8,000.00" });
  });

  it("yesterday: the till figure is not asked, on the rows and the totals", () => {
    const table = storesTable([store()], NO_TILL_CASH, false);
    expect(cellAt(table, 0, "tills_cash")).toMatchObject({ text: "—" });
    expect(cellAt(table, 1, "tills_cash")).toMatchObject({ text: "—" });
  });

  it("a store with nothing live shows no till figure; a hidden session gets the tooltip", () => {
    const table = storesTable([madurai(), store()], tillCash([[CBE, 0]], [[CBE, 1]]), true);
    expect(cellAt(table, 0, "tills_cash")).toMatchObject({ text: "—" });
    expect(cellAt(table, 1, "tills_cash")).toMatchObject({ text: "0.00", title: hiddenTillTip(1) });
  });

  it("pills: the day, the safe count, the HO review", () => {
    const table = storesTable([store({ old_open_day: "16-10" }), madurai()], NO_TILL_CASH, true);
    expect(cellAt(table, 0, "day_status")).toMatchObject({ pills: [{ text: "16-10 OPEN", tone: "red" }] });
    expect(cellAt(table, 0, "safe_count")).toMatchObject({ pills: [{ text: "never", tone: "red" }] });
    expect(cellAt(table, 1, "day_status")).toMatchObject({ pills: [{ text: "CLOSED", tone: "green" }] });
    expect(cellAt(table, 1, "safe_count")).toMatchObject({ pills: [{ text: "✓ TODAY", tone: "green" }] });
    expect(cellAt(table, 1, "last_review")).toMatchObject({ pills: [{ text: "QUERY 16-10", tone: "amber" }] });
    expect(cellAt(table, 0, "last_review")).toMatchObject({ pills: [] });
  });

  it("the bar, the transit age, approvals and the flags", () => {
    const table = storesTable([store(), madurai()], NO_TILL_CASH, true);
    expect(cellAt(table, 0, "insured_pct")).toMatchObject({ text: "" });
    expect(cellAt(table, 0, "insured_pct")).not.toHaveProperty("bar");
    expect(cellAt(table, 1, "insured_pct")).toMatchObject({ text: "90%", amber: true });
    expect((cellAt(table, 1, "insured_pct") as { bar: { fraction: number; tone: string } }).bar).toMatchObject({
      tone: "amber",
    });
    expect(cellAt(table, 1, "transit_text")).toMatchObject({ text: "12,000.00 · 3 d", tone: "red" });
    expect(cellAt(table, 1, "approvals")).toMatchObject({ text: "2", amber: true });
    expect(cellAt(table, 0, "branch_name")).toMatchObject({ title: "safe last counted: never" });
    expect(table.rows[0].flags).toBe("safe last counted: never");
    expect(table.rows[1].flags).toBe("");
    expect(cellAt(table, 1, "branch_name")).not.toHaveProperty("title");
  });

  it("a safe over 95 % of its limit is red, a bar never exceeds full", () => {
    const table = storesTable([{ ...madurai(), safe_book: "60000.00" }], NO_TILL_CASH, true);
    const cell = cellAt(table, 0, "insured_pct") as { text: string; tone: string; bar: { fraction: number; tone: string } };
    expect(cell.text).toBe("120%");
    expect(cell.tone).toBe("red");
    expect(cell.bar).toEqual({ fraction: 1, tone: "red" });
  });

  it("Show and the search narrow the rows; the totals row stays and keeps summing every store", () => {
    const table = storesTable([store(), madurai()], NO_TILL_CASH, true);
    const transit = filterStores(table, "transit", "");
    expect(transit.rows.map((row) => row.key)).toEqual([MDU, "__total"]);
    expect(transit.rows[1].cells[0].text).toBe("2 stores");
    expect(filterStores(table, "flagged", "").rows.map((row) => row.key)).toEqual([CBE, "__total"]);
    expect(filterStores(table, "all", "coimba").rows.map((row) => row.key)).toEqual([CBE, "__total"]);
    expect(filterStores(table, "flagged", "madurai").rows.map((row) => row.key)).toEqual(["__total"]);
    expect(filterStores(table, "all", "").rows).toHaveLength(3);
  });

  it("the flagged stores, spelled out", () => {
    expect(flaggedStores([store(), madurai()])).toEqual([
      { store: "Acme Foods - Coimbatore Branch", flags: "safe last counted: never" },
    ]);
  });
});

describe("the tiles", () => {
  it("are the totals of the stores grid", () => {
    const list = tiles([store(), madurai()], tillCash([[CBE, 150_000]]), true);
    const byKey = Object.fromEntries(list.map((tile) => [tile.key, tile]));
    expect(list.map((tile) => tile.caption)).toEqual([
      "STORES",
      "LIVE SESSIONS",
      "CASH IN TILLS",
      "AWAITING RECEIPT",
      "IN SAFES",
      "IN TRANSIT",
      "ALL CASH",
      "VARIANCE TODAY",
      "PENDING APPROVALS",
      "FLAGS",
    ]);
    expect(byKey.stores).toMatchObject({ value: "2 · 1 day-closed", tone: "" });
    expect(byKey.live).toMatchObject({ value: "1", tone: "amber" });
    expect(byKey.tills).toMatchObject({ value: "1,500.00", tone: "" });
    expect(byKey.awaiting).toMatchObject({ value: "6,500.00", tone: "amber" });
    expect(byKey.safes).toMatchObject({ value: "37,000.00" });
    expect(byKey.transit).toMatchObject({ value: "12,000.00" });
    expect(byKey.all).toMatchObject({ value: "57,000.00" }); // 1,500 + 6,500 + 37,000 + 12,000
    expect(byKey.variance).toMatchObject({ value: "+250.00", tone: "green" });
    expect(byKey.approvals).toMatchObject({ value: "2", tone: "amber" });
    expect(byKey.flags).toMatchObject({ value: "1 store", tone: "red" });
  });

  it("the live box alone: all cash = 1,500 + 6,500 − 8,000 = 0.00", () => {
    const byKey = Object.fromEntries(tiles([store()], tillCash([[CBE, 150_000]]), true).map((tile) => [tile.key, tile]));
    expect(byKey.all.value).toBe("0.00");
    expect(byKey.variance).toMatchObject({ value: "0.00", tone: "" });
  });

  it("yesterday: no till figure, and none in all cash", () => {
    const byKey = Object.fromEntries(tiles([store()], NO_TILL_CASH, false).map((tile) => [tile.key, tile]));
    expect(byKey.tills.value).toBe("—");
    expect(byKey.all.value).toBe("−1,500.00");
  });

  it("no store flagged is green; a short day red", () => {
    const byKey = Object.fromEntries(
      tiles([madurai(), { ...madurai(), var_day: "-900.00" }], NO_TILL_CASH, true).map((tile) => [tile.key, tile]),
    );
    expect(byKey.flags).toMatchObject({ value: "none", tone: "green" });
    expect(byKey.variance).toMatchObject({ value: "−650.00", tone: "red" });
    expect(byKey.live).toMatchObject({ value: "0", tone: "" });
  });
});

describe("the lower tables", () => {
  it("events newest first, Time · Store · What", () => {
    expect(POSITION_EVENT_COLUMNS.map((column) => column.title)).toEqual(["Time", "Store", "What"]);
    const rows = orderEvents([
      { tev_event_on: "2026-10-17T08:00:00.000Z", what: "early" },
      { tev_event_on: "2026-10-17T12:00:00.000Z", what: "late" },
    ]);
    expect(rows.map((row) => row.what)).toEqual(["late", "early"]);
    const table = eventsTable([{ at_text: "02:10 PM", branch_name: "Acme", what: "Force closed ZT2" }]);
    expect(table.rows[0].cells.map((cell) => cell.text)).toEqual(["02:10 PM", "Acme", "Force closed ZT2"]);
    expect(table.rows.some((row) => row.total)).toBe(false);
  });

  it("cashiers: the first five as sent, signed total, money recovered", () => {
    expect(CASHIER_COLUMNS.map((column) => column.title)).toEqual(["Cashier", "Store", "Sessions", "Shorts", "Total", "Recovered"]);
    const rows = Array.from({ length: 7 }, (_, index) => ({
      cashier_id: `c${index}`,
      cashier: `Cashier ${index}`,
      stores: "Acme",
      sessions: "4",
      shorts: index === 0 ? "2" : "0",
      short_total: index === 0 ? "-300.00" : "0.00",
      recovered: "100.00",
    }));
    expect(topCashiers(rows)).toHaveLength(5);
    const table = cashiersTable(rows);
    expect(table.rows).toHaveLength(5);
    expect(table.rows[0].key).toBe("c0");
    expect(table.rows[0].cells.map((cell) => cell.text)).toEqual(["Cashier 0", "Acme", "4", "2", "−300.00", "100.00"]);
    expect(table.rows[0].cells[4].tone).toBe("red");
    expect(table.rows[1].cells[3].text).toBe(""); // a count of 0 is blank
  });
});

describe("drill and the buttons", () => {
  it("Business Day on the store, its open day when there is one", () => {
    expect(businessDayHref(store())).toBe(`/sales/till/business-day?branch=${CBE}&tbdId=day-1&accYear=2026-2027`);
    expect(businessDayHref(madurai())).toBe(`/sales/till/business-day?branch=${MDU}`);
  });

  it("Till Sessions and Till Reports on the store", () => {
    expect(sessionsHref(store())).toBe(`/sales/till/sessions?branch=${CBE}`);
    expect(reportsHref(store(), TODAY)).toBe(
      `/sales/till/reports?branch=${CBE}&branchName=Acme+Foods+-+Coimbatore+Branch&from=2026-10-01&to=2026-10-17`,
    );
  });

  it("the drill buttons need a picked store", () => {
    expect(drillButton(false, "tip")).toEqual({ enabled: false, title: "Pick a store" });
    expect(drillButton(true, "tip")).toEqual({ enabled: true, title: "tip" });
  });

  it("Add HO review needs 289 Create and a picked store", () => {
    expect(reviewButton(true, false)).toEqual({ enabled: false, title: "Needs Cash Position Create" });
    expect(reviewButton(false, true)).toEqual({ enabled: false, title: "Pick a store" });
    expect(reviewButton(true, true)).toEqual({
      enabled: true,
      title: "Head office's verdict on the store's day or one of its sessions",
    });
  });
});

describe("print and export", () => {
  it("the title and the file name", () => {
    expect(printTitle(TODAY, "")).toBe("Cash Position — 17-10-2026 · every branch");
    expect(printTitle(TODAY, "Acme Foods - Madurai")).toBe("Cash Position — 17-10-2026 · Acme Foods - Madurai");
    expect(exportFileName(TODAY)).toBe("cash-position-2026-10-17.csv");
  });

  it("the page as shown: title, tiles, stores, flags in red, the two lower tables", () => {
    const stores = storesTable([store(), madurai()], tillCash([[CBE, 150_000]]), true);
    const page = printPage({
      title: printTitle(TODAY, ""),
      tiles: tiles([store(), madurai()], tillCash([[CBE, 150_000]]), true),
      stores: filterStores(stores, "flagged", ""),
      flags: flaggedStores([store(), madurai()]),
      events: eventsTable([{ at_text: "02:10 PM", branch_name: "Acme <b>", what: "x" }]),
      cashiers: cashiersTable([]),
    });
    expect(page).toContain("<h2>Cash Position — 17-10-2026 · every branch</h2>");
    expect(page).toContain("STORES: <b>2 · 1 day-closed</b> · LIVE SESSIONS: <b>1</b>");
    expect(page).toContain("<h3>Stores</h3>");
    expect(page).toContain('<td class="r">1,500.00</td>');
    expect(page).not.toContain("Madurai</td>"); // the Show filter applied
    expect(page).toContain('<tr class="t"><td>2 stores</td>');
    expect(page).toContain('<p class="flags"><b>Acme Foods - Coimbatore Branch</b> — safe last counted: never</p>');
    expect(page).toContain("<h3>Exceptions on the day — every store, newest first</h3>");
    expect(page).toContain("Acme &lt;b&gt;");
    expect(page).toContain("<h3>Cashiers — month-to-date shortage, top 5</h3>");
    expect(page.indexOf("<h3>Stores</h3>")).toBeLessThan(page.indexOf('<p class="flags">'));
    expect(page.indexOf('<p class="flags">')).toBeLessThan(page.indexOf("<h3>Exceptions"));
    expect(page).toContain("size:A4 landscape");
  });

  it("a pill cell prints its own text, the pill's only when it has none (Qt tableHtml)", () => {
    const stores = storesTable([madurai()], NO_TILL_CASH, true);
    const page = printPage({
      title: "t",
      tiles: [],
      stores,
      flags: [],
      events: eventsTable([]),
      cashiers: cashiersTable([]),
    });
    expect(page).toContain("<td>CLOSED</td>");
    expect(page).toContain("<td>today</td>");
    expect(page).toContain("<td>QUERY 16-10</td>");
  });
});
