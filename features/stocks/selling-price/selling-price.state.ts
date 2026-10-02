/**
 * The grid rows of Change Selling Price and every rule that reads or rewrites
 * one — the Qt screen's cell logic (`fillRow`, `setLevelPrice`,
 * `onGridCellEdited`, `applyFourEdit`, `isChanged`, `verdict`,
 * `whyNotEditable`, `winningRows`, `addNewBucketRow`, `refreshItemsAfterSave`)
 * as pure functions over plain objects.
 *
 * Qt keeps every figure in a cell as text and re-parses it; here a row is a
 * typed object, but each value is stored the way the Qt cell held it (prices
 * at 2 places, markups and baselines at the 6 places `rawNum` keeps), so the
 * changed-row test and the bucket keys answer exactly as they do there.
 *
 * The blank row Qt keeps at the bottom of the grid is NOT a row here: the grid
 * renders it after the last one. Row N on screen is `rows[N - 1]`.
 */
import { LEVEL_COUNT, isMkupKey, isPriceKey, isRateKey, levelOfColumn } from "./selling-price.constants";
import type { ColumnKey } from "./selling-price.constants";
import {
  exclusiveOfTax,
  markupOf,
  priceFromMargin,
  priceFromMarkup,
  priceFromWot,
  rawNum,
  rawOf,
  round2,
  toNullableNum,
  toNum,
} from "./selling-price.math";
import type { BelowCostPolicy, PriceScope, SellingPriceRow } from "./selling-price.types";

export type LevelFigures = [number, number, number, number];

export type PriceGridRow = {
  /** React's handle; survives a refill so focus and the card stay on the row. */
  key: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  /** item_default_barcode — display only, never sent. */
  barcode: string;
  /** An iuc_id, never a unit_id. */
  uomId: string;
  unitName: string;
  /** On hand for this bucket, in the row's unit. */
  stock: number | null;
  /** What the MRP column SHOWS — and the MRP a price may not pass. */
  mrp: number | null;
  salePx: number | null;
  /** The bucket's dimensions, echoed back unchanged on save (null = none). */
  bucketMrp: number | null;
  bucketSp: number | null;
  /** BUCKET / MASTER. */
  priceSource: string;
  /** BRANCH / CHAIN / "" (no price yet) — echoed back unchanged. */
  priceScope: string;
  /** The ipm_id that answered — informational on save. */
  bucketId: string;
  /** Tax-inclusive. */
  cost: number;
  /** Cost before tax — derived, never sent. */
  costWot: number;
  /** MRP / ITEM / PRICE_ROW — which cost Cost is (notes 75). */
  costBasis: string;
  taxPerc: number;
  /** Nearest multiple, the item card's rule; 0 = none. */
  roundOff: number;
  /** The four-number card is approximate. */
  hasCess: boolean;
  /** stp_track_signature, for a NEW row's MRP / sale-price cells. */
  trackSig: string;
  /** "ADDED" for a row this screen added; "" otherwise. */
  state: "" | "ADDED";
  /** The net price per level — what is saved and judged. */
  prices: LevelFigures;
  markups: LevelFigures;
  /** The base rate (price before tax) per level — derived, never sent. */
  rates: LevelFigures;
  /** BASELINE — the prices as loaded (or as last picked in F12). */
  base: LevelFigures;
  min: number;
  baseMin: number;
};

/** The six places a Qt cell keeps (`rawNum`). */
function six(value: number): number {
  return Number(rawNum(value));
}

function emptyLevels(): LevelFigures {
  return [0, 0, 0, 0];
}

let rowSequence = 0;

/** A fresh React key for a row this screen puts on the grid. */
export function nextRowKey(): string {
  rowSequence += 1;
  return `csp-${rowSequence}`;
}

// ---------------------------------------------------------------------------
// Filling
// ---------------------------------------------------------------------------

/**
 * One level's price: the net price at 2 places, the markup from it, and the
 * base rate — which always follows the net price, so a base rate typed and
 * then rounded off shows the true base of the price that will be saved.
 */
export function setLevelPrice(row: PriceGridRow, level: number, price: number): PriceGridRow {
  const netPrice = round2(price);
  const prices = [...row.prices] as LevelFigures;
  const markups = [...row.markups] as LevelFigures;
  const rates = [...row.rates] as LevelFigures;
  prices[level] = six(netPrice);
  markups[level] = six(markupOf(netPrice, row.cost));
  rates[level] = six(round2(exclusiveOfTax(netPrice, row.taxPerc)));
  return { ...row, prices, markups, rates };
}

/**
 * One server row into one grid row, and the baseline with it: loading (or
 * picking in F12) resets the before-values the delta chips measure against.
 *
 * `previous` keeps what Qt's fillRow leaves alone in the cells it does not
 * write — the row's key and its track signature.
 */
export function rowFromServer(o: SellingPriceRow, previous?: Pick<PriceGridRow, "key" | "trackSig">): PriceGridRow {
  const maxPrice = toNum(o.maxPrice);
  const bucketMrp = toNullableNum(o.mrp);
  const salePrice = toNullableNum(o.salePrice);
  const cost = six(toNum(o.costRate));
  const taxPerc = six(toNum(o.taxPerc));
  const hasCess = o.hasCess === true;
  // Cost before tax: cost ÷ (1 + tax%), exact for every item without cess. The
  // server's costWot is taken only for a cess item, where that derivation is
  // wrong — elsewhere it carries notes 77's corrupted wot average.
  const costWot =
    hasCess && o.costWot !== undefined && o.costWot !== null
      ? six(round2(toNum(o.costWot)))
      : six(round2(exclusiveOfTax(cost, taxPerc)));

  let row: PriceGridRow = {
    key: previous?.key ?? nextRowKey(),
    itemId: o.itemId ?? "",
    itemCode: o.itemCode ?? "",
    itemName: o.itemName ?? "",
    barcode: o.barcode ?? "",
    uomId: o.uomId ?? "",
    unitName: o.unitName ?? "",
    stock: six(toNum(o.stockQty)),
    // A stock bucket no row prices yet answers maxPrice 0 — show its own MRP.
    mrp: maxPrice > 0 ? six(maxPrice) : bucketMrp === null ? null : six(bucketMrp),
    salePx: salePrice === null ? null : six(salePrice),
    bucketMrp: bucketMrp === null ? null : six(bucketMrp),
    bucketSp: salePrice === null ? null : six(salePrice),
    priceSource: o.priceSource ?? "",
    priceScope: o.priceScope ?? "",
    bucketId: o.bucketId ?? "",
    cost,
    costWot,
    costBasis: o.costBasis ?? "",
    taxPerc,
    roundOff: six(toNum(o.roundOff)),
    hasCess,
    trackSig: previous?.trackSig ?? "",
    state: "",
    prices: emptyLevels(),
    markups: emptyLevels(),
    rates: emptyLevels(),
    base: emptyLevels(),
    min: six(toNum(o.minPrice)),
    baseMin: six(toNum(o.minPrice)),
  };
  const levels = Array.isArray(o.levels) ? o.levels : [];
  const base = emptyLevels();
  for (let level = 0; level < LEVEL_COUNT; level += 1) {
    let price = 0;
    for (const value of levels) {
      if (toNum(value?.level) === level + 1) {
        price = toNum(value.price);
      }
    }
    base[level] = six(price);
    row = setLevelPrice(row, level, price);
  }
  return { ...row, base };
}

// ---------------------------------------------------------------------------
// Row state
// ---------------------------------------------------------------------------

export function isAdded(row: PriceGridRow): boolean {
  return row.state === "ADDED";
}

/**
 * Save INSERTS: a row this screen added, or a stock bucket no row prices yet
 * (the headline answered it, with a dimension set).
 */
export function isNewRow(row: PriceGridRow): boolean {
  if (isAdded(row)) {
    return true;
  }
  return row.priceSource === "MASTER" && (row.bucketMrp !== null || row.bucketSp !== null);
}

const CHANGE_EPSILON = 0.005;

export function isChanged(row: PriceGridRow): boolean {
  if (!row.itemId) {
    return false;
  }
  if (isAdded(row)) {
    return true;
  }
  for (let level = 0; level < LEVEL_COUNT; level += 1) {
    if (Math.abs(row.prices[level] - row.base[level]) >= CHANGE_EPSILON) {
      return true;
    }
  }
  return Math.abs(row.min - row.baseMin) >= CHANGE_EPSILON;
}

export function changedCount(rows: readonly PriceGridRow[]): number {
  return rows.reduce((count, row) => count + (isChanged(row) ? 1 : 0), 0);
}

/** The MRP a price may not pass, 0 = none. */
export function rowMrp(row: PriceGridRow): number {
  return row.mrp ?? 0;
}

/** What the Src chip says. NEW is the screen's own state: Save inserts. */
export function srcText(source: string, scope: string, isNew: boolean): string {
  if (isNew) {
    return "NEW";
  }
  if (source === "BUCKET") {
    return scope === "CHAIN" ? "BUCKET·CH" : "BUCKET·BR";
  }
  return "MASTER";
}

export function srcOfRow(row: PriceGridRow): string {
  return srcText(row.priceSource, row.priceScope, isNewRow(row));
}

/**
 * The Branch cell: this branch's own row, or the chain row every branch reads.
 * A row Save will CREATE shows where the switch puts it.
 */
export function branchCellText(row: PriceGridRow, scope: PriceScope, here: string): string {
  const chain =
    isNewRow(row) || !row.priceScope ? scope === "CHAIN" : row.priceScope === "CHAIN";
  return chain ? "All branches" : here;
}

/** The short branch name for the Branch cell (the full one is in the subtitle). */
export function hereName(branchShort: string, branchName: string): string {
  return branchShort.trim() || branchName.trim() || "This branch";
}

export type Verdict = "ok" | "amber" | "red";

const PRICE_EPSILON = 0.005;

/**
 * Red = Save stays off (above MRP, below Min — and below cost when the setting
 * is restrict). Amber = below cost, the server asks. Only CHANGED rows are
 * judged: an untouched row is not sent, so it cannot fail the save.
 */
export function verdictOf(
  row: PriceGridRow,
  column: ColumnKey,
  belowCostPolicy: BelowCostPolicy,
): Verdict {
  if (!isChanged(row)) {
    return "ok";
  }
  const min = row.min;
  if (column === "minPrice") {
    for (let level = 0; level < LEVEL_COUNT; level += 1) {
      if (min > 0 && row.prices[level] + PRICE_EPSILON < min) {
        return "red";
      }
    }
    return "ok";
  }
  if (!isPriceKey(column)) {
    return "ok";
  }
  const price = row.prices[levelOfColumn(column)];
  const mrp = rowMrp(row);
  if (mrp > 0 && price > mrp + PRICE_EPSILON) {
    return "red";
  }
  if (min > 0 && price + PRICE_EPSILON < min) {
    return "red";
  }
  const cost = row.cost;
  if (cost > 0 && price + PRICE_EPSILON < cost) {
    return belowCostPolicy === "restrict" ? "red" : "amber";
  }
  return "ok";
}

/**
 * Why a cell will not open, in words — "" when it will. The refusal is SAID
 * (on the hint line), never a silent dead cell.
 *
 * `row` is null for the blank row at the bottom of the grid.
 */
export function whyNotEditable(row: PriceGridRow | null, column: ColumnKey, saving: boolean): string {
  const hasItem = Boolean(row?.itemId);
  if (column === "barcodeText") {
    return hasItem ? "A barcode adds an item: scan it on the blank last line." : "";
  }
  if (!row || !hasItem) {
    return "Pick the item first — scan its barcode, type in the Item cell, or load with F8.";
  }
  if (saving) {
    return "Saving…";
  }
  if (column === "mrpShown" || column === "salePx") {
    const mrp = column === "mrpShown";
    if (!isAdded(row)) {
      return mrp
        ? "The MRP is this row's identity — it comes from stock. To price an MRP no stock carries yet, add the item again: it adds a NEW row."
        : "The sale price is this row's identity — it comes from stock. Add the item again for a NEW bucket row.";
    }
    if (!row.trackSig.includes(mrp ? "M" : "P")) {
      return `This item's tracking policy (${row.trackSig}) does not track ${
        mrp ? "MRP" : "sale price"
      }, so it is not part of its price row.`;
    }
    return "";
  }
  if (column === "minPrice") {
    return "";
  }
  if (isPriceKey(column) || isRateKey(column)) {
    return "";
  }
  if (isMkupKey(column)) {
    return row.cost > 0
      ? ""
      : "This row has no cost, so a markup has nothing to work from — type the price.";
  }
  return "Shown, not edited here.";
}

// ---------------------------------------------------------------------------
// Cell input
// ---------------------------------------------------------------------------

/** The editor kinds the Qt delegate opens: money (2 places, ≥ 0) and markup (3 places, ≥ −100). */
export type CellEditorKind = "money" | "markup";

export function editorKindOf(column: ColumnKey): CellEditorKind | null {
  if (isMkupKey(column)) {
    return "markup";
  }
  if (
    isPriceKey(column) ||
    isRateKey(column) ||
    column === "minPrice" ||
    column === "mrpShown" ||
    column === "salePx"
  ) {
    return "money";
  }
  return null;
}

const INPUT_TOP = 999999999;

function boundsOf(kind: CellEditorKind | "percent" | "amount"): {
  bottom: number;
  decimals: number;
} {
  switch (kind) {
    case "money":
      return { bottom: 0, decimals: 2 };
    case "markup":
      return { bottom: -100, decimals: 3 };
    // The violet card: markup / margin ≥ −100, wot / price ≥ 0, three places each.
    case "percent":
      return { bottom: -100, decimals: 3 };
    case "amount":
      return { bottom: 0, decimals: 3 };
  }
}

export type NumericInputKind = CellEditorKind | "percent" | "amount";

/**
 * Whether a keystroke may stand in the box — `QDoubleValidator`'s Invalid
 * state: a character that is not part of a number, a sign where none is
 * allowed, one decimal too many.
 */
export function acceptsTyping(kind: NumericInputKind, text: string): boolean {
  const { bottom, decimals } = boundsOf(kind);
  const cleaned = text.replace(/,/g, "");
  const pattern = bottom < 0 ? /^-?\d*(\.\d*)?$/ : /^\d*(\.\d*)?$/;
  if (!pattern.test(cleaned)) {
    return false;
  }
  const fraction = cleaned.split(".")[1];
  if (fraction !== undefined && fraction.length > decimals) {
    return false;
  }
  const value = Number.parseFloat(cleaned);
  return !Number.isFinite(value) || Math.abs(value) <= INPUT_TOP;
}

/**
 * The number a finished edit stands for, or null when it is not one the
 * validator would accept (empty, a lone sign or point, out of range) — such an
 * edit is not committed, the cell keeps its value.
 */
export function parseAcceptable(kind: NumericInputKind, text: string): number | null {
  const cleaned = text.trim().replace(/,/g, "");
  if (!cleaned || !acceptsTyping(kind, cleaned) || !/\d/.test(cleaned)) {
    return null;
  }
  const value = Number.parseFloat(cleaned);
  const { bottom } = boundsOf(kind);
  if (!Number.isFinite(value) || value < bottom || value > INPUT_TOP) {
    return null;
  }
  return value;
}

/** The value a cell's editor opens on: markups at 1 place, money at 2, "" for none. */
export function editorText(row: PriceGridRow, column: ColumnKey): string {
  const value = cellNumber(row, column);
  if (value === null) {
    return "";
  }
  return isMkupKey(column) ? value.toFixed(1) : value.toFixed(2);
}

/** The figure an editable cell holds, or null for an empty one. */
export function cellNumber(row: PriceGridRow, column: ColumnKey): number | null {
  const level = levelOfColumn(column);
  if (isPriceKey(column)) {
    return row.prices[level];
  }
  if (isMkupKey(column)) {
    return row.markups[level];
  }
  if (isRateKey(column)) {
    return row.rates[level];
  }
  switch (column) {
    case "minPrice":
      return row.min;
    case "mrpShown":
      return row.mrp;
    case "salePx":
      return row.salePx;
    default:
      return null;
  }
}

/**
 * An unchanged commit (Enter straight through) is not an edit: the row must
 * not be marked or its prices re-derived for a keystroke that changed nothing.
 */
export function isSameFigure(before: number | null, after: number): boolean {
  return before !== null && Math.abs(after - before) < 0.0005;
}

/**
 * A finished cell edit — what the other columns do about it (`onGridCellEdited`).
 *
 *   Price      the typed price IS the price: no round-off, the markup follows
 *   Base rate  base × (1 + tax%) with the item's round-off (a DERIVED price)
 *   Mkup%      cost × (1 + markup%) with the round-off; the markup shown is
 *              then the true one of that price
 *   MRP / SP   (a NEW row's) held the way the server writes a figure, and the
 *              bucket dimension with it; 0 clears both
 *   Min        just the minimum
 */
export function applyCellEdit(row: PriceGridRow, column: ColumnKey, value: number): PriceGridRow {
  if (isPriceKey(column)) {
    return setLevelPrice(row, levelOfColumn(column), value);
  }
  if (isRateKey(column)) {
    return setLevelPrice(row, levelOfColumn(column), priceFromWot(value, row.taxPerc, row.roundOff));
  }
  if (isMkupKey(column)) {
    return setLevelPrice(row, levelOfColumn(column), priceFromMarkup(row.cost, value, row.roundOff));
  }
  if (column === "mrpShown" || column === "salePx") {
    const dimension = value > 0 ? six(value) : null;
    return column === "mrpShown"
      ? { ...row, mrp: dimension, bucketMrp: dimension }
      : { ...row, salePx: dimension, bucketSp: dimension };
  }
  if (column === "minPrice") {
    return { ...row, min: six(value) };
  }
  return row;
}

export type FourField = "markup" | "wot" | "price" | "margin";

/**
 * The violet card: typing any one of the four derives the price (round-off
 * applies, as a derived price), and the grid and the card follow.
 */
export function applyFourEdit(
  row: PriceGridRow,
  level: number,
  field: FourField,
  value: number,
): { row: PriceGridRow } | { hint: string } {
  const { cost, taxPerc, roundOff } = row;
  let price: number;
  if (field === "price") {
    price = value;
  } else if (field === "wot") {
    price = priceFromWot(value, taxPerc, roundOff);
  } else if (cost <= 0) {
    return {
      hint: "This row has no cost, so markup and margin have nothing to work from — type the price or the price wot.",
    };
  } else if (field === "markup") {
    price = priceFromMarkup(cost, value, roundOff);
  } else {
    const fromMargin = priceFromMargin(cost, taxPerc, value, roundOff);
    if (fromMargin === null) {
      return { hint: "A margin of 100% or more has no price." };
    }
    price = fromMargin;
  }
  return { row: setLevelPrice(row, level, price) };
}

// ---------------------------------------------------------------------------
// Rows of an item
// ---------------------------------------------------------------------------

export function rowIndexOfItem(rows: readonly PriceGridRow[], itemId: string): number {
  return rows.findIndex((row) => row.itemId === itemId);
}

/** The key a row is found by again after a save: unit | MRP | sale price. */
export function bucketKey(uomId: string, mrp: number | null, salePrice: number | null): string {
  return `${uomId}|${mrp === null ? "" : rawNum(mrp)}|${salePrice === null ? "" : rawNum(salePrice)}`;
}

function serverBucketKey(o: SellingPriceRow): string {
  return `${o.uomId ?? ""}|${rawOf(o.mrp)}|${rawOf(o.salePrice)}`;
}

/**
 * F12's list is every row this branch can SEE — chain and branch. The grid
 * shows the one that WINS per (unit × bucket): this branch's own row before
 * the chain's, the resolver's rule read the same way.
 */
export function winningRows(bucketRows: readonly SellingPriceRow[]): SellingPriceRow[] {
  const out: SellingPriceRow[] = [];
  const at = new Map<string, number>();
  for (const o of bucketRows) {
    const key = serverBucketKey(o);
    const index = at.get(key);
    if (index === undefined) {
      at.set(key, out.length);
      out.push(o);
    } else if (o.priceScope === "BRANCH") {
      out[index] = o;
    }
  }
  return out;
}

/**
 * After a save every row of a saved item is re-read, so each shows the row
 * that now wins — a NEW row becomes BUCKET·BR / ·CH with its ipm_id and the
 * baseline becomes the saved prices. The on-hand figure the grid loaded with
 * is kept when the bucket list answers 0 (a row added here had 0).
 */
export function refreshItemRows(
  rows: readonly PriceGridRow[],
  itemId: string,
  bucketRows: readonly SellingPriceRow[],
): PriceGridRow[] {
  const byKey = new Map<string, SellingPriceRow>();
  for (const o of winningRows(bucketRows)) {
    byKey.set(serverBucketKey(o), o);
  }
  return rows.map((row) => {
    if (row.itemId !== itemId) {
      return row;
    }
    const o = byKey.get(bucketKey(row.uomId, row.bucketMrp, row.bucketSp));
    if (!o) {
      return row;
    }
    const filled = rowFromServer(o, row);
    if (toNum(o.stockQty) === 0 && row.stock !== null) {
      return { ...filled, stock: row.stock };
    }
    return filled;
  });
}

/**
 * The row a NEW bucket row is modelled on: the item's first row, or its
 * headline when it has one (the better template) — the headline's unit, cost
 * and prices are what this stock would sell at otherwise.
 */
export function newBucketTemplateIndex(rows: readonly PriceGridRow[], itemId: string): number {
  let source = -1;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.itemId !== itemId) {
      continue;
    }
    if (source < 0) {
      source = index;
    }
    if (row.bucketMrp === null && row.bucketSp === null && !isAdded(row)) {
      source = index;
      break;
    }
  }
  return source;
}

/** Whether a track signature lets the item carry an MRP / a sale price. */
export function tracksOf(signature: string): { mrp: boolean; salePrice: boolean } {
  return { mrp: signature.includes("M"), salePrice: signature.includes("P") };
}

/**
 * A NEW bucket row for an item already on the grid, right under the item's
 * last row (so its rows stay together). Found again by item and unit — the
 * grid may have moved while the track signature was being fetched. Null when
 * the template has gone.
 */
export function insertNewBucketRow(
  rows: readonly PriceGridRow[],
  itemId: string,
  uomId: string,
  signature: string,
): { rows: PriceGridRow[]; index: number } | null {
  let from = -1;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.itemId === itemId && row.uomId === uomId) {
      from = index;
      if (row.bucketMrp === null && row.bucketSp === null) {
        break;
      }
    }
  }
  if (from < 0) {
    return null;
  }
  let at = from;
  while (at + 1 < rows.length && rows[at + 1].itemId === itemId) {
    at += 1;
  }
  at += 1;
  const template = rows[from];
  const added: PriceGridRow = {
    ...template,
    key: nextRowKey(),
    stock: 0,
    mrp: null,
    salePx: null,
    bucketMrp: null,
    bucketSp: null,
    bucketId: "",
    priceScope: "",
    priceSource: "MASTER",
    state: "ADDED",
    trackSig: signature,
  };
  return { rows: [...rows.slice(0, at), added, ...rows.slice(at)], index: at };
}

/** How many distinct items and rows the grid holds (the subtitle). */
export function gridCounts(rows: readonly PriceGridRow[]): { items: number; rows: number } {
  const items = new Set<string>();
  let count = 0;
  for (const row of rows) {
    if (row.itemId) {
      count += 1;
      items.add(row.itemId);
    }
  }
  return { items: items.size, rows: count };
}
