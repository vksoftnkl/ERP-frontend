/**
 * Cash Position (menu 289, Sales › Till, till notes 134) — Qt
 * `TillCashPositionEntry` (NexERP 1d3e203..3b5069d, TILL_DESIGN.md §8 S11
 * revision 2; mockup share/till/till_ho_cash_position_rev2_ui_mockup.png,
 * approved 2026-10-17) without the widgets: head office's one page, every
 * store as at the end of the "as on" day.
 *
 *   stores     grid 170, one row per branch · cash in tills = the server's
 *              /till/sessions/expected for each live session of grid 171
 *              (today only — a past day's drawers are closed long since)
 *   exceptions grid 172 · cashiers grid 173 (month to date, the top 5)
 *
 * The four places cash sits: in tills, awaiting receipt (counted, not yet
 * received into the safe), the safe book, in transit to the bank. Every
 * figure is the registered grid's; this module only derives the cells the
 * grid does not send (the till figure, the insured bar, the transit text, an
 * older day still open), totals, pills and tones, and writes the print page
 * and the CSV. The reads are `use-cash-position.ts`; the HO review popup is
 * `ho-review.ts` + `ho-review-dialog.tsx`.
 *
 * Grids 170–173 QUOTE their tokens, so every builder sends every one; an
 * empty `ibranch_id` is every branch. Money is integer paise (`../shared/
 * money.ts`) and prints the Qt way through the reports' `moneyText`.
 */
import { dateTime12Of } from "@/lib/time-format";
import { newestFirst } from "../cash-office/cash-office";
import {
  buildTable,
  cellOutputText,
  countLabel,
  isNumericColumn,
  moneyText,
  type CellView,
  type Pill,
  type PillTone,
  type ReportColumn,
  type ReportSection,
  type RowView,
  type TableView,
} from "../reports/till-reports";
import { ddmmyyyy, displayText, textOf } from "../shared/format";
import { paiseToAmount, toPaise } from "../shared/money";
import type { GridRow, TillSessionPayload } from "../shared/wire/types";

/** The route this screen is governed by (menu 289, under 271 "Till"). */
export const CASH_POSITION_HREF = "/sales/till/cash-position";

export const BUSINESS_DAY_HREF = "/sales/till/business-day";
export const TILL_SESSIONS_HREF = "/sales/till/sessions";
export const TILL_REPORTS_HREF = "/sales/till/reports";

/** Grid 173 is worst first already; the page shows this many. */
export const TOP_CASHIERS = 5;

/** The cash tender of `/till/sessions/expected`. */
export const CASH_TENDER_TYPE_ID = 1;

/** Qt's QTimer: once a minute, and only for today (a past day stands still). */
export const AUTO_REFRESH_MS = 60_000;

export const SEARCH_PLACEHOLDER = "store";
export const EVENTS_HEAD = "Exceptions on the day — every store, newest first";
export const CASHIERS_HEAD = "Cashiers — month-to-date shortage, top 5";

// ─── filters and the grids' tokens ───────────────────────────────────────────

/** The Show combo (Qt `enum Show`). */
export type ShowFilter = "all" | "flagged" | "transit";

export const SHOW_OPTIONS: readonly { value: ShowFilter; label: string }[] = [
  { value: "all", label: "Every store" },
  { value: "flagged", label: "Only flagged" },
  { value: "transit", label: "Only with cash in transit" },
];

export function isShowFilter(value: unknown): value is ShowFilter {
  return SHOW_OPTIONS.some((option) => option.value === value);
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

function isIsoDay(value: string): boolean {
  const match = ISO_DAY.exec(value);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const at = new Date(Date.UTC(y, m - 1, d));
  return at.getUTCFullYear() === y && at.getUTCMonth() === m - 1 && at.getUTCDate() === d;
}

/** The day read (Qt `base()`): an unreadable As-on is today. */
export function asOnDay(asOn: string, today: string): string {
  return isIsoDay(asOn) ? asOn : today;
}

/** `yyyy-MM-01` of the day's month — Till Reports' From when drilled from here. */
export function firstOfMonth(day: string): string {
  return isIsoDay(day) ? `${day.slice(0, 8)}01` : day;
}

type Params = Record<string, string>;

/** Grids 170 / 171 / 172 / 173: `icompany_id`, `ibranch_id` ("" = every branch), `iday`. */
export function positionParams(companyId: string, branchId: string, day: string): Params {
  return { icompany_id: companyId, ibranch_id: branchId, iday: day };
}

/** Under the title: live for today, at the end of a past day. */
export function subtitleText(isToday: boolean, day: string, refreshedAt: Date): string {
  if (isToday) {
    return `Every store, live from the server · as on ${dateTime12Of(refreshedAt)} · read-only except HO reviews`;
  }
  return `Every store at the end of ${ddmmyyyy(day)} · cash in tills is shown for today only`;
}

// ─── numbers ─────────────────────────────────────────────────────────────────

/** A count or a day count as the grid sent it (strings); 0 when it sent nothing readable. */
export function numberOf(row: GridRow | null | undefined, key: string): number {
  const text = textOf(row, key).trim().replace(/,/g, "");
  if (!text) return 0;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function paiseOf(row: GridRow | null | undefined, key: string): number {
  return toPaise(row?.[key]) ?? 0;
}

// ─── cash in tills (grid 171 + /till/sessions/expected) ──────────────────────

/** Σ expected cash per branch, and the live sessions per branch the user may not see. */
export type TillCash = {
  cash: ReadonlyMap<string, number>;
  hidden: ReadonlyMap<string, number>;
};

export const NO_TILL_CASH: TillCash = { cash: new Map(), hidden: new Map() };

/**
 * The cash tender's expected figure of one live session, in paise — or null
 * when the server did not say (no cash tender, or `expected` null: not this
 * user's to see). Qt counts that session as hidden, never as nothing.
 */
export function cashExpectedOf(payload: TillSessionPayload | null | undefined): number | null {
  const tender = payload?.tenders?.find((entry) => entry.tenderTypeId === CASH_TENDER_TYPE_ID);
  if (!tender) return null;
  return toPaise(tender.expected);
}

/** `1 live session whose …` — the tooltip on a till figure some sessions are missing from. */
export function hiddenTillTip(hidden: number): string {
  return `${countLabel(hidden, "live session")} whose expected cash you may not see (Till Sessions Override)`;
}

// ─── the cells grid 170 does not send ────────────────────────────────────────

/**
 * Safe book over the insured limit, 0 … (can exceed 1); null when the safe
 * has no limit, or the book is negative (nothing to draw a bar of — Qt's
 * `-1` covers both).
 */
export function insuredFraction(row: GridRow): number | null {
  const limit = paiseOf(row, "insured_limit");
  if (limit <= 0) return null;
  const fraction = paiseOf(row, "safe_book") / limit;
  return fraction < 0 ? null : fraction;
}

/** `62%`, or blank without a limit. */
export function insuredPercentText(row: GridRow): string {
  const fraction = insuredFraction(row);
  return fraction === null ? "" : `${Math.round(fraction * 100)}%`;
}

export type BarTone = "red" | "amber" | "green";

/** The bar's colour: ≥ 95 % red, ≥ 80 % amber, else green. */
export function insuredTone(fraction: number): BarTone {
  return fraction >= 0.95 ? "red" : fraction >= 0.8 ? "amber" : "green";
}

/** `2,000.00 · 3 d` while cash is on the way, else blank. */
export function transitText(row: GridRow): string {
  const transit = paiseOf(row, "in_transit");
  if (transit <= 0) return "";
  return `${moneyText(transit)} · ${Math.round(numberOf(row, "transit_days"))} d`;
}

/** `16/10 OPEN` when an older day is still open, else the day's status. */
export function dayStatusText(row: GridRow): string {
  const old = textOf(row, "old_open_day");
  return old ? `${displayText(old)} OPEN` : textOf(row, "day_status");
}

/** CLOSED green, OPEN blue, NOT OPEN grey, an older day still open red. */
export function dayStatusTone(text: string): PillTone {
  switch (text) {
    case "CLOSED":
      return "green";
    case "OPEN":
      return "blue";
    case "NOT OPEN":
      return "grey";
    default:
      return "red";
  }
}

/** `today` → ✓ TODAY green; `never` / a date red; blank no pill. */
export function safeCountPill(text: string): Pill[] {
  if (!text) return [];
  if (text === "today") return [{ text: "✓ TODAY", tone: "green" }];
  return [{ text, tone: "red" }];
}

/** The first word of `OK 17-10` … */
export function reviewWord(text: string): string {
  return text.trim().split(" ")[0] ?? "";
}

/** The stores table's HO review pill: OK green, QUERY amber, ESCALATED red, anything else blue. */
export function lastReviewTone(text: string): PillTone {
  switch (reviewWord(text)) {
    case "OK":
      return "green";
    case "QUERY":
      return "amber";
    case "ESCALATED":
      return "red";
    default:
      return "blue";
  }
}

/**
 * Grid 170's rows with the derived cells added (Qt `showStores`): the till
 * figure for a store with live sessions (today only), the insured percent,
 * the transit text, and an older open day in place of the status.
 */
export function storeRows(stores: readonly GridRow[], tillCash: TillCash, isToday: boolean): GridRow[] {
  return stores.map((row) => {
    const id = textOf(row, "branch_id");
    const derived: GridRow = {
      ...row,
      insured_pct: insuredPercentText(row),
      transit_text: transitText(row),
      day_status: dayStatusText(row),
    };
    if (isToday && numberOf(row, "live") > 0) derived.tills_cash = paiseToAmount(tillCash.cash.get(id) ?? 0);
    return derived;
  });
}

// ─── columns ─────────────────────────────────────────────────────────────────

function col(key: string, title: string, kind: ReportColumn["kind"] = "text", total = false): ReportColumn {
  return { key, title, kind, ...(total ? { total } : {}) };
}

export const STORE_COLUMNS: readonly ReportColumn[] = [
  col("branch_name", "Store"),
  col("day_status", "Day"),
  col("live", "Live", "count", true),
  col("tills_cash", "Cash in tills", "money", true),
  col("awaiting", "Awaiting receipt", "money", true),
  col("safe_book", "Safe (book)", "money", true),
  col("insured_pct", "vs insured"),
  col("safe_count", "Safe count"),
  col("transit_text", "In transit"),
  col("var_day", "Var. today", "signed", true),
  col("var_mtd", "Var. MTD", "signed", true),
  col("approvals", "Approvals", "count", true),
  col("last_activity", "Last activity"),
  col("last_review", "HO review"),
];

export const POSITION_EVENT_COLUMNS: readonly ReportColumn[] = [
  col("at_text", "Time"),
  col("branch_name", "Store"),
  col("what", "What"),
];

export const CASHIER_COLUMNS: readonly ReportColumn[] = [
  col("cashier", "Cashier"),
  col("stores", "Store"),
  col("sessions", "Sessions", "count"),
  col("shorts", "Shorts", "count"),
  col("short_total", "Total", "signed"),
  col("recovered", "Recovered", "money"),
];

// ─── the stores table ────────────────────────────────────────────────────────

/** A stores cell: the report cell plus what Qt's delegate paints over it. */
export type StoreCellView = CellView & {
  /** The cell's tooltip: a till figure some sessions are missing from, a flagged store's flags. */
  title?: string;
  /** Amber text (no sign): awaiting receipt, approvals waiting, a safe near its limit. */
  amber?: boolean;
  /** A fill bar before the text (the insured percent). */
  bar?: { fraction: number; tone: BarTone };
};

export type StoreRowView = Omit<RowView, "cells"> & {
  cells: readonly StoreCellView[];
  /** The store's flags, "" for none (the totals row too). */
  flags: string;
};

export type StoreTableView = { columns: readonly ReportColumn[]; rows: readonly StoreRowView[] };

function storePills(key: string, row: GridRow): Pill[] {
  const value = textOf(row, key);
  if (!value) return [];
  if (key === "day_status") return [{ text: value, tone: dayStatusTone(value) }];
  if (key === "safe_count") return safeCountPill(value);
  if (key === "last_review") return [{ text: value, tone: lastReviewTone(value) }];
  return [];
}

const columnAt = (columns: readonly ReportColumn[], key: string) => columns.findIndex((column) => column.key === key);

/**
 * Qt `showStores` + `fillTable`: every store, a totals row "N store(s)", the
 * pills, and the cells the pills cannot say — the insured bar, a hidden till
 * figure's tooltip, "—" where the till figure was not asked, the transit
 * age, approvals and awaiting in amber, a flagged store's flags on its name.
 */
export function storesTable(stores: readonly GridRow[], tillCash: TillCash, isToday: boolean): StoreTableView {
  const rows = storeRows(stores, tillCash, isToday);
  const base = buildTable(STORE_COLUMNS, rows, {
    rowKey: (row, index) => textOf(row, "branch_id") || `#${index}`,
    pills: storePills,
    totalsCaption: (count) => countLabel(count, "store"),
  });
  const cTills = columnAt(STORE_COLUMNS, "tills_cash");
  const cBar = columnAt(STORE_COLUMNS, "insured_pct");
  const cTransit = columnAt(STORE_COLUMNS, "transit_text");
  const cApprovals = columnAt(STORE_COLUMNS, "approvals");
  const cAwaiting = columnAt(STORE_COLUMNS, "awaiting");

  const shown: StoreRowView[] = base.rows.map((view) => {
    if (view.total || !view.row) {
      // The totals row's "Cash in tills" is the server's figure only for today.
      const cells = view.cells.map((cell, at) => (at === cTills && !isToday ? { ...cell, text: "—" } : cell));
      return { ...view, cells, flags: "" };
    }
    const row = view.row;
    const id = textOf(row, "branch_id");
    const flags = textOf(row, "flags");
    const fraction = insuredFraction(row);
    const hidden = tillCash.hidden.get(id) ?? 0;
    const cells = view.cells.map((cell, at): StoreCellView => {
      const extra: StoreCellView = { ...cell };
      if (at === 0 && flags) extra.title = flags;
      if (at === cBar && fraction !== null) {
        extra.bar = { fraction: Math.min(1, fraction), tone: insuredTone(fraction) };
        if (fraction >= 0.95) extra.tone = "red";
        else if (fraction >= 0.8) extra.amber = true;
      }
      if (at === cTills) {
        if (!isToday || numberOf(row, "live") === 0) extra.text = "—";
        else if (hidden > 0) extra.title = hiddenTillTip(hidden);
      }
      if (at === cTransit && numberOf(row, "transit_days") >= 2) extra.tone = "red";
      if (at === cApprovals && numberOf(row, "approvals") > 0) extra.amber = true;
      if (at === cAwaiting && paiseOf(row, "awaiting") > 0) extra.amber = true;
      return extra;
    });
    return { ...view, cells, flags };
  });
  return { columns: STORE_COLUMNS, rows: shown };
}

/**
 * Show (every / flagged / in transit) and the search narrow the stores loaded
 * (Qt `applyFilter`): the name has to contain the words typed, case blind.
 * The totals row always stays, and keeps summing every store.
 */
export function filterStores(table: StoreTableView, show: ShowFilter, needle: string): StoreTableView {
  const words = needle.trim().toLowerCase();
  const rows = table.rows.filter((view) => {
    if (view.total || !view.row) return true;
    if (words && !textOf(view.row, "branch_name").toLowerCase().includes(words)) return false;
    if (show === "flagged") return view.flags !== "";
    if (show === "transit") return paiseOf(view.row, "in_transit") > 0;
    return true;
  });
  return { columns: table.columns, rows };
}

/** The flagged stores, for the red block under the table (Qt `lblFlags`). */
export function flaggedStores(stores: readonly GridRow[]): { store: string; flags: string }[] {
  return stores
    .filter((row) => textOf(row, "flags") !== "")
    .map((row) => ({ store: textOf(row, "branch_name"), flags: textOf(row, "flags") }));
}

// ─── the tiles ───────────────────────────────────────────────────────────────

export type TileTone = "" | "amber" | "red" | "green";

export type Tile = { key: string; caption: string; value: string; tone: TileTone };

/** Qt `fillTiles`: the totals of the stores grid, with the till figure only for today. */
export function tiles(stores: readonly GridRow[], tillCash: TillCash, isToday: boolean): Tile[] {
  let closed = 0;
  let live = 0;
  let approvals = 0;
  let flagged = 0;
  let tills = 0;
  let awaiting = 0;
  let safes = 0;
  let transit = 0;
  let variance = 0;
  for (const row of stores) {
    if (textOf(row, "day_status") === "CLOSED") closed += 1;
    live += Math.round(numberOf(row, "live"));
    tills += tillCash.cash.get(textOf(row, "branch_id")) ?? 0;
    awaiting += paiseOf(row, "awaiting");
    safes += paiseOf(row, "safe_book");
    transit += paiseOf(row, "in_transit");
    variance += paiseOf(row, "var_day");
    approvals += Math.round(numberOf(row, "approvals"));
    if (textOf(row, "flags") !== "") flagged += 1;
  }
  return [
    { key: "stores", caption: "STORES", value: `${stores.length} · ${closed} day-closed`, tone: "" },
    { key: "live", caption: "LIVE SESSIONS", value: String(live), tone: live > 0 ? "amber" : "" },
    { key: "tills", caption: "CASH IN TILLS", value: isToday ? moneyText(tills) : "—", tone: "" },
    { key: "awaiting", caption: "AWAITING RECEIPT", value: moneyText(awaiting), tone: awaiting > 0 ? "amber" : "" },
    { key: "safes", caption: "IN SAFES", value: moneyText(safes), tone: "" },
    { key: "transit", caption: "IN TRANSIT", value: moneyText(transit), tone: "" },
    { key: "all", caption: "ALL CASH", value: moneyText((isToday ? tills : 0) + awaiting + safes + transit), tone: "" },
    {
      key: "variance",
      caption: "VARIANCE TODAY",
      value: moneyText(variance, true),
      tone: variance < 0 ? "red" : variance > 0 ? "green" : "",
    },
    { key: "approvals", caption: "PENDING APPROVALS", value: String(approvals), tone: approvals > 0 ? "amber" : "" },
    {
      key: "flags",
      caption: "FLAGS",
      value: flagged > 0 ? countLabel(flagged, "store") : "none",
      tone: flagged > 0 ? "red" : "green",
    },
  ];
}

// ─── the lower tables ────────────────────────────────────────────────────────

/** Grid 172 newest first (the runner does not keep the SQL's ORDER BY). A module-level function: an effect dependency. */
export const orderEvents = (rows: readonly GridRow[]): GridRow[] => newestFirst(rows, "tev_event_on");

/** Grid 173 is worst first already (Qt takes the first five as sent). */
export function topCashiers(rows: readonly GridRow[]): GridRow[] {
  return rows.slice(0, TOP_CASHIERS);
}

const byIndex = (_row: GridRow, index: number) => String(index);

export function eventsTable(rows: readonly GridRow[]): TableView {
  return buildTable(POSITION_EVENT_COLUMNS, rows, { rowKey: byIndex });
}

export function cashiersTable(rows: readonly GridRow[]): TableView {
  return buildTable(CASHIER_COLUMNS, topCashiers(rows), {
    rowKey: (row, index) => textOf(row, "cashier_id") || `#${index}`,
  });
}

// ─── drill and the buttons ───────────────────────────────────────────────────

/** Enter / double-click: Business Day (274) on the store, its open day when there is one. */
export function businessDayHref(row: GridRow): string {
  const query = new URLSearchParams({ branch: textOf(row, "branch_id") });
  const tbdId = textOf(row, "tbd_id");
  const accYear = textOf(row, "tbd_acc_year");
  if (tbdId) query.set("tbdId", tbdId);
  if (accYear) query.set("accYear", accYear);
  return `${BUSINESS_DAY_HREF}?${query.toString()}`;
}

/** Till Sessions (273) on the store. */
export function sessionsHref(row: GridRow): string {
  return `${TILL_SESSIONS_HREF}?${new URLSearchParams({ branch: textOf(row, "branch_id") }).toString()}`;
}

/** Till Reports (288) on the store, the as-on month to the as-on day. */
export function reportsHref(row: GridRow, day: string): string {
  const query = new URLSearchParams({
    branch: textOf(row, "branch_id"),
    branchName: textOf(row, "branch_name"),
    from: firstOfMonth(day),
    to: day,
  });
  return `${TILL_REPORTS_HREF}?${query.toString()}`;
}

export type ButtonState = { enabled: boolean; title: string };

export const PICK_A_STORE = "Pick a store";

/** Enter Business Day (and the two drill buttons): a picked store. */
export function drillButton(hasStore: boolean, whenOn: string): ButtonState {
  return { enabled: hasStore, title: hasStore ? whenOn : PICK_A_STORE };
}

export const BUSINESS_DAY_TIP = "The store's business day: checklist, numbers, its sessions";
export const REVIEW_TIP = "Head office's verdict on the store's day or one of its sessions";

/** Add HO review…: a picked store AND 289 Create (Qt `refreshButtons`). */
export function reviewButton(hasStore: boolean, canCreate: boolean): ButtonState {
  if (!canCreate) return { enabled: false, title: "Needs Cash Position Create" };
  return { enabled: hasStore, title: hasStore ? REVIEW_TIP : PICK_A_STORE };
}

// ─── print and export ────────────────────────────────────────────────────────

/** `Cash Position — 17-10-2026 · every branch`. */
export function printTitle(day: string, branchText: string): string {
  return `Cash Position — ${ddmmyyyy(day)} · ${branchText || "every branch"}`;
}

/** `cash-position-2026-10-17.csv`. */
export function exportFileName(day: string): string {
  return `cash-position-${day}.csv`;
}

function html(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function tableHtml(section: ReportSection): string {
  const head = section.table.columns
    .map((column) => `<th${isNumericColumn(column) ? ' class="r"' : ""}>${html(column.title)}</th>`)
    .join("");
  const body = section.table.rows
    .map((row) => {
      const cells = row.cells
        .map((cell) => `<td${cell.numeric ? ' class="r"' : ""}>${html(cellOutputText(cell))}</td>`)
        .join("");
      return `<tr${row.total ? ' class="t"' : ""}>${cells}</tr>`;
    })
    .join("");
  return `<h3>${html(section.caption)}</h3><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

export type PrintInput = {
  title: string;
  tiles: readonly Tile[];
  /** The stores as shown (the Show filter and the search applied). */
  stores: TableView;
  flags: readonly { store: string; flags: string }[];
  events: TableView;
  cashiers: TableView;
};

/**
 * The page as shown (Qt `printPage`): landscape, the title, the tiles as
 * "CAPTION: value" on one line, the stores, the flags in red, then the two
 * lower tables under their heads.
 */
export function printPage({ title, tiles: tileList, stores, flags, events, cashiers }: PrintInput): string {
  const style =
    "@page{size:A4 landscape;margin:10mm}" +
    "body{font:8pt Arial,Helvetica,sans-serif;color:#000;margin:0}" +
    "h2{font-size:11pt;margin:0 0 6px}h3{font-size:9pt;margin:10px 0 4px}p{margin:0 0 6px}" +
    "table{width:100%;border-collapse:collapse}" +
    "th,td{border:1px solid #888;padding:2px 4px;text-align:left;vertical-align:top}" +
    "th{background:#eee}.r{text-align:right}tr.t td{font-weight:bold;background:#f4f4f4}" +
    ".flags{color:#B91C1C}thead{display:table-header-group}tr{break-inside:avoid}";
  const tilesLine = tileList.map((tile) => `${html(tile.caption)}: <b>${html(tile.value)}</b>`).join(" · ");
  const flagsBlock =
    flags.length === 0
      ? ""
      : `<p class="flags">${flags.map((entry) => `<b>${html(entry.store)}</b> — ${html(entry.flags)}`).join("<br>")}</p>`;
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>${html(title)}</title><style>${style}</style></head>` +
    `<body><h2>${html(title)}</h2><p>${tilesLine}</p>` +
    tableHtml({ caption: "Stores", table: stores }) +
    flagsBlock +
    tableHtml({ caption: EVENTS_HEAD, table: events }) +
    tableHtml({ caption: CASHIERS_HEAD, table: cashiers }) +
    "</body></html>"
  );
}
