/**
 * The quick rate popup (Ctrl+R, notes 146) — Qt `QuickRateDialog`
 * (inventory/stock/sellingprice/quick_rate_dialog.cpp), the pure half.
 *
 * ONE item's selling rates, changed without leaving a bill or the item list.
 * It is menu 30 (Change Selling Price) for one item, on the same routes:
 * `GET /stock/price-bulk?itemId=` is the grid (one row per unit × MRP bucket),
 * `POST /stock/price-bulk` saves the changed rows — so the below-cost confirm,
 * dated prices and the Price Change Log come with it, and the two screens can
 * never disagree about a price.
 *
 *  - Only the ACTIVE price levels are shown (Price Level master, ids 1..4 =
 *    price A..D, active and not deleted; none → all four "Price A..D"). A
 *    hidden level is sent back as loaded.
 *  - Per shown level the item card's three cells: Profit % | W/o tax | Price.
 *      Profit %  → w/o tax = cost w/o tax × (1 + p%) → price = round-off(w/o tax × taxFactor)
 *      W/o tax   → price = round-off(typed × taxFactor)
 *      Price     → as typed
 *    taxFactor = 1 + tax% when the prices include tax, else 1. A DERIVED price
 *    takes the row's round-off; a typed one is the price.
 *  - Cost and cost w/o tax are editable only where the cost shown IS the price
 *    row's own (costBasis PRICE_ROW, notes 147 B) and are then sent as
 *    `costPrice`; a stock average (ITEM / MRP) comes from inward.
 *  - From a bill line only the line's unit is shown; "Show all units" brings
 *    the rest.
 *
 * No React, no DOM: everything here is a function of the loaded rows and what
 * was typed, so the vitest file next to it pins the Qt arithmetic.
 */
import { formatCurrency } from "@/domain/pricing";
import {
  changeText,
  dateText,
  deviceText,
  sourceLabel,
  timeText,
  whoText,
} from "@/features/reports/price-change-log/view/words";
import type { PriceLogRow } from "@/features/reports/price-change-log/wire/types";
import { LEVEL_COUNT, LEVEL_LETTERS, SELLING_PRICE_MENU_ID } from "./selling-price.constants";
import { applyRoundOff, exclusiveOfTax, markupOf, round2, toNum } from "./selling-price.math";
import type {
  ItemInwardRow,
  PriceLevelMasterRow,
  PriceScope,
  SaveSellingPriceBulkPayload,
  SaveSellingPriceRow,
  SellingPriceRow,
  SellingPriceSaveResult,
} from "./selling-price.types";
import type { BelowCostLine } from "./selling-price.payload";

export const DASH = "—";
const MINUS = "−";
/** A change smaller than this is no change (Qt's 0.005 everywhere). */
const EPSILON = 0.005;

function text(value: unknown): string {
  return typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
}

/** Two places, grouped (Qt `NexNumberFormat::formatCurrency(v, 2, true)`). */
export function money(value: number): string {
  return formatCurrency(value, 2, true);
}

/** Qt `PriceLogView::numberText`: whole figures bare, the rest at two places; "—" for none. */
export function figureText(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return DASH;
  }
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    return text(value);
  }
  const whole = Math.abs(n - Math.round(n)) < EPSILON;
  if (whole && Math.round(n) === 0) {
    return "0";
  }
  return formatCurrency(n, whole ? 0 : 2, true);
}

/** `YYYY-MM-DD…` → `dd/MM/yyyy`; anything else as it came. */
export function ddmmyyyy(iso: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text(iso));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : text(iso);
}

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

/** One shown level: `id` 1..4 (= price A..D), and the master's name for it. */
export type QuickRateLevel = { id: number; name: string };

function fallbackName(id: number): string {
  return `Price ${LEVEL_LETTERS[id - 1] ?? id}`;
}

/**
 * The levels the popup shows — the item card's source, the Price Level master:
 * ids 1..4, active (missing = on) and not deleted, in id order. None (or the
 * master not readable) → all four, "Price A".."Price D" (Qt `loadLevels`).
 */
export function activeLevels(rows: readonly PriceLevelMasterRow[] | null | undefined): QuickRateLevel[] {
  const byId = new Map<number, string>();
  for (const row of rows ?? []) {
    const id = Number(row?.priceLvlId);
    if (!Number.isInteger(id) || id < 1 || id > LEVEL_COUNT) continue;
    if (row.priceLvlIsActive === false || row.priceLvlIsDeleted === true) continue;
    byId.set(id, text(row.priceLvlName).trim() || fallbackName(id));
  }
  const levels = [...byId.entries()].sort((a, b) => a[0] - b[0]).map(([id, name]) => ({ id, name }));
  if (levels.length > 0) {
    return levels;
  }
  return Array.from({ length: LEVEL_COUNT }, (_, index) => ({ id: index + 1, name: fallbackName(index + 1) }));
}

/** A level's name for a message — every level, shown or not. */
export function levelName(levels: readonly QuickRateLevel[], id: number): string {
  return levels.find((level) => level.id === id)?.name ?? fallbackName(id);
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

/** One grid row: the price-bulk row as loaded, and what the operator has made of it. */
export type QuickRateRow = {
  source: SellingPriceRow;
  /** Current price of levels 1..4 (index 0..3) — hidden levels stay as loaded. */
  prices: number[];
  /** Current min price. */
  min: number;
  /** Current cost, tax inclusive. */
  cost: number;
};

/** The loaded price of one level (1..4); 0 when the row has none. */
export function baselinePrice(source: SellingPriceRow, level: number): number {
  for (const value of source.levels ?? []) {
    if (toNum(value?.level) === level) {
      return toNum(value.price);
    }
  }
  return 0;
}

export function rowFromGrid(source: SellingPriceRow): QuickRateRow {
  const prices: number[] = [];
  for (let level = 1; level <= LEVEL_COUNT; level += 1) {
    prices.push(baselinePrice(source, level));
  }
  return { source, prices, min: toNum(source.minPrice), cost: toNum(source.costRate) };
}

export function rowsFromGrid(items: readonly SellingPriceRow[] | null | undefined): QuickRateRow[] {
  return (items ?? []).map(rowFromGrid);
}

/** 1 + tax% when the row's prices include tax (missing = they do), else 1. */
export function taxFactor(row: QuickRateRow): number {
  return row.source.inclTax !== false ? 1 + toNum(row.source.taxPerc) / 100 : 1;
}

/**
 * The cost profit is measured on: the row's cost WITHOUT tax. As loaded, the
 * server's own w/o-tax figure; once the cost is typed, cost ÷ taxFactor.
 */
export function costWotOf(row: QuickRateRow): number {
  const loadedCost = toNum(row.source.costRate);
  const loadedWot = toNum(row.source.costWot);
  if (Math.abs(row.cost - loadedCost) < EPSILON && loadedWot > 0) {
    return loadedWot;
  }
  return row.cost / taxFactor(row);
}

/** The cost shown IS the price row's own (an item with no stock yet) — editable, notes 147 B. */
export function ownsCost(row: QuickRateRow): boolean {
  return text(row.source.costBasis) === "PRICE_ROW";
}

export function costChanged(row: QuickRateRow): boolean {
  return Math.abs(row.cost - toNum(row.source.costRate)) >= EPSILON;
}

export function isRowChanged(row: QuickRateRow): boolean {
  if (Math.abs(row.min - toNum(row.source.minPrice)) >= EPSILON || costChanged(row)) {
    return true;
  }
  for (let level = 1; level <= LEVEL_COUNT; level += 1) {
    if (Math.abs((row.prices[level - 1] ?? 0) - baselinePrice(row.source, level)) >= EPSILON) {
      return true;
    }
  }
  return false;
}

export function changedRowCount(rows: readonly QuickRateRow[]): number {
  return rows.filter(isRowChanged).length;
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

export type QuickRateColumnKind =
  | "unit"
  | "mrp"
  | "stock"
  | "costWot"
  | "cost"
  | "profit"
  | "wot"
  | "price"
  | "min";

export type QuickRateColumn = {
  kind: QuickRateColumnKind;
  /** The level (1..4) of a profit / wot / price column. */
  level?: number;
  header: string;
};

/**
 * The item card's price grid: Unit, MRP, Stock, Cost w/o tax, Cost, then per
 * shown level Profit % | W/o tax | Price (under the level's band), then Min.
 */
export function quickRateColumns(levels: readonly QuickRateLevel[]): QuickRateColumn[] {
  const columns: QuickRateColumn[] = [
    { kind: "unit", header: "Unit" },
    { kind: "mrp", header: "MRP" },
    { kind: "stock", header: "Stock" },
    { kind: "costWot", header: "Cost w/o tax" },
    { kind: "cost", header: "Cost" },
  ];
  for (const level of levels) {
    columns.push({ kind: "profit", level: level.id, header: "Profit %" });
    columns.push({ kind: "wot", level: level.id, header: "W/o tax" });
    columns.push({ kind: "price", level: level.id, header: "Price" });
  }
  columns.push({ kind: "min", header: "Min" });
  return columns;
}

/** The column the cursor starts on: the first shown level's Price (Min with no level). */
export function startColumnIndex(columns: readonly QuickRateColumn[]): number {
  const price = columns.findIndex((column) => column.kind === "price");
  return price >= 0 ? price : columns.findIndex((column) => column.kind === "min");
}

/** A cell the operator may type in. Nothing is, without the Edit right on menu 30. */
export function isCellEditable(row: QuickRateRow, column: QuickRateColumn, editable: boolean): boolean {
  if (!editable) {
    return false;
  }
  switch (column.kind) {
    case "cost":
    case "costWot":
      return ownsCost(row);
    case "profit":
    case "wot":
    case "price":
    case "min":
      return true;
    default:
      return false;
  }
}

/** A cell that takes the keyboard at all (typed in, or read through the live line). */
export function isCellFocusable(column: QuickRateColumn): boolean {
  return column.kind !== "unit" && column.kind !== "mrp" && column.kind !== "stock";
}

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

/** A typed figure: commas dropped; null for nothing or not a number (the cell is left alone). */
export function parseTyped(raw: string): number | null {
  const trimmed = raw.replace(/,/g, "").trim();
  if (!trimmed) {
    return null;
  }
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/**
 * One cell committed (Qt `onCellEdited`). Any of a level's three cells sets
 * its price; a cost typed with or without tax sets the cost; Min sets Min.
 * The tax factor and cost w/o tax are the row's BEFORE the edit.
 */
export function applyCellEdit(row: QuickRateRow, column: QuickRateColumn, typed: number): QuickRateRow {
  const roundOff = toNum(row.source.roundOff);
  const tf = taxFactor(row);
  const cw = costWotOf(row);
  const level = column.level ?? 0;
  const withPrice = (price: number): QuickRateRow => {
    const prices = [...row.prices];
    prices[level - 1] = price;
    return { ...row, prices };
  };
  switch (column.kind) {
    case "cost":
      return { ...row, cost: round2(typed) };
    case "costWot":
      return { ...row, cost: round2(typed * tf) };
    case "min":
      return { ...row, min: round2(typed) };
    case "price":
      return level > 0 ? withPrice(round2(typed)) : row;
    case "wot":
      return level > 0 ? withPrice(round2(applyRoundOff(typed * tf, roundOff))) : row;
    case "profit":
      // No cost, no profit to price from.
      return level > 0 && cw > 0 ? withPrice(round2(applyRoundOff(cw * (1 + typed / 100) * tf, roundOff))) : row;
    default:
      return row;
  }
}

/** A cell's figure as shown, and how far it moved off the loaded figure (price, cost, min). */
export type CellView = { text: string; delta: number; muted: boolean };

/** The profit % of a price on the cost w/o tax — null without a cost or a price ("−100%" is no loss). */
export function profitPercOf(row: QuickRateRow, price: number): number | null {
  const cw = costWotOf(row);
  if (!(cw > 0) || !(price > 0)) {
    return null;
  }
  return ((price / taxFactor(row) - cw) / cw) * 100;
}

/** The unit cell: "PCS · MRP 140 · SP 130" (the bucket's dimensions). */
export function unitText(source: SellingPriceRow): string {
  let unit = text(source.unitName);
  if (source.mrp !== null && source.mrp !== undefined) {
    unit += ` · MRP ${figureText(source.mrp)}`;
  }
  if (source.salePrice !== null && source.salePrice !== undefined) {
    unit += ` · SP ${figureText(source.salePrice)}`;
  }
  return unit;
}

export function cellView(row: QuickRateRow, column: QuickRateColumn): CellView {
  const level = column.level ?? 0;
  switch (column.kind) {
    case "unit":
      return { text: unitText(row.source), delta: 0, muted: false };
    case "mrp": {
      const mrp = toNum(row.source.maxPrice);
      return { text: mrp > 0 ? money(mrp) : DASH, delta: 0, muted: false };
    }
    case "stock":
      return { text: figureText(row.source.stockQty), delta: 0, muted: true };
    case "costWot":
      return { text: money(costWotOf(row)), delta: 0, muted: !ownsCost(row) };
    case "cost":
      return {
        text: money(row.cost),
        delta: round2(row.cost - toNum(row.source.costRate)),
        muted: !ownsCost(row),
      };
    case "profit": {
      const profit = profitPercOf(row, row.prices[level - 1] ?? 0);
      return { text: profit === null ? DASH : formatCurrency(profit, 2, true), delta: 0, muted: true };
    }
    case "wot": {
      const price = row.prices[level - 1] ?? 0;
      return { text: price > 0 ? money(price / taxFactor(row)) : DASH, delta: 0, muted: true };
    }
    case "price": {
      const price = row.prices[level - 1] ?? 0;
      return { text: money(price), delta: round2(price - baselinePrice(row.source, level)), muted: false };
    }
    case "min":
      return { text: money(row.min), delta: round2(row.min - toNum(row.source.minPrice)), muted: false };
    default:
      return { text: "", delta: 0, muted: false };
  }
}

/** The move drawn at a changed cell's left: "+3" / "−2.50". */
export function deltaText(delta: number): string {
  return `${delta > 0 ? "+" : MINUS}${figureText(Math.abs(delta))}`;
}

// ---------------------------------------------------------------------------
// Which rows are shown
// ---------------------------------------------------------------------------

/**
 * From a bill line only the line's unit is shown — when that unit is among the
 * rows at all; else, or with "Show all units" ticked, every row (Qt `rowShown`).
 */
export function shownRows(rows: readonly QuickRateRow[], unitId: string | undefined, showAll: boolean): boolean[] {
  const unit = (unitId ?? "").trim();
  if (!unit || showAll || !rows.some((row) => row.source.uomId === unit)) {
    return rows.map(() => true);
  }
  return rows.map((row) => row.source.uomId === unit);
}

/** The row the cursor starts on: the line's unit, else the first. */
export function startRowIndex(rows: readonly QuickRateRow[], unitId: string | undefined): number {
  const unit = (unitId ?? "").trim();
  const index = unit ? rows.findIndex((row) => row.source.uomId === unit) : -1;
  return index >= 0 ? index : 0;
}

/**
 * "Show all units (n more)" — offered from a bill line when the filter hides
 * something (n = the rows it hides), and kept while it is ticked.
 */
export function showAllUnitsOffer(
  rows: readonly QuickRateRow[],
  unitId: string | undefined,
  fromLine: boolean,
): { visible: boolean; text: string } {
  const hidden = shownRows(rows, unitId, false).filter((on) => !on).length;
  return {
    visible: fromLine && hidden > 0,
    text: `Show all units (${hidden} more)`,
  };
}

// ---------------------------------------------------------------------------
// Enter walk
// ---------------------------------------------------------------------------

export type CellPos = { row: number; col: number };

/**
 * Enter walks the prices (and Min) of the SHOWN rows, along the row and on to
 * the next, round to the top (Qt `eventFilter`). Null when nothing qualifies —
 * a read-only popup, say.
 */
export function nextEnterStop(
  rows: readonly QuickRateRow[],
  shown: readonly boolean[],
  columns: readonly QuickRateColumn[],
  editable: boolean,
  from: CellPos,
): CellPos | null {
  const rowCount = rows.length;
  const colCount = columns.length;
  if (rowCount === 0 || colCount === 0) {
    return null;
  }
  let r = from.row;
  let c = from.col;
  for (let step = 0; step < rowCount * colCount; step += 1) {
    c += 1;
    if (c >= colCount) {
      c = 0;
      r += 1;
    }
    if (r >= rowCount) {
      r = 0;
    }
    if (!shown[r]) {
      continue;
    }
    const column = columns[c];
    if ((column.kind === "price" || column.kind === "min") && isCellEditable(rows[r], column, editable)) {
      return { row: r, col: c };
    }
  }
  return null;
}

/** ↑ / ↓ — the same column on the previous / next SHOWN row; null at either end. */
export function verticalStop(shown: readonly boolean[], from: CellPos, step: 1 | -1): CellPos | null {
  for (let r = from.row + step; r >= 0 && r < shown.length; r += step) {
    if (shown[r]) {
      return { row: r, col: from.col };
    }
  }
  return null;
}

/** ← / → — the previous / next focusable cell of the same row; null at either end. */
export function horizontalStop(columns: readonly QuickRateColumn[], from: CellPos, step: 1 | -1): CellPos | null {
  for (let c = from.col + step; c >= 0 && c < columns.length; c += step) {
    if (isCellFocusable(columns[c])) {
      return { row: from.row, col: c };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// The live line
// ---------------------------------------------------------------------------

/**
 * The line under the grid explains the level cell the cursor is on — the move,
 * the profit on cost w/o tax, the MRP and the cost (Qt `refreshLiveLine`).
 * Off a level cell it says how many rows Save will send, or how to type.
 */
export function liveLine(args: {
  row: QuickRateRow | null;
  column: QuickRateColumn | null;
  levels: readonly QuickRateLevel[];
  changed: number;
}): { text: string; warn: boolean } {
  const { row, column, levels, changed } = args;
  const level = column?.level ?? 0;
  if (!row || !column || level <= 0) {
    return {
      text:
        changed > 0
          ? `${changed} ${changed === 1 ? "row" : "rows"} changed — Ctrl+S saves.`
          : "Type a price, a profit % or a w/o-tax rate; Enter moves to the next price.",
      warn: false,
    };
  }
  const was = baselinePrice(row.source, level);
  const now = row.prices[level - 1] ?? 0;
  const cost = row.cost;
  const mrp = toNum(row.source.maxPrice);
  const cw = costWotOf(row);
  let move = `${money(was)} → ${money(now)}`;
  if (was > 0 && Math.abs(now - was) >= EPSILON) {
    move += `  (${now > was ? "+" : MINUS}${Math.abs(((now - was) / was) * 100).toFixed(1)}%)`;
  }
  const parts = [`${text(row.source.unitName)} · ${levelName(levels, level)}   ${move}`];
  if (cw > 0 && now > 0) {
    parts.push(`profit ${(((now / taxFactor(row) - cw) / cw) * 100).toFixed(2)}% on cost w/o tax ${money(cw)}`);
  }
  if (mrp > 0) {
    parts.push(now <= mrp ? `under MRP ${money(mrp)} ✓` : `ABOVE MRP ${money(mrp)}`);
  }
  const belowCost = cost > 0 && now > 0 && now < cost;
  if (belowCost) {
    parts.push("BELOW COST — Save will ask");
  }
  return { text: parts.join("   ·   "), warn: (mrp > 0 && now > mrp) || belowCost };
}

// ---------------------------------------------------------------------------
// The headline
// ---------------------------------------------------------------------------

/** The line under the item's name: "SKU-1  ·  barcode 890…  ·  GST 18% (incl.)". */
export function subLine(rows: readonly QuickRateRow[], itemName: string): string {
  const first = rows[0]?.source;
  if (!first) {
    return `${itemName} has no price row this branch can see.`;
  }
  const parts: string[] = [];
  if (text(first.itemCode)) parts.push(text(first.itemCode));
  if (text(first.barcode)) parts.push(`barcode ${text(first.barcode)}`);
  parts.push(`GST ${figureText(first.taxPerc)}%${first.inclTax === true ? " (incl.)" : ""}`);
  return parts.join("  ·  ");
}

/** The title's right side, for the line's unit row: company · stock, and the cost w/o tax. */
export function sideLines(row: QuickRateRow | null, companyName: string): [string, string] | null {
  if (!row) {
    return null;
  }
  const head = [companyName, `stock ${figureText(row.source.stockQty)} ${text(row.source.unitName)}`.trim()]
    .filter(Boolean)
    .join("  ·  ");
  return [head, `cost w/o tax ${money(costWotOf(row))}`];
}

// ---------------------------------------------------------------------------
// Save — menu 30's contract (Qt `ChangeSellingPriceEntry::buildPayload`)
// ---------------------------------------------------------------------------

export type QuickRateSaveArgs = {
  rows: readonly QuickRateRow[];
  companyId: string;
  branchId: string;
  scope: PriceScope;
  confirmed: boolean;
  /** `YYYY-MM-DD` — always sent (today included). */
  effectiveFrom: string;
  originMenuId: number;
};

/**
 * The CHANGED rows, each with all four levels (a hidden level as loaded),
 * price authoritative; `priceScope` only when the row was loaded with one;
 * `costPrice` only when the cost was changed. `originMenuId` tells the Price
 * Change Log where the operator was — omitted from menu 30 itself.
 * `lineNo` = the row's place in the WHOLE grid, 1-based (hidden rows count).
 */
export function buildQuickRatePayload(args: QuickRateSaveArgs): SaveSellingPriceBulkPayload {
  const out: SaveSellingPriceRow[] = [];
  args.rows.forEach((row, index) => {
    if (!isRowChanged(row)) {
      return;
    }
    const source = row.source;
    const taxPerc = toNum(source.taxPerc);
    const levels = [];
    for (let level = 1; level <= LEVEL_COUNT; level += 1) {
      const price = round2(row.prices[level - 1] ?? 0);
      levels.push({
        level,
        price,
        priceWot: exclusiveOfTax(price, taxPerc),
        markupPerc: markupOf(price, row.cost),
      });
    }
    const saveRow: SaveSellingPriceRow = {
      lineNo: index + 1,
      itemId: source.itemId,
      uomId: source.uomId,
      bucketId: source.bucketId ?? null,
      mrp: source.mrp ?? null,
      salePrice: source.salePrice ?? null,
      levels,
      minPrice: round2(row.min),
      roundOff: toNum(source.roundOff),
    };
    if (text(source.priceScope)) {
      saveRow.priceScope = text(source.priceScope);
    }
    if (costChanged(row)) {
      saveRow.costPrice = round2(row.cost);
    }
    out.push(saveRow);
  });
  const payload: SaveSellingPriceBulkPayload = {
    companyId: args.companyId,
    branchId: args.branchId,
    scope: args.scope,
    confirmed: args.confirmed,
    effectiveFrom: args.effectiveFrom,
    rows: out,
  };
  if (args.originMenuId > 0 && args.originMenuId !== SELLING_PRICE_MENU_ID) {
    payload.originMenuId = args.originMenuId;
  }
  return payload;
}

/**
 * The "Price below cost" dialog's lines from a needsConfirm answer (Qt
 * `postSave`): the server's item name, the row's unit (and bucket), the level's
 * name, the price as it stands and the cost the server judged it against.
 */
export function quickRateBelowCostLines(
  result: Pick<SellingPriceSaveResult, "problems">,
  rows: readonly QuickRateRow[],
  levels: readonly QuickRateLevel[],
): BelowCostLine[] {
  return (result.problems ?? []).map((problem) => {
    const lineNo = Number(problem.lineNo) || 0;
    const row = rows[lineNo - 1] ?? null;
    const level = Number(problem.level) || 0;
    return {
      row: lineNo,
      item: text(problem.itemName),
      bucket: row ? unitText(row.source) : "",
      level: level > 0 ? levelName(levels, level) : "",
      price: row && level > 0 ? (row.prices[level - 1] ?? 0) : 0,
      // The cost the save was judged on — the one typed, when it was.
      cost: row ? row.cost : 0,
    };
  });
}

/** "New rates can start today or a later day" — a From day before today is refused. */
export function fromDayRefusal(day: string, today: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && day < today
    ? "New rates can start today or a later day, not before."
    : null;
}

/** After a save that starts on a later day: what the operator is told. Null for today. */
export function scheduledNotice(effectiveFrom: string, today: string): string | null {
  const day = (effectiveFrom ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && day > today
    ? `The new rates start ${ddmmyyyy(day)}; today's rates stay till then.`
    : null;
}

// ---------------------------------------------------------------------------
// The two panels below the grid
// ---------------------------------------------------------------------------

/**
 * One "Recent inward" row as shown: Date · Type · ref · From · Qty · Cost w/o
 * tax · Tax · Cost · MRP. The route's names are read first, the ones notes 146
 * proposed (docDate, partyName, costRateWot, costRate) as a fallback.
 */
export function inwardCells(row: ItemInwardRow & Record<string, unknown>): string[] {
  const pick = (a: string, b: string): unknown => (row[a] !== undefined ? row[a] : row[b]);
  const type = text(row.txnType);
  const typeWord = type ? type.charAt(0) + type.slice(1).toLowerCase() : "";
  const from = text(pick("supplierName", "partyName"));
  const tax = row.taxPerc;
  return [
    ddmmyyyy(text(pick("date", "docDate")).slice(0, 10)),
    `${typeWord} · ${text(row.refno)}`,
    from || DASH,
    `${figureText(row.qty)} ${text(row.unitName)}`.trim(),
    money(toNum(pick("costWot", "costRateWot"))),
    tax === null || tax === undefined ? DASH : `${figureText(tax)}%`,
    money(toNum(pick("cost", "costRate"))),
    figureText(row.mrp),
  ];
}

export function inwardNote(state: { rows: number } | { status: number }): string {
  if ("rows" in state) {
    return state.rows === 0 ? "No inward of this item yet." : "";
  }
  return state.status === 404
    ? "Recent inward will show here once the server has it (notes-146)."
    : `Recent inward could not be read (${state.status || "no answer"}).`;
}

/** One "Rate changes" row: When · Who · device · What changed · Source (the Price Change Log's words). */
export function historyCells(row: PriceLogRow): string[] {
  return [
    `${dateText(row.day)} ${timeText(row.changedOn)}`.trim(),
    `${whoText(row)} · ${deviceText(row)}`,
    changeText(row),
    sourceLabel(row.source),
  ];
}

export const HISTORY_NOTE = "F3 — the full price history of this item";

export function historyNote(state: { rows: number } | { status: number }): string {
  if ("rows" in state) {
    return state.rows === 0 ? "No rate change of this item has been recorded yet." : HISTORY_NOTE;
  }
  return state.status === 403
    ? "Who changed it: needs a right on the Price Change Log (menu 290)."
    : `Rate changes could not be read (${state.status || "no answer"}).`;
}

/** The HTTP status of a thrown RTK error (0 when it carries none). */
export function statusOf(error: unknown): number {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : 0;
}

// ---------------------------------------------------------------------------
// Opening it on a document line (Qt `openForLine`)
// ---------------------------------------------------------------------------

/** What a sales screen opens the popup with for its current line. */
export type QuickRateLineTarget = {
  /** The line to re-price after a save with "apply" ticked. */
  lineKey: string;
  itemId: string;
  /** The line's unit (`iuc_id`), only when `fromLine`: the popup then shows just it. */
  unitId?: string;
  itemName: string;
  /** "Samsung H1 · PCS". */
  lineText: string;
  fromLine: boolean;
};

/**
 * The popup's request for one document line, or null for a line with no item
 * (Qt: "a blank line has no item to price"). `canApply` = the document can be
 * edited: only then is "Apply the new rate to this bill line" offered, and
 * only then is the popup narrowed to the line's unit.
 */
export function quickRateLineTarget(
  line: { key: string; itemId?: string | null; itemUnitId?: string | null; itemName?: string | null; unitName?: string | null } | null | undefined,
  canApply: boolean,
): QuickRateLineTarget | null {
  const itemId = text(line?.itemId).trim();
  if (!line || !itemId) {
    return null;
  }
  const itemName = text(line.itemName);
  return {
    lineKey: line.key,
    itemId,
    unitId: canApply ? text(line.itemUnitId) || undefined : undefined,
    itemName,
    lineText: [itemName, text(line.unitName)].filter(Boolean).join(" · "),
    fromLine: canApply,
  };
}
