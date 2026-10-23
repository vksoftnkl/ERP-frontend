/**
 * The Item card's PRICING grid rules, ported from Qt NexERP's
 * `ItemPriceGridController` (cb8fe0a / 54b0eed / 4ae6575, 2026-10-21..22).
 * Pure: item-master-page.tsx dispatches its row edits here, and
 * item-price-grid.tsx draws what these helpers decide.
 *
 *  - PROFIT % ON COST, WITHOUT TAX (test_item_profit): every row is "By User",
 *    the price is what the operator set and the % is worked out from it —
 *    (price wot − cost wot) ÷ cost wot × 100. Typing a % sets the price that
 *    earns it, typing a price sets the %, and a cost / tax / unit-factor
 *    change keeps the prices (only the % follows).
 *  - BUCKET LOCK (test_item_bucket_lock): a stored row that prices ONE stock
 *    bucket keeps the value naming the bucket — the server re-derives the
 *    bucket from it on every save and refuses a move (ITEM_PRICE_BUCKET_CHANGED).
 *  - LEVEL BANDS (test_item_price_bands): a band per ACTIVE price level over its
 *    Profit % | Wot | Price; a level the company has not switched on is hidden.
 *  - SCHEDULED PRICES (notes 140 C): /items/get's scheduled_prices[] are shown
 *    on the line under the grid only — never a grid row, never sent back.
 */
import { LEVEL_BAND_COLOURS } from "@/features/stocks/selling-price/selling-price.constants";
import type { EffectiveSetting } from "@/features/settings/app-settings/types";
import type { LinkedRecordColumn, LinkedRecordRow } from "./item-linked-records-editor.shared";
import {
  ITEM_PRICE_MARGIN_SALE_FIELD_PAIRS,
  ITEM_PRICE_MAX_LEVEL_COUNT,
} from "./item-master-page.constants";
import type { ItemPriceTaxContext } from "./type";

type ItemPriceLevelFieldPair = (typeof ITEM_PRICE_MARGIN_SALE_FIELD_PAIRS)[number];

const LEVEL_LETTERS = ["A", "B", "C", "D"] as const;
// Two figures are "the same" at the precision the grid shows money in.
const MONEY_EPSILON = 0.005;

// ------------------------------------------------------------------ numbers

export function parseItemPriceNumber(value: string | undefined): number | null {
  const normalized = (value ?? "").trim();
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    return parseItemPriceNumber(value);
  }
  return null;
}

function toText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return "";
}

/** A derived figure as the grid stores it: `decimals` places, no trailing zeros. */
export function formatItemPriceFigure(value: number, decimals: number): string {
  const fixed = value.toFixed(decimals);
  const trimmed = fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
  return trimmed === "-0" ? "0" : trimmed;
}

/** "₹50.00" / "-₹20.00" — the line's money, as Qt prints it. */
function formatRupees(value: number): string {
  return `${value < 0 ? "-" : ""}₹${Math.abs(value).toFixed(2)}`;
}

function formatGroupedMoney(value: number): string {
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ------------------------------------------------------------------ tax + rounding

export function itemPriceWithTax(wot: number, tax: ItemPriceTaxContext): number {
  return wot + (wot * (tax.gstPerc + tax.cessPerc)) / 100 + tax.cessQty;
}

/** Never below zero: a small price under a per-unit cess would split negative. */
export function itemPriceWithoutTax(price: number, tax: ItemPriceTaxContext): number {
  const divisor = 1 + (tax.gstPerc + tax.cessPerc) / 100;
  if (divisor <= 0) {
    return Math.max(0, price - tax.cessQty);
  }
  return Math.max(0, (price - tax.cessQty) / divisor);
}

/** To the nearest multiple of the row's Round Off (Qt `applyRound`); no step, no rounding. */
export function roundItemPriceToStep(value: number, roundOff: string | undefined): number {
  const step = parseItemPriceNumber(roundOff);
  if (step === null || step <= 0) {
    return value;
  }
  return Number((Math.round((value + Number.EPSILON) / step) * step).toFixed(4));
}

// ------------------------------------------------------------------ profit %

/**
 * Profit % on cost, without tax: blank when there is nothing true to say —
 * no cost, no price, or a stored price with no stored wot (old data), which
 * would otherwise read as "-100 %".
 */
function profitPercentText(price: number | null, priceWot: number | null, costWot: number): string {
  if (costWot <= 0 || !price || !priceWot) {
    return "";
  }
  return formatItemPriceFigure(((priceWot - costWot) / costWot) * 100, 2);
}

function levelProfitText(row: LinkedRecordRow, pair: ItemPriceLevelFieldPair): string {
  return profitPercentText(
    parseItemPriceNumber(row[pair.saleFieldName]),
    parseItemPriceNumber(row[pair.saleWotFieldName]),
    parseItemPriceNumber(row.ipm_cost_wot) ?? 0,
  );
}

export type RefreshItemPriceProfitOptions = {
  /**
   * true: re-derive each price's wot from the price (a price, cost or tax
   * moved). false: take the wot cells as they stand (a stored row on load,
   * or a typed wot).
   */
  splitPrices: boolean;
  /**
   * The Profit % cell the operator is typing in: left exactly as typed — a
   * cell being edited shows only what is typed (snap_price_edit). Its
   * re-worked figure lands when the cell is left
   * (settleItemPriceProfitPercent).
   */
  keepProfitField?: string;
};

/**
 * Qt `refreshProfit`: every level's profit % from its price, for one row. The
 * prices themselves are never touched — a shelf label must not change because
 * a purchase came in at a new cost.
 */
export function refreshItemPriceRowProfit(
  row: LinkedRecordRow,
  tax: ItemPriceTaxContext,
  { splitPrices, keepProfitField }: RefreshItemPriceProfitOptions,
): LinkedRecordRow {
  const nextRow = { ...row };
  for (const pair of ITEM_PRICE_MARGIN_SALE_FIELD_PAIRS) {
    if (splitPrices) {
      const price = parseItemPriceNumber(nextRow[pair.saleFieldName]);
      nextRow[pair.saleWotFieldName] =
        price === null ? "" : formatItemPriceFigure(itemPriceWithoutTax(price, tax), 3);
    }
    if (pair.marginFieldName !== keepProfitField) {
      nextRow[pair.marginFieldName] = levelProfitText(nextRow, pair);
    }
  }
  return nextRow;
}

/**
 * A Profit % was typed: the price that earns it — price wot = cost wot ×
 * (1 + %), plus tax, rounded by the row's Round Off. A % the current price
 * already earns leaves the price alone, so settling the cell on leaving it
 * (or a re-run of the same edit) never nudges a price.
 */
export function applyItemPriceProfitPercentInput(
  row: LinkedRecordRow,
  tax: ItemPriceTaxContext,
  profitFieldName: string,
): LinkedRecordRow {
  const pair = ITEM_PRICE_MARGIN_SALE_FIELD_PAIRS.find(
    (candidate) => candidate.marginFieldName === profitFieldName,
  );
  if (!pair) {
    return refreshItemPriceRowProfit(row, tax, { splitPrices: true });
  }
  const nextRow = { ...row };
  const costWot = parseItemPriceNumber(nextRow.ipm_cost_wot) ?? 0;
  const typed = parseItemPriceNumber(nextRow[profitFieldName]);
  if (
    costWot > 0 &&
    typed !== null &&
    formatItemPriceFigure(typed, 2) !== levelProfitText(nextRow, pair)
  ) {
    const priceWot = Math.max(0, costWot * (1 + typed / 100));
    nextRow[pair.saleFieldName] = formatItemPriceFigure(
      roundItemPriceToStep(itemPriceWithTax(priceWot, tax), nextRow.ipm_round_off),
      4,
    );
  }
  return refreshItemPriceRowProfit(nextRow, tax, {
    splitPrices: true,
    keepProfitField: profitFieldName,
  });
}

/**
 * The typed Profit % cell was left: it now shows the % the (rounded) price
 * really earns — 33 % at Round Off 1 settles on 33.05 %. The same row object
 * back when nothing moved.
 */
export function settleItemPriceProfitPercent(
  row: LinkedRecordRow,
  profitFieldName: string,
): LinkedRecordRow {
  const pair = ITEM_PRICE_MARGIN_SALE_FIELD_PAIRS.find(
    (candidate) => candidate.marginFieldName === profitFieldName,
  );
  if (!pair) {
    return row;
  }
  const settled = levelProfitText(row, pair);
  return (row[profitFieldName] ?? "") === settled ? row : { ...row, [profitFieldName]: settled };
}

/** A level's wot was typed: the price is that plus tax (unrounded); the typed wot stands. */
export function applyItemPriceWotInput(
  row: LinkedRecordRow,
  tax: ItemPriceTaxContext,
  wotFieldName: string,
): LinkedRecordRow {
  const nextRow = { ...row };
  const pair = ITEM_PRICE_MARGIN_SALE_FIELD_PAIRS.find(
    (candidate) => candidate.saleWotFieldName === wotFieldName,
  );
  if (pair) {
    const wot = parseItemPriceNumber(nextRow[wotFieldName]);
    nextRow[pair.saleFieldName] =
      wot === null ? "" : formatItemPriceFigure(itemPriceWithTax(wot, tax), 4);
  }
  return refreshItemPriceRowProfit(nextRow, tax, { splitPrices: false });
}

/**
 * Round Off changed: the row's prices re-round to the new step, then the %
 * follows. A stored sale-price-bucket row's bucket price is left as it is —
 * re-rounding it would move the row onto other stock.
 */
export function applyItemPriceRoundOffChange(
  row: LinkedRecordRow,
  tax: ItemPriceTaxContext,
): LinkedRecordRow {
  const nextRow = { ...row };
  const bucketPrice = (row.ipm_id ?? "").trim()
    ? parseItemPriceNumber(row[ITEM_PRICE_STORED_FIELDS.bucketSp])
    : null;
  for (const pair of ITEM_PRICE_MARGIN_SALE_FIELD_PAIRS) {
    const price = parseItemPriceNumber(nextRow[pair.saleFieldName]);
    if (!price) {
      continue;
    }
    if (bucketPrice !== null && Math.abs(price - bucketPrice) < MONEY_EPSILON) {
      continue;
    }
    nextRow[pair.saleFieldName] = formatItemPriceFigure(
      roundItemPriceToStep(price, nextRow.ipm_round_off),
      4,
    );
  }
  return refreshItemPriceRowProfit(nextRow, tax, { splitPrices: true });
}

// ------------------------------------------------------------------ stored-row extras

/**
 * Read-only figures a STORED row carries beside its editable cells. They ride
 * on the row object (so drafts and screen memory keep them) but are not in
 * ITEM_PRICE_TEXT_FIELD_NAMES: the change detector, the flat form values and
 * the save payload never see them.
 */
export const ITEM_PRICE_STORED_FIELDS = {
  /** The MRP bucket this row prices (server-derived); "" = none. */
  bucketMrp: "ipm_bucket_mrp",
  /** The sale-price bucket this row prices (server-derived); "" = none. */
  bucketSp: "ipm_bucket_sp",
  /** JSON {c, p[4], w[4]}: cost wot, prices and wots as loaded — the ↑ / ↓ compare against it. */
  loaded: "ipm_loaded",
  /** JSON: this row's next scheduled change (notes 140 C), or "". */
  scheduled: "ipm_scheduled_next",
} as const;

type ItemPriceLoadedSnapshot = { c: number; p: number[]; w: number[] };
type ItemPriceScheduledNext = {
  from: string;
  company: string;
  branch: string;
  unit: string;
  prices: number[];
};

function sameBucket(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  const leftMrp = toNumberOrNull(left.ipm_bucket_mrp);
  const rightMrp = toNumberOrNull(right.ipm_bucket_mrp);
  const leftSp = toNumberOrNull(left.ipm_bucket_sp);
  const rightSp = toNumberOrNull(right.ipm_bucket_sp);
  const same = (a: number | null, b: number | null) =>
    a === null || b === null ? a === b : Math.abs(a - b) < MONEY_EPSILON;
  return same(leftMrp, rightMrp) && same(leftSp, rightSp);
}

/**
 * The next scheduled change of one stored row's price list — same company,
 * branch, unit and bucket (Qt `scheduledText`). Both sides are expected with
 * the unit already on `ipm_unit_id` as a unit-master id.
 */
function pickNextScheduledItemPrice(
  source: Record<string, unknown>,
  scheduledRows: readonly Record<string, unknown>[],
): Record<string, unknown> | null {
  let next: Record<string, unknown> | null = null;
  for (const scheduled of scheduledRows) {
    if (
      toText(scheduled.ipm_company_id) !== toText(source.ipm_company_id) ||
      toText(scheduled.ipm_branch_id) !== toText(source.ipm_branch_id) ||
      toText(scheduled.ipm_unit_id) !== toText(source.ipm_unit_id) ||
      !sameBucket(scheduled, source)
    ) {
      continue;
    }
    if (!next || toText(scheduled.ipm_effective_from) < toText(next.ipm_effective_from)) {
      next = scheduled;
    }
  }
  return next;
}

/** The stored-row extras for one loaded price row (`source` = the server's row). */
export function buildItemPriceRowStoredFields(
  source: Record<string, unknown>,
  scheduledRows: readonly Record<string, unknown>[],
): LinkedRecordRow {
  const bucketMrp = toNumberOrNull(source.ipm_bucket_mrp);
  const bucketSp = toNumberOrNull(source.ipm_bucket_sp);
  const stored = Boolean(toText(source.ipm_id));
  const snapshot: ItemPriceLoadedSnapshot = {
    c: toNumberOrNull(source.ipm_cost_wot) ?? 0,
    p: ITEM_PRICE_MARGIN_SALE_FIELD_PAIRS.map(
      (pair) => toNumberOrNull(source[pair.saleFieldName]) ?? 0,
    ),
    w: ITEM_PRICE_MARGIN_SALE_FIELD_PAIRS.map(
      (pair) => toNumberOrNull(source[pair.saleWotFieldName]) ?? 0,
    ),
  };
  const scheduled = stored ? pickNextScheduledItemPrice(source, scheduledRows) : null;
  const scheduledNext: ItemPriceScheduledNext | null = scheduled
    ? {
        from: toText(scheduled.ipm_effective_from).slice(0, 10),
        company: toText(scheduled.ipm_company_id),
        branch: toText(scheduled.ipm_branch_id),
        unit: toText(scheduled.ipm_unit_id),
        prices: ITEM_PRICE_MARGIN_SALE_FIELD_PAIRS.map(
          (pair) => toNumberOrNull(scheduled[pair.saleFieldName]) ?? 0,
        ),
      }
    : null;
  return {
    [ITEM_PRICE_STORED_FIELDS.bucketMrp]: bucketMrp === null ? "" : String(bucketMrp),
    [ITEM_PRICE_STORED_FIELDS.bucketSp]: bucketSp === null ? "" : String(bucketSp),
    [ITEM_PRICE_STORED_FIELDS.loaded]: stored ? JSON.stringify(snapshot) : "",
    [ITEM_PRICE_STORED_FIELDS.scheduled]: scheduledNext ? JSON.stringify(scheduledNext) : "",
  };
}

/**
 * "Copy from item" (Qt `detachFromStored`): the loaded rows become a NEW
 * item's rows — no stored ids, no stock bucket behind them, nothing saved to
 * compare against and nothing scheduled.
 */
export function detachItemPriceRowsFromStored(rows: readonly LinkedRecordRow[]): LinkedRecordRow[] {
  return rows.map((row) => ({
    ...row,
    ipm_id: "",
    [ITEM_PRICE_STORED_FIELDS.bucketMrp]: "",
    [ITEM_PRICE_STORED_FIELDS.bucketSp]: "",
    [ITEM_PRICE_STORED_FIELDS.loaded]: "",
    [ITEM_PRICE_STORED_FIELDS.scheduled]: "",
  }));
}

function parseJson<T>(value: string | undefined): T | null {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function readLoadedSnapshot(row: LinkedRecordRow): ItemPriceLoadedSnapshot | null {
  if (!(row.ipm_id ?? "").trim()) {
    return null;
  }
  const snapshot = parseJson<ItemPriceLoadedSnapshot>(row[ITEM_PRICE_STORED_FIELDS.loaded]);
  return snapshot && Array.isArray(snapshot.p) && Array.isArray(snapshot.w) ? snapshot : null;
}

// ------------------------------------------------------------------ bucket lock

/** `sales.default_price_level` — the level a sale-price bucket mirrors (1 when unset). */
export function parseItemPriceDefaultLevel(rows: readonly EffectiveSetting[] | undefined): number {
  const row = rows?.find((candidate) => candidate.asdKey === "sales.default_price_level");
  const parsed = Number.parseInt((row?.value ?? row?.asdDefaultValue ?? "").trim(), 10);
  return parsed >= 1 && parsed <= ITEM_PRICE_MAX_LEVEL_COUNT ? parsed : 1;
}

/**
 * Why a cell of this row cannot be typed in ("" = it can). A stored row Change
 * Selling Price made for ONE stock bucket keeps the value that NAMES the
 * bucket: the MRP of an MRP-bucket row; the default level's price (and its
 * Profit % and Wot, which would set it) of a sale-price-bucket row. A
 * headline row, and every other cell, stays editable.
 */
export function resolveItemPriceLockReason(
  row: LinkedRecordRow,
  fieldName: string,
  defaultPriceLevel: number,
): string {
  if (!(row.ipm_id ?? "").trim()) {
    return "";
  }
  const bucketMrp = parseItemPriceNumber(row[ITEM_PRICE_STORED_FIELDS.bucketMrp]);
  if (bucketMrp !== null && fieldName === "ipm_max_price") {
    return `This row is the price of the MRP ${formatGroupedMoney(bucketMrp)} stock, so its MRP is fixed here.`;
  }
  const bucketSp = parseItemPriceNumber(row[ITEM_PRICE_STORED_FIELDS.bucketSp]);
  if (bucketSp !== null) {
    const level = Math.min(Math.max(Math.trunc(defaultPriceLevel) || 1, 1), ITEM_PRICE_MAX_LEVEL_COUNT);
    const pair = ITEM_PRICE_MARGIN_SALE_FIELD_PAIRS[level - 1];
    if (
      pair &&
      (fieldName === pair.saleFieldName ||
        fieldName === pair.saleWotFieldName ||
        fieldName === pair.marginFieldName)
    ) {
      return `This row is the price of the stock sold at ${formatGroupedMoney(bucketSp)}, so this price is fixed here.`;
    }
  }
  return "";
}

// ------------------------------------------------------------------ ↑ / ↓

export type ItemPriceChangeMark = { direction: "up" | "down"; title: string };

/**
 * ↑ / ↓ beside a price or Profit % cell that has moved off what was loaded.
 * On a Profit % cell it is the REAL profit moving — a cost change does that
 * with the price untouched. Nothing on a new row, nor where nothing was there.
 */
export function resolveItemPriceChangeMark(
  row: LinkedRecordRow,
  fieldName: string,
): ItemPriceChangeMark | null {
  const snapshot = readLoadedSnapshot(row);
  if (!snapshot) {
    return null;
  }
  const index = ITEM_PRICE_MARGIN_SALE_FIELD_PAIRS.findIndex(
    (pair) => pair.saleFieldName === fieldName || pair.marginFieldName === fieldName,
  );
  const pair = ITEM_PRICE_MARGIN_SALE_FIELD_PAIRS[index];
  if (!pair) {
    return null;
  }
  const now = parseItemPriceNumber(row[fieldName]);
  const savedPrice = snapshot.p[index] ?? 0;
  const saved =
    fieldName === pair.saleFieldName
      ? savedPrice || null
      : parseItemPriceNumber(profitPercentText(savedPrice, snapshot.w[index] ?? 0, snapshot.c));
  if (now === null || saved === null || Math.abs(now - saved) < MONEY_EPSILON) {
    return null;
  }
  return {
    direction: now > saved ? "up" : "down",
    title: fieldName === pair.saleFieldName ? `Was ${saved.toFixed(2)}` : `Was ${saved.toFixed(2)} %`,
  };
}

// ------------------------------------------------------------------ price levels

export type ItemPriceLevel = {
  /** 1..4 — price level id = tier A..D. */
  tier: number;
  letter: string;
  name: string;
  short: string;
  active: boolean;
};

export type ItemPriceLevels = {
  /** false until /price-level-masters/get answers with levels 1-4 (or when it failed). */
  known: boolean;
  levels: ItemPriceLevel[];
};

function readRecordValue(record: Record<string, unknown>, camel: string, snake: string): unknown {
  return record[camel] !== undefined ? record[camel] : record[snake];
}

function readRecordBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim().toLowerCase() === "true";
  }
  return fallback;
}

/**
 * The four price levels from `/price-level-masters/get`. A level the company
 * has not switched on (`priceLvlIsActive` false, or deleted) is inactive —
 * and so, once the levels are known, is one the company has no record of at
 * all (Qt `m_priceLevelActive.value(id, false)`). The flag missing on a
 * record reads as on.
 */
export function resolveItemPriceLevels(records: readonly Record<string, unknown>[]): ItemPriceLevels {
  const levels: ItemPriceLevel[] = LEVEL_LETTERS.map((letter, index) => ({
    tier: index + 1,
    letter,
    name: "",
    short: "",
    active: true,
  }));
  const seen = new Set<number>();
  for (const record of records) {
    const tier = Number(toText(readRecordValue(record, "priceLvlId", "price_lvl_id")));
    const level = Number.isInteger(tier) ? levels[tier - 1] : undefined;
    if (!level) {
      continue;
    }
    seen.add(tier);
    level.name = toText(readRecordValue(record, "priceLvlName", "price_lvl_name"));
    level.short = toText(readRecordValue(record, "priceLvlShort", "price_lvl_short"));
    level.active =
      readRecordBoolean(readRecordValue(record, "priceLvlIsActive", "price_lvl_is_active"), true) &&
      !readRecordBoolean(readRecordValue(record, "priceLvlIsDeleted", "price_lvl_is_deleted"), false);
  }
  const known = seen.size > 0;
  if (known) {
    for (const level of levels) {
      level.active = level.active && seen.has(level.tier);
    }
  }
  return { known, levels };
}

/** Shown in the grid: every level until the levels are known, then the active ones only. */
export function isItemPriceLevelShown(levels: ItemPriceLevels, tierIndex: number): boolean {
  return !levels.known || levels.levels[tierIndex]?.active !== false;
}

function levelLabel(levels: ItemPriceLevels, tierIndex: number): string {
  const level = levels.levels[tierIndex];
  return level?.short || level?.letter || LEVEL_LETTERS[tierIndex] || String(tierIndex + 1);
}

/**
 * Profit % | Wot | Price per shown level — Qt's order. Known levels get the
 * short headings (the band above names the level); unknown ones keep the
 * letter / short code in the heading itself.
 */
export function buildItemPriceTierColumns(levels: ItemPriceLevels): LinkedRecordColumn[] {
  return ITEM_PRICE_MARGIN_SALE_FIELD_PAIRS.flatMap((pair, tierIndex) => {
    if (!isItemPriceLevelShown(levels, tierIndex)) {
      return [];
    }
    const letter = LEVEL_LETTERS[tierIndex] ?? String(tierIndex + 1);
    const short = levels.levels[tierIndex]?.short ?? "";
    const tag = short || letter;
    // Table Settings lists the columns by name: there the level must still show.
    const settingsTag = levels.levels[tierIndex]?.name || tag;
    return [
      {
        key: pair.marginFieldName,
        label: levels.known ? "Profit %" : `${tag} Profit %`,
        settingsLabel: `${settingsTag} Profit %`,
        type: "number" as const,
        // A negative % is a price below cost — allowed to type.
        allowNegative: true,
        step: "0.01",
        width: "7rem",
      },
      {
        key: pair.saleWotFieldName,
        label: levels.known ? "Wot" : `${tag} Wot`,
        settingsLabel: `${settingsTag} Wot`,
        type: "number" as const,
        min: 0,
        step: "0.0001",
        width: "7rem",
      },
      {
        key: pair.saleFieldName,
        label: levels.known ? "Price" : short ? `${short} Price` : `Sale ${letter}`,
        settingsLabel: `${settingsTag} Price`,
        type: "number" as const,
        min: 0,
        step: "0.0001",
        width: "7rem",
      },
    ];
  });
}

export type ItemPriceHeaderBand = {
  key: string;
  columnKeys: string[];
  text: string;
  fg: string;
  bg: string;
};

/**
 * A band per ACTIVE level over its Profit % | Wot | Price, in Change Selling
 * Price's colours. Only with two or more active levels: one level needs no
 * name over it, and unknown levels draw none.
 */
export function buildItemPriceLevelBands(levels: ItemPriceLevels): ItemPriceHeaderBand[] {
  if (!levels.known) {
    return [];
  }
  const active = levels.levels.filter((level) => level.active);
  if (active.length < 2) {
    return [];
  }
  return active.flatMap((level) => {
    const pair = ITEM_PRICE_MARGIN_SALE_FIELD_PAIRS[level.tier - 1];
    const colours = LEVEL_BAND_COLOURS[level.tier - 1];
    if (!pair || !colours) {
      return [];
    }
    const name = (level.name || `Level ${level.letter}`).toUpperCase();
    return [
      {
        key: `price-level-${level.tier}`,
        columnKeys: [pair.marginFieldName, pair.saleWotFieldName, pair.saleFieldName],
        text: level.short ? `${name}  (${level.short})` : name,
        fg: colours.fg,
        bg: colours.bg,
      },
    ];
  });
}

// ------------------------------------------------------------------ the line under the grid

export type ItemPriceProfitPart = {
  label: string;
  /** "₹50.00 (50.0%)" / "-₹20.00 (-16.7%)" */
  amount: string;
  loss: boolean;
  arrow: "up" | "down" | null;
};

export type ItemPriceProfitSummary =
  | { kind: "hint"; text: string }
  | {
      kind: "parts";
      heading: string;
      parts: ItemPriceProfitPart[];
      scheduled: string;
      tooltip: string;
    };

/**
 * "From 23-10: WS ₹120.00 · RET ₹130.00" — the next scheduled change of this
 * row's price list, the levels it changes only. "" when nothing is scheduled
 * for it, or the row no longer has the key it was matched on.
 */
export function describeScheduledItemPrice(row: LinkedRecordRow, levels: ItemPriceLevels): string {
  if (!(row.ipm_id ?? "").trim()) {
    return "";
  }
  const next = parseJson<ItemPriceScheduledNext>(row[ITEM_PRICE_STORED_FIELDS.scheduled]);
  if (
    !next ||
    !Array.isArray(next.prices) ||
    next.company !== (row.ipm_company_id ?? "").trim() ||
    next.branch !== (row.ipm_branch_id ?? "").trim() ||
    next.unit !== (row.ipm_unit_id ?? "").trim()
  ) {
    return "";
  }
  const changes = ITEM_PRICE_MARGIN_SALE_FIELD_PAIRS.flatMap((pair, tierIndex) => {
    if (!isItemPriceLevelShown(levels, tierIndex)) {
      return [];
    }
    const scheduled = next.prices[tierIndex] ?? 0;
    const current = parseItemPriceNumber(row[pair.saleFieldName]) ?? 0;
    return Math.abs(scheduled - current) < MONEY_EPSILON
      ? []
      : [`${levelLabel(levels, tierIndex)} ₹${scheduled.toFixed(2)}`];
  });
  const [year, month, day] = next.from.split("-");
  if (changes.length === 0 || !year || !month || !day) {
    return "";
  }
  return `From ${day}-${month}: ${changes.join(" · ")}`;
}

/**
 * Qt `updateProfitSummary`: one SHORT line for the current row — "Profit per
 * BOX (no tax):  WS ₹10.00 (10.0%) ↑ · …". Each amount and % on cost is
 * green (profit) or red (loss); ↑ / ↓ = moved since the item was opened, the
 * old figure in the tooltip.
 */
export function buildItemPriceProfitSummary(
  row: LinkedRecordRow | null,
  options: { unitName: string; levels: ItemPriceLevels },
): ItemPriceProfitSummary {
  const costWot = row ? (parseItemPriceNumber(row.ipm_cost_wot) ?? 0) : 0;
  if (!row || !options.unitName || costWot <= 0) {
    return { kind: "hint", text: "Profit shows here after unit, cost and price." };
  }
  const snapshot = readLoadedSnapshot(row);
  const parts: ItemPriceProfitPart[] = [];
  const tips: string[] = [];
  ITEM_PRICE_MARGIN_SALE_FIELD_PAIRS.forEach((pair, tierIndex) => {
    const price = parseItemPriceNumber(row[pair.saleFieldName]);
    if (!price || !isItemPriceLevelShown(options.levels, tierIndex)) {
      return;
    }
    const profit = (parseItemPriceNumber(row[pair.saleWotFieldName]) ?? 0) - costWot;
    const percent = ((profit / costWot) * 100).toFixed(1);
    const label = levelLabel(options.levels, tierIndex);
    let arrow: ItemPriceProfitPart["arrow"] = null;
    let wasTip = "";
    const savedWot = snapshot?.w[tierIndex] ?? 0;
    if (snapshot && snapshot.c > 0 && savedWot !== 0) {
      const was = savedWot - snapshot.c;
      if (Math.abs(profit - was) >= MONEY_EPSILON) {
        arrow = profit > was ? "up" : "down";
        wasTip = `, was ${formatRupees(was)}`;
      }
    }
    parts.push({ label, amount: `${formatRupees(profit)} (${percent}%)`, loss: profit < 0, arrow });
    tips.push(
      `${label}: price ₹${price.toFixed(2)}, profit ${formatRupees(profit)} (${percent}%)${wasTip}`,
    );
  });
  if (parts.length === 0) {
    return { kind: "hint", text: "No price yet." };
  }
  const scheduled = describeScheduledItemPrice(row, options.levels);
  if (scheduled) {
    tips.push(`${scheduled} — set in Change Selling Price (F9 there lists or cancels it).`);
  }
  return {
    kind: "parts",
    heading: `Profit per ${options.unitName} (no tax):`,
    parts,
    scheduled,
    tooltip: tips.join("\n"),
  };
}
