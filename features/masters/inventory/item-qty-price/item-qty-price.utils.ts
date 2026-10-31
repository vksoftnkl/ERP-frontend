import type {
  ItemQtyPriceMode,
  ItemQtyPricePayload,
  SaveItemQtyPriceDto,
} from "@/store/api/itemQtyPriceApi";
import type { ERPDynamicSelectOption } from "@/components/design-system/ui";
import type { EffectiveSetting } from "@/features/settings/app-settings/types";
import type { ScreenScope } from "@/lib/screen-memory";
import {
  PRICE_MODE_OPTIONS,
  type ItemQtyPriceRow,
  type SlabCell,
} from "./item-qty-price.types";

/** Menu 244, "Item Qty wise Price" — Save needs its Create or Edit, Delete slab its Delete. */
export const ITEM_QTY_PRICE_MENU_ID = 244;
/** The screen's route. The Item Master list opens an item here (Qt `openItem`). */
export const ITEM_QTY_PRICE_ROUTE = "/master/item-qty-price-master";

// ── Deep link ──────────────────────────────────────────────────────────────
// `?itemId=<uuid>&itemName=<name>` — that item, ready to edit. The name only
// labels the item box until its saved slabs arrive.
export type ItemQtyPriceDeepLink = { itemId: string; itemName: string };
export function itemQtyPriceHref(itemId: string, itemName: string): string {
  return `${ITEM_QTY_PRICE_ROUTE}?${new URLSearchParams({ itemId, itemName }).toString()}`;
}
export function parseItemQtyPriceDeepLink(
  params: { get(name: string): string | null } | null | undefined,
): ItemQtyPriceDeepLink | null {
  const itemId = params?.get("itemId")?.trim() ?? "";
  if (!itemId) return null;
  return { itemId, itemName: params?.get("itemName")?.trim() ?? "" };
}

// ── Modes ──────────────────────────────────────────────────────────────────
// The grid's one Value is saved from the mode's own field: % off → disc %,
// ₹ off → flat off, Fixed price → price. The other two go as null — a stored
// 0 would read as "₹0 off" (Qt applyModeGating).
export const PRICE_VALUE_FIELD: Readonly<
  Record<ItemQtyPriceMode, "iqp_disc_pct" | "iqp_flat_off" | "iqp_price">
> = { P: "iqp_disc_pct", R: "iqp_flat_off", F: "iqp_price" };
// A stored letter as one of the three; Qt's old "Q" (flat off) reads as R.
export function normalizePriceMode(raw: string | null | undefined): ItemQtyPriceMode {
  const code = (raw ?? "").trim().toUpperCase();
  if (code === "R" || code === "Q") return "R";
  if (code === "F") return "F";
  return "P";
}
export function priceModeLabel(mode: string): string {
  const code = normalizePriceMode(mode);
  return PRICE_MODE_OPTIONS.find((option) => option.value === code)?.label ?? "";
}

// ── Rows ───────────────────────────────────────────────────────────────────
let localIdCounter = 0;
export function createLocalId(): string {
  localIdCounter += 1;
  return `new-${Date.now().toString(36)}-${localIdCounter}`;
}
// Today as the operator's calendar has it (not UTC's — the counter opens before
// 05:30 IST too).
export function localTodayIso(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
// The date part of whatever the server sent (Qt `.left(10)`).
export function toDateInputValue(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : "";
}
// Every row belongs to the item the page is scoped to, so a blank row is
// seeded with it — the grid never mixes items. It starts active and today,
// the dates a slab with none would be saved with.
export function createBlankRow(item?: { id: string; label: string } | null): ItemQtyPriceRow {
  return {
    localId: createLocalId(),
    iqpId: null,
    itemId: item?.id ?? "",
    itemLabel: item?.label ?? "",
    itemUnitId: "",
    unitLabel: "",
    companyId: "",
    companyName: "",
    branchId: "",
    branchName: "",
    partyId: "",
    partyName: "",
    priceLevel: "",
    priceLevelName: "",
    fromQty: "",
    toQty: "",
    priceMode: "P",
    value: "",
    isTaxIncl: false,
    effectiveFrom: localTodayIso(),
    effectiveTo: "",
    isActive: true,
    isDirty: false,
  };
}
function figureText(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : "";
}
export function mapPayloadToRow(payload: ItemQtyPricePayload): ItemQtyPriceRow {
  const priceMode = normalizePriceMode(payload.iqp_price_mode);
  const toQty = Number(payload.iqp_to_qty);
  return {
    localId: payload.iqp_id,
    iqpId: payload.iqp_id,
    itemId: payload.iqp_item_id,
    itemLabel: payload.iqp_item_name ?? "",
    itemUnitId: payload.iqp_item_unit_id,
    unitLabel: payload.iqp_unit_name ?? "",
    companyId: payload.iqp_company_id ?? "",
    companyName: payload.iqp_company_name ?? "",
    branchId: payload.iqp_branch_id ?? "",
    branchName: payload.iqp_branch_name ?? "",
    partyId: payload.iqp_party_id ?? "",
    partyName: payload.iqp_party_name ?? "",
    priceLevel:
      payload.iqp_price_level === null || payload.iqp_price_level === undefined
        ? ""
        : String(payload.iqp_price_level),
    priceLevelName: payload.iqp_price_level_name ?? "",
    fromQty: figureText(payload.iqp_from_qty),
    // An open upper end (null) reads "& above", not 0.
    toQty: Number.isFinite(toQty) && toQty > 0 ? String(toQty) : "",
    priceMode,
    value: figureText(payload[PRICE_VALUE_FIELD[priceMode]]),
    isTaxIncl: Boolean(payload.iqp_is_tax_incl),
    effectiveFrom: toDateInputValue(payload.iqp_effective_from),
    effectiveTo: toDateInputValue(payload.iqp_effective_to),
    isActive: payload.iqp_is_active !== false,
    isDirty: false,
  };
}
function toNumberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}
// Blank, 0 or below is the open "& above" end — 0 would read as an upper
// bound under From Qty and be refused (Qt collectGridJson).
function upperQtyOf(row: Pick<ItemQtyPriceRow, "toQty">): number | null {
  const toQty = toNumberOrNull(row.toQty);
  return toQty !== null && toQty > 0 ? toQty : null;
}
/** A real slab: it has its unit. The trailing blank line has none. */
export function hasUnit(row: Pick<ItemQtyPriceRow, "itemUnitId">): boolean {
  return Boolean(row.itemUnitId);
}
// The grid's last row is always a blank line waiting for its unit (Qt's
// placeholder row) — picking one there opens the next.
export function ensureTrailingRow(
  rows: ItemQtyPriceRow[],
  item: { id: string; label: string } | null,
): ItemQtyPriceRow[] {
  if (!item) return rows;
  const lastRow = rows[rows.length - 1];
  return !lastRow || hasUnit(lastRow) ? [...rows, createBlankRow(item)] : rows;
}
export function isTrailingRow(rows: readonly ItemQtyPriceRow[], localId: string): boolean {
  const lastRow = rows[rows.length - 1];
  return Boolean(lastRow) && lastRow.localId === localId && !hasUnit(lastRow);
}

// ── Uniqueness and overlap ─────────────────────────────────────────────────
// Two slabs are the same rule when company, branch, customer, price level,
// unit, From and To all match (Qt rowUniquenessKey: unset scope is a real,
// comparable value; quantities to two places, a blank To as 0).
export function buildRowUniquenessKey(row: ItemQtyPriceRow): string {
  const qty = (value: string) => (toNumberOrNull(value) ?? 0).toFixed(2);
  return [
    row.companyId,
    row.branchId,
    row.partyId,
    row.priceLevel,
    row.itemUnitId,
    qty(row.fromQty),
    qty(row.toQty),
  ].join("\u001f");
}
/** The index of another real slab with this row's key, or -1. */
export function findDuplicateSlab(rows: readonly ItemQtyPriceRow[], index: number): number {
  const row = rows[index];
  if (!row || !hasUnit(row)) return -1;
  const key = buildRowUniquenessKey(row);
  return rows.findIndex(
    (other, otherIndex) =>
      otherIndex !== index && hasUnit(other) && buildRowUniquenessKey(other) === key,
  );
}
function scopeKey(row: ItemQtyPriceRow): string {
  return [row.companyId, row.branchId, row.partyId, row.priceLevel, row.itemUnitId].join("\u001f");
}
// The server's rule (notes 139 A4): two live slabs of one unit and scope —
// inactive ones included — may not share a qty on a shared date. Quantities
// are [from, to) with an open end for "& above"; dates are inclusive, a blank
// To date open, a blank From date today (what the save sends).
export function slabsOverlap(a: ItemQtyPriceRow, b: ItemQtyPriceRow, today: string): boolean {
  if (scopeKey(a) !== scopeKey(b)) return false;
  const aFrom = toNumberOrNull(a.fromQty) ?? 0;
  const bFrom = toNumberOrNull(b.fromQty) ?? 0;
  const aTo = upperQtyOf(a) ?? Number.POSITIVE_INFINITY;
  const bTo = upperQtyOf(b) ?? Number.POSITIVE_INFINITY;
  if (!(aFrom < bTo && bFrom < aTo)) return false;
  const OPEN_END = "9999-12-31";
  const aStart = a.effectiveFrom || today;
  const bStart = b.effectiveFrom || today;
  return aStart <= (b.effectiveTo || OPEN_END) && bStart <= (a.effectiveTo || OPEN_END);
}
export function describeQtyRange(row: Pick<ItemQtyPriceRow, "fromQty" | "toQty">): string {
  const from = formatQty(toNumberOrNull(row.fromQty) ?? 0);
  const to = upperQtyOf(row);
  return to === null ? `${from} & above` : `${from}–${formatQty(to)}`;
}
export const DUPLICATE_SLAB_MESSAGE =
  "This Company/Branch/Customer/Price Level/Unit/Qty range combination is already added.";

// ── Save-time validation ───────────────────────────────────────────────────
export type SlabProblem = {
  /** The row to put the cursor on; null for a grid-wide problem. */
  localId: string | null;
  cell: SlabCell | null;
  message: string;
};
// Qt validateGrid, in its order and words, row by row; then what the server
// refuses (notes 139 A4 and the slab model) so the operator meets it on the
// row rather than as a 400/409 after the round trip. Rows are numbered by
// grid position, as on screen.
export function findSlabProblem(
  rows: readonly ItemQtyPriceRow[],
  unitIds: readonly string[],
  today: string,
): SlabProblem | null {
  let anyRealRow = false;
  for (const [index, row] of rows.entries()) {
    if (!hasUnit(row)) continue; // a still-blank line, not a slab
    anyRealRow = true;
    const n = index + 1;
    const at = (cell: SlabCell, message: string): SlabProblem => ({
      localId: row.localId,
      cell,
      message,
    });
    // Checked once the item's unit list is known — before then every row fails.
    if (unitIds.length > 0 && !unitIds.includes(row.itemUnitId)) {
      return at("unit", `Row ${n}'s unit must be one of this item's units.`);
    }
    if (!row.fromQty.trim()) return at("fromQty", `Row ${n}'s From Qty is required.`);
    if (!row.value.trim()) {
      return at("value", `Slab ${n} needs its mode and value (% off, ₹ off or a fixed price).`);
    }
    const fromQty = toNumberOrNull(row.fromQty);
    const typedTo = row.toQty.trim() ? toNumberOrNull(row.toQty) : 0;
    const value = toNumberOrNull(row.value);
    if (fromQty === null || fromQty < 0) {
      return at("fromQty", `Row ${n}'s From Qty must be a number, 0 or more.`);
    }
    if (typedTo === null || typedTo < 0) {
      return at("toQty", `Row ${n}'s To Qty must be a number, or blank for "& above".`);
    }
    if (value === null || value < 0) {
      return at("value", `Row ${n}'s value must be a number, 0 or more.`);
    }
    const toQty = upperQtyOf(row);
    if (toQty !== null && toQty <= fromQty) {
      return at("toQty", `Row ${n}'s To Qty must be more than its From Qty (blank = "& above").`);
    }
    if (row.priceMode === "P" && value > 100) {
      return at("value", `Row ${n}'s % off cannot be more than 100.`);
    }
    if (row.effectiveTo && row.effectiveTo < (row.effectiveFrom || today)) {
      return at("effectiveTo", `Row ${n}'s To date is before its From date.`);
    }
    const key = buildRowUniquenessKey(row);
    for (let earlier = 0; earlier < index; earlier += 1) {
      const other = rows[earlier];
      if (hasUnit(other) && buildRowUniquenessKey(other) === key) {
        return at(
          "unit",
          `Row ${n}'s Company/Branch/Customer/Price Level/Unit/Qty range is already added.`,
        );
      }
    }
    for (let earlier = 0; earlier < index; earlier += 1) {
      const other = rows[earlier];
      if (hasUnit(other) && slabsOverlap(other, row, today)) {
        return at(
          "fromQty",
          `Row ${n}'s qty range overlaps row ${earlier + 1} (${describeQtyRange(other)}) for the same unit and scope. Close one range where the other starts, or end one date first.`,
        );
      }
    }
  }
  if (!anyRealRow) {
    return { localId: null, cell: null, message: "Add at least one pricing row with a valid unit." };
  }
  return null;
}

// ── Server refusals ────────────────────────────────────────────────────────
// Which cell a refused field names. `<i>.iqp_from_qty` is the overlap's own
// index into the batch; `items.<i>.<field>` is the DTO validation's.
const REFUSAL_FIELD_CELL: Readonly<Record<string, SlabCell>> = {
  iqp_item_unit_id: "unit",
  iqp_from_qty: "fromQty",
  iqp_to_qty: "toQty",
  iqp_price_mode: "mode",
  iqp_disc_pct: "value",
  iqp_flat_off: "value",
  iqp_price: "value",
  iqp_effective_from: "effectiveFrom",
  iqp_effective_to: "effectiveTo",
  iqp_company_id: "company",
  iqp_branch_id: "branch",
  iqp_party_id: "party",
  iqp_price_level: "priceLevel",
};
export function locateSlabRefusal(
  field: string,
  sentCount: number,
): { index: number | null; cell: SlabCell | null } {
  const text = field.trim();
  const match = /^(?:items\.)?(\d+)\.(.+)$/.exec(text);
  // The per-row checks name the field alone; with one slab sent it is that one.
  const index = match ? Number(match[1]) : sentCount === 1 ? 0 : null;
  return {
    index: index !== null && index < sentCount ? index : null,
    cell: REFUSAL_FIELD_CELL[match ? match[2] : text] ?? null,
  };
}

// ── Save payload ───────────────────────────────────────────────────────────
// The server reads iqp_created_by only when inserting and iqp_modified_by only
// when updating, so stamp the logged-in user's name onto whichever applies.
// Omitted entirely when no name is available — the server then falls back to
// the JWT user id.
export function buildSavePayload(
  row: ItemQtyPriceRow,
  actorName: string | null | undefined,
  today: string,
): SaveItemQtyPriceDto {
  const actor = actorName?.trim() ? actorName.trim() : null;
  const actorFields: Partial<SaveItemQtyPriceDto> = actor
    ? row.iqpId
      ? { iqp_modified_by: actor }
      : { iqp_created_by: actor }
    : {};
  const figure = toNumberOrNull(row.value);
  return {
    ...(row.iqpId ? { iqp_id: row.iqpId } : {}),
    ...actorFields,
    iqp_item_id: row.itemId,
    iqp_item_unit_id: row.itemUnitId,
    // No scope picked = the slab applies to all (null, not "").
    iqp_company_id: row.companyId || null,
    iqp_branch_id: row.branchId || null,
    iqp_party_id: row.partyId || null,
    iqp_price_level: toNumberOrNull(row.priceLevel),
    iqp_from_qty: toNumberOrNull(row.fromQty) ?? 0,
    iqp_to_qty: upperQtyOf(row),
    iqp_price_mode: row.priceMode,
    iqp_disc_pct: row.priceMode === "P" ? figure : null,
    iqp_flat_off: row.priceMode === "R" ? figure : null,
    iqp_price: row.priceMode === "F" ? figure : null,
    iqp_is_tax_incl: row.isTaxIncl,
    // Required by the API: an unset From date starts today.
    iqp_effective_from: row.effectiveFrom || today,
    // Sent as null rather than omitted: the update path keeps a stored To date
    // for an omitted key, so clearing one would silently not stick.
    iqp_effective_to: row.effectiveTo || null,
    iqp_is_active: row.isActive,
  };
}
// The list endpoint returns `data` as an array, but tolerate a single object
// too — one sampled response shape came back that way.
export function normalizeListPayload(data: unknown): ItemQtyPricePayload[] {
  if (Array.isArray(data)) return data as ItemQtyPricePayload[];
  if (data && typeof data === "object") return [data as ItemQtyPricePayload];
  return [];
}

// ── Today's prices and the preview ─────────────────────────────────────────
/** What the preview needs of a `/stock/price-bulk` row (Change Selling Price's list). */
export type PriceRowLike = {
  uomId: string;
  mrp: number | null;
  salePrice: number | null;
  maxPrice: number | null;
  levels?: ReadonlyArray<{ level: number; price: number }> | null;
};
export type UnitPricesToday = { levels: Record<number, number>; maxPrice: number };
// The headline row per unit — a row with an MRP or sale price is one bucket's
// stock, not the item's price — keyed by its iuc_id, first one wins.
export function headlinePricesByUnit(
  rows: readonly PriceRowLike[] | undefined,
): Record<string, UnitPricesToday> {
  const byUnit: Record<string, UnitPricesToday> = {};
  for (const row of rows ?? []) {
    if (row.mrp !== null && row.mrp !== undefined) continue;
    if (row.salePrice !== null && row.salePrice !== undefined) continue;
    if (!row.uomId || byUnit[row.uomId]) continue;
    const levels: Record<number, number> = {};
    for (const level of row.levels ?? []) {
      levels[Number(level.level)] = Number(level.price) || 0;
    }
    byUnit[row.uomId] = { levels, maxPrice: Number(row.maxPrice) || 0 };
  }
  return byUnit;
}
export type PriceLevelInfo = { short: string; active: boolean };
export function priceLevelInfoById(
  rows:
    | ReadonlyArray<{ priceLvlId: number; priceLvlShort: string | null; priceLvlIsActive: boolean }>
    | undefined,
): Record<number, PriceLevelInfo> {
  const byId: Record<number, PriceLevelInfo> = {};
  for (const row of rows ?? []) {
    byId[row.priceLvlId] = { short: (row.priceLvlShort ?? "").trim(), active: row.priceLvlIsActive };
  }
  return byId;
}
// WS / RET …, or A, B … for a level the master has not named.
function levelName(level: number, levels: Record<number, PriceLevelInfo>): string {
  return levels[level]?.short || String.fromCharCode(64 + level);
}
export function formatRupees(value: number): string {
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function formatQty(value: number): string {
  return String(Number(value.toPrecision(10)));
}
function formatPercent(value: number): string {
  return String(Number(value.toPrecision(6)));
}
export const DEFAULT_PRICE_LEVEL_SETTING_KEY = "sales.default_price_level";
// The level a slab with none is previewed at: the house default, 1..4 as Qt
// bounds it (AppSession::salesDefaultPriceLevel), 1 when unset.
export function defaultPriceLevelOf(rows: readonly EffectiveSetting[] | undefined): number {
  const row = rows?.find((candidate) => candidate.asdKey === DEFAULT_PRICE_LEVEL_SETTING_KEY);
  const parsed = Number.parseInt(row?.value ?? row?.asdDefaultValue ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(4, Math.max(1, parsed)) : 1;
}
// "Today (BOX): WS ₹105.00 · RET ₹110.00 · MRP ₹150.00" — the four levels and
// MRP at this branch, for the current slab's unit. A level the company has not
// switched on is left out.
export function describeTodayLine(args: {
  hasItem: boolean;
  prices: UnitPricesToday | null;
  unitName: string;
  levels: Record<number, PriceLevelInfo>;
}): string {
  const { hasItem, prices, unitName, levels } = args;
  if (!hasItem) return "Pick an item to see its prices today.";
  if (!prices) return `No price at this branch yet${unitName ? ` for ${unitName}` : ""}.`;
  const parts: string[] = [];
  for (let level = 1; level <= 4; level += 1) {
    const price = prices.levels[level] ?? 0;
    if (price > 0 && (levels[level]?.active ?? true)) {
      parts.push(`${levelName(level, levels)} ${formatRupees(price)}`);
    }
  }
  if (prices.maxPrice > 0) parts.push(`MRP ${formatRupees(prices.maxPrice)}`);
  return `Today (${unitName}): ${parts.join(" · ")}`;
}
export type SlabPreview =
  | { kind: "hint"; text: string }
  | {
      kind: "slab";
      /** "Buy 10–20 BOX at WS: 5% off". */
      lead: string;
      /** The price each, when there is one to work from. */
      each: string | null;
      /** Today's price at that level, when there is one. */
      today: string | null;
      dearer: boolean;
      inactive: boolean;
    };
// What the current slab makes of today's price (Qt refreshPreview): "Buy
// 10–20 BOX at WS: 5% off → ₹99.75 each (today ₹105.00)". A slab with no level
// is read at the house default.
export function describeSlabPreview(args: {
  hasItem: boolean;
  /** The current real slab, or null on the blank line / with no item. */
  row: ItemQtyPriceRow | null;
  unitName: string;
  prices: UnitPricesToday | null;
  levels: Record<number, PriceLevelInfo>;
  defaultLevel: number;
}): SlabPreview {
  const { hasItem, row, unitName, prices, levels, defaultLevel } = args;
  if (!row) {
    return {
      kind: "hint",
      text: hasItem
        ? "+ adds a slab: pick its unit, the quantity range, the mode and its value."
        : "Each slab: buy this many, get this price. Pick an item, then add slabs.",
    };
  }
  const fromQty = toNumberOrNull(row.fromQty) ?? 0;
  const toQty = upperQtyOf(row);
  const qty = toQty === null ? `${formatQty(fromQty)} or more` : `${formatQty(fromQty)}–${formatQty(toQty)}`;
  const buy = `Buy ${[qty, unitName].filter(Boolean).join(" ")}`;
  if (!row.value.trim()) return { kind: "hint", text: `${buy}: choose the mode and its value.` };
  const level = row.priceLevel ? Number(row.priceLevel) : Math.min(4, Math.max(1, defaultLevel));
  const base = prices?.levels[level] ?? 0;
  const value = toNumberOrNull(row.value) ?? 0;
  let what: string;
  let each: number;
  if (row.priceMode === "P") {
    what = `${formatPercent(value)}% off`;
    each = base * (1 - value / 100);
  } else if (row.priceMode === "R") {
    what = `${formatRupees(value)} off`;
    each = base - value;
  } else {
    what = `fixed ${formatRupees(value)}`;
    each = value;
  }
  const showsEach = base > 0 || row.priceMode === "F";
  return {
    kind: "slab",
    lead: `${buy} at ${levelName(level, levels)}: ${what}`,
    each: showsEach ? formatRupees(each) : null,
    today: showsEach && base > 0 ? formatRupees(base) : null,
    dearer: base > 0 && each > base + 0.005,
    inactive: !row.isActive,
  };
}

// ── Screen memory ──────────────────────────────────────────────────────────
// The screen-memory slot (lib/screen-memory) unsaved slab rows wait in while
// the operator is on another menu screen.
export const ITEM_QTY_PRICE_MEMORY_KEY = "masters/item-qty-price";
// What the screen keeps across that trip: the item it is scoped to, the grid
// with its edits, the slab the panel follows, the barcode box, and the item's
// unit list (the Uom menu offers only those). The saved rows are not re-read
// on the way back, so they can be stale — the server checks every row again
// at Save.
export type ItemQtyPriceSnapshot = {
  /** The header's tenant when it was taken. */
  tenant: ScreenScope;
  activeItem: { id: string; label: string } | null;
  rows: ItemQtyPriceRow[];
  currentLocalId: string | null;
  barcode: string;
  unitOptionsByItemId: Record<string, ERPDynamicSelectOption[]>;
};
// Kept while any row holds an unsaved edit; a save, a Clear or an item switch
// leaves none, and so lets it go.
export function isQtyPriceWorkWorthRemembering(
  snapshot: Pick<ItemQtyPriceSnapshot, "rows">,
): boolean {
  return snapshot.rows.some((row) => row.isDirty);
}
