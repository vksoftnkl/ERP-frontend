import type { ERPDynamicModalField } from "@/components/design-system/ui/dynamic-modal-form";
import type { MasterTableRow } from "@/components/master/crud-master-page.types";
import { getFirstDefinedValue, toDisplayValue } from "@/features/masters/shared/value-mappers";
import type {
  ResolvedFieldConfig,
  WidgetMasterSectionConfig,
} from "@/features/masters/shared/widget-config";
import {
  parseLinkedRecordRows,
  serializeLinkedRecordRows,
  type LinkedRecordRow,
} from "./item-linked-records-editor.shared";
import { detachItemPriceRowsFromStored } from "./item-price-grid.utils";
import {
  ITEM_EAN_ROWS_FIELD_NAME,
  ITEM_PRICE_ROWS_FIELD_NAME,
  ITEM_REORDER_ROWS_FIELD_NAME,
  ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME,
  LOOKUP_KEYS,
} from "./item-master-page.constants";

/**
 * The Item card's own rules, ported from the Qt ItemEntry (21/22-10-26: Qt
 * cb8fe0a, 54b0eed, 4ae6575). Pure functions over the form's values and the
 * grids' rows, so the page wires them and vitest pins them.
 *
 * The form keeps a few values no field renders. Their names carry the `iuc_` /
 * `ean_` prefixes on purpose: "Save as Default Template" drops every key with a
 * row-editor prefix (ITEM_TEMPLATE_EXCLUDED_PREFIXES), and none of these may
 * ever become a default for the next item.
 */

/** A saved item's stored base unit (the base row's unit at load). Blank = not locked. */
export const ITEM_LOCKED_BASE_UNIT_FIELD = "iuc_locked_base_unit_id";
/** "true" when that stored base row was the LAST unit row (biggest-first data). */
export const ITEM_LOCKED_BASE_WAS_LAST_FIELD = "iuc_locked_base_was_last";
/** The stored DEFAULT EAN row the Default Barcode field stands for — its id, unit and active flag. */
export const ITEM_DEFAULT_EAN_ID_FIELD = "ean_default_row_id";
export const ITEM_DEFAULT_EAN_UNIT_FIELD = "ean_default_row_unit_id";
export const ITEM_DEFAULT_EAN_ACTIVE_FIELD = "ean_default_row_active";

/** Every hidden value above, blank — what a new item (or a copy) starts with. */
export const ITEM_CARD_HIDDEN_INITIAL_VALUES: Record<string, string> = {
  [ITEM_LOCKED_BASE_UNIT_FIELD]: "",
  [ITEM_LOCKED_BASE_WAS_LAST_FIELD]: "",
  [ITEM_DEFAULT_EAN_ID_FIELD]: "",
  [ITEM_DEFAULT_EAN_UNIT_FIELD]: "",
  [ITEM_DEFAULT_EAN_ACTIVE_FIELD]: "",
};

/** item_master.item_notes is varchar(250): longer is refused, never cut (Qt cb8fe0a). */
export const ITEM_NOTES_MAX_LENGTH = 250;
/** The Default Barcode field IS an EAN row now, so it takes ean_code's size. */
export const ITEM_DEFAULT_BARCODE_MAX_LENGTH = 64;

export const ITEM_SAVED_ROW_REMOVAL_MESSAGE =
  "This row is saved, so it can't be removed. Only a new row can be removed.";
export const ITEM_BASE_UNIT_REMOVAL_MESSAGE =
  "The base unit cannot be removed once the item is saved — stock is counted in it.";
export const ITEM_BASE_UNIT_REPICK_MESSAGE =
  "The base unit cannot be changed once the item is saved — stock is counted in it.\n\n" +
  "If it is wrong, make this item inactive and create a new one.";
export const ITEM_BASE_UNIT_CHANGED_MESSAGE =
  "The base unit cannot be changed once the item is saved — stock is counted in it.";
export const ITEM_BASE_UNIT_NOT_LAST_MESSAGE =
  "Enter units from the BIGGEST to the smallest: the base unit (the smallest, what stock is " +
  "counted in) must be the LAST row.\n\n" +
  "Example: BOX (factor 1), then PCS (factor 10 = 10 PCS in a BOX, base).";

function text(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function isTrue(value: unknown): boolean {
  return value === true || text(value).toLowerCase() === "true";
}

// ─── Plain field checks ─────────────────────────────────────────────────────

/** Notes over 250 characters are refused with the count, so the operator shortens them. */
export function validateItemNotes(value: string): string | null {
  const length = (value ?? "").length;
  return length > ITEM_NOTES_MAX_LENGTH
    ? `Notes can hold ${ITEM_NOTES_MAX_LENGTH} characters; this has ${length}. Shorten it.`
    : null;
}

/**
 * HSN / SAC: digits only, at most 8 (the server refuses anything else), plus the
 * company's minimum length when one is set (0 = not enforced).
 */
export function validateItemHsnCode(value: string, minLength: number): string | null {
  const hsn = (value ?? "").trim();
  if (!hsn) {
    return null;
  }
  if (minLength > 0 && hsn.length < minLength) {
    return `HSN Code must be at least ${minLength} digits.`;
  }
  if (hsn.length > 8 || !/^[0-9]+$/.test(hsn)) {
    return "HSN Code must be digits only, at most 8.";
  }
  return null;
}

// ─── Row grids: what "-" may remove ─────────────────────────────────────────

/**
 * The index `previous` lost to become `next` when exactly one row was taken
 * out, else -1. Rows are compared whole, so an edit elsewhere is never read as
 * a removal.
 */
export function findRemovedLinkedRowIndex(
  previous: readonly LinkedRecordRow[],
  next: readonly LinkedRecordRow[],
): number {
  if (next.length !== previous.length - 1) {
    return -1;
  }
  const same = (left: LinkedRecordRow | undefined, right: LinkedRecordRow | undefined) =>
    JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
  let removed = next.length;
  for (let index = 0; index < next.length; index += 1) {
    if (!same(previous[index], next[index])) {
      removed = index;
      break;
    }
  }
  for (let index = removed; index < next.length; index += 1) {
    if (!same(previous[index + 1], next[index])) {
      return -1;
    }
  }
  return removed;
}

/**
 * "-" removes only a row added since the card was opened (Qt 4ae6575): a saved
 * row — one carrying its stored id — stays. Returns the refusal, or null when
 * the change is not the removal of a saved row.
 */
export function refuseSavedLinkedRowRemoval(
  previous: readonly LinkedRecordRow[],
  next: readonly LinkedRecordRow[],
  idKey: string,
): string | null {
  const removed = findRemovedLinkedRowIndex(previous, next);
  if (removed < 0) {
    return null;
  }
  return text(previous[removed]?.[idKey]) ? ITEM_SAVED_ROW_REMOVAL_MESSAGE : null;
}

// ─── Unit Conversion: the base unit (Qt 54b0eed, server notes 138) ──────────

export type ItemBaseUnitLock = {
  /** The base unit stored on a saved item; blank on a new item, a copy, or an item with no unit rows yet. */
  lockedBaseUnitId: string;
  /** The stored base row was the last row. An older item may keep its base higher up. */
  baseWasLast: boolean;
};

export function readItemBaseUnitLock(values: Record<string, string>): ItemBaseUnitLock {
  return {
    lockedBaseUnitId: text(values[ITEM_LOCKED_BASE_UNIT_FIELD]),
    baseWasLast: text(values[ITEM_LOCKED_BASE_WAS_LAST_FIELD]) !== "false",
  };
}

export function isItemBaseUnitLocked(lock: ItemBaseUnitLock): boolean {
  return lock.lockedBaseUnitId !== "";
}

const hasUnit = (row: LinkedRecordRow | undefined) => text(row?.iuc_unit_id) !== "";
const isBase = (row: LinkedRecordRow | undefined) => isTrue(row?.iuc_is_base_unit);
const isDefault = (row: LinkedRecordRow | undefined) => isTrue(row?.iuc_is_default_unit);

/**
 * The hidden values a loaded item carries for the lock: its base row's unit,
 * and whether that row was the last unit row.
 */
export function buildItemBaseUnitLockValues(
  unitConversionRows: readonly Record<string, unknown>[],
): Record<string, string> {
  const unitRows = unitConversionRows.filter((row) => text(row.iuc_unit_id) !== "");
  const baseIndex = unitRows.findIndex((row) => isTrue(row.iuc_is_base_unit));
  if (baseIndex < 0) {
    return { [ITEM_LOCKED_BASE_UNIT_FIELD]: "", [ITEM_LOCKED_BASE_WAS_LAST_FIELD]: "" };
  }
  return {
    [ITEM_LOCKED_BASE_UNIT_FIELD]: text(unitRows[baseIndex]?.iuc_unit_id),
    [ITEM_LOCKED_BASE_WAS_LAST_FIELD]: baseIndex === unitRows.length - 1 ? "true" : "false",
  };
}

function withBaseAt(rows: LinkedRecordRow[], baseIndex: number, moveDefault: boolean): LinkedRecordRow[] {
  return rows.map((row, index) => {
    const nextRow: LinkedRecordRow = { ...row, iuc_is_base_unit: index === baseIndex ? "true" : "false" };
    if (moveDefault) {
      nextRow.iuc_is_default_unit = index === baseIndex ? "true" : "false";
    }
    return nextRow;
  });
}

export type ItemUnitConversionRuleResult = {
  rows: LinkedRecordRow[];
  /** Said to the operator when the change was refused (`rows` is then the previous grid). */
  refusal: string | null;
};

/**
 * One Unit Conversion grid edit, run through the base-unit rules. Units run
 * biggest first, base LAST — stock is counted in the base.
 *
 *  - New item: the base FOLLOWS the last unit row. A unit picked on the
 *    trailing blank row becomes the base (the default stays where it was);
 *    removing the base hands it to the new last row, taking the default along
 *    only when the default went with the removed row.
 *  - Saved item (a base unit stored): the base never changes. Its unit cannot
 *    be re-picked, its row cannot be removed, and a new unit goes in straight
 *    ABOVE it, factor blank for the operator to type — or factor 1 when the
 *    base was the only unit, the base row then taking the blank factor.
 *  - Either way a saved row (it has its iuc_id) cannot be removed.
 *
 * The To-Base chain is re-derived downstream (syncSerializedItemUnitConversionRows).
 */
export function applyItemUnitConversionBaseRules(
  previous: readonly LinkedRecordRow[],
  next: readonly LinkedRecordRow[],
  lock: ItemBaseUnitLock,
): ItemUnitConversionRuleResult {
  const locked = isItemBaseUnitLocked(lock);
  const rows = [...next];
  const refuse = (refusal: string): ItemUnitConversionRuleResult => ({ rows: [...previous], refusal });

  const removed = findRemovedLinkedRowIndex(previous, next);
  if (removed >= 0) {
    const removedRow = previous[removed];
    if (!hasUnit(removedRow)) {
      return { rows, refusal: null };
    }
    if (text(removedRow?.iuc_id)) {
      return refuse(ITEM_SAVED_ROW_REMOVAL_MESSAGE);
    }
    if (locked && isBase(removedRow)) {
      return refuse(ITEM_BASE_UNIT_REMOVAL_MESSAGE);
    }
    if (isBase(removedRow)) {
      let lastUnitIndex = -1;
      rows.forEach((row, index) => {
        if (hasUnit(row)) {
          lastUnitIndex = index;
        }
      });
      if (lastUnitIndex >= 0) {
        return { rows: withBaseAt(rows, lastUnitIndex, !rows.some(isDefault)), refusal: null };
      }
    }
    return { rows, refusal: null };
  }

  if (next.length === previous.length) {
    // A stored base row re-pointed at another unit (the cell is read-only,
    // so this only guards the rule itself).
    if (locked) {
      for (const [index, row] of previous.entries()) {
        if (isBase(row) && hasUnit(row) && text(next[index]?.iuc_unit_id) !== text(row.iuc_unit_id)) {
          return refuse(ITEM_BASE_UNIT_REPICK_MESSAGE);
        }
      }
    }
    return { rows, refusal: null };
  }

  // A unit picked on the trailing blank row: the editor appended a new blank.
  const pickedIndex = previous.length - 1;
  const isAppend =
    next.length === previous.length + 1 &&
    pickedIndex >= 0 &&
    !hasUnit(previous[pickedIndex]) &&
    hasUnit(next[pickedIndex]);
  if (!isAppend) {
    return { rows, refusal: null };
  }
  if (!locked) {
    return { rows: withBaseAt(rows, pickedIndex, false), refusal: null };
  }
  const baseIndex = rows.findIndex(isBase);
  if (baseIndex < 0 || baseIndex >= pickedIndex) {
    return { rows, refusal: null };
  }
  const picked: LinkedRecordRow = {
    ...(rows[pickedIndex] ?? {}),
    iuc_is_base_unit: "false",
    iuc_is_default_unit: "false",
    iuc_unit_factor: baseIndex === 0 ? "1" : "",
  };
  const reordered = rows.filter((_, index) => index !== pickedIndex);
  reordered.splice(baseIndex, 0, picked);
  if (baseIndex === 0) {
    reordered[1] = { ...(reordered[1] ?? {}), iuc_unit_factor: "" };
  }
  return { rows: reordered, refusal: null };
}

/**
 * The save's word on the unit ladder, over the unit-bearing rows. `unitName`
 * names a row's unit for the message.
 *  - every row below the first steps DOWN: its factor (how many of it make one
 *    of the row above) is at least 1;
 *  - a saved item still has the base unit it was stored with;
 *  - the base is the last row — except an older item whose stored base was not.
 */
export function validateItemUnitConversionLadder(
  rows: readonly LinkedRecordRow[],
  lock: ItemBaseUnitLock,
  unitName: (unitId: string) => string,
  parseFactor: (row: LinkedRecordRow) => number | null,
): string | null {
  for (const [index, row] of rows.entries()) {
    if (index === 0) {
      continue;
    }
    const factor = parseFactor(row);
    if (factor !== null && factor > 0 && factor < 1) {
      return (
        `Row ${index + 1}'s factor is how many ${unitName(text(row.iuc_unit_id))} make one ` +
        `${unitName(text(rows[index - 1]?.iuc_unit_id))}, so it cannot be less than 1.\n\n` +
        "Enter units from the biggest to the smallest."
      );
    }
  }
  const baseIndex = rows.findIndex(isBase);
  if (baseIndex < 0) {
    return null;
  }
  const locked = isItemBaseUnitLocked(lock);
  if (locked && text(rows[baseIndex]?.iuc_unit_id) !== lock.lockedBaseUnitId) {
    return ITEM_BASE_UNIT_CHANGED_MESSAGE;
  }
  if ((!locked || lock.baseWasLast) && baseIndex !== rows.length - 1) {
    return ITEM_BASE_UNIT_NOT_LAST_MESSAGE;
  }
  return null;
}

// ─── Reorder levels (Qt cb8fe0a + the reorder delegate of 4ae6575) ──────────

const REORDER_QUANTITY_FIELDS = [
  ["ir_min_level", "Min Level"],
  ["ir_max_level", "Max Level"],
  ["ir_reorder_level", "Reorder Level"],
  ["ir_reorder_qty", "Reorder Qty"],
] as const;

/**
 * Quantities are numbers, never negative; the minimum may not pass the maximum
 * (the server refuses it; a 0 maximum = no ceiling); and a reorder level lies
 * between the two.
 */
export function validateItemReorderLevels(rows: readonly LinkedRecordRow[]): string | null {
  for (const [index, row] of rows.entries()) {
    const label = `Reorder row ${index + 1}`;
    const amounts: Record<string, number> = {};
    for (const [key, name] of REORDER_QUANTITY_FIELDS) {
      const raw = text(row[key]);
      const amount = raw === "" ? 0 : Number(raw);
      if (!Number.isFinite(amount)) {
        return `${label}: ${name} must be a number.`;
      }
      if (amount < 0) {
        return `${label}: ${name} cannot be negative.`;
      }
      amounts[key] = amount;
    }
    const min = amounts.ir_min_level ?? 0;
    const max = amounts.ir_max_level ?? 0;
    const level = amounts.ir_reorder_level ?? 0;
    if (max > 0 && min > max) {
      return `${label}: the minimum level is above the maximum.`;
    }
    if (level > 0 && (level < min || (max > 0 && level > max))) {
      return `${label}: the reorder level must lie between the minimum and the maximum.`;
    }
  }
  return null;
}

// ─── The Default Barcode field = the item's DEFAULT EAN row (Qt 54b0eed) ────

export type ItemDefaultEanSplit<T> = {
  /** The stored default row, shown in the Default Barcode field. */
  defaultRow: T | null;
  /** Every other barcode — what the Barcodes grid holds. */
  extras: T[];
};

/**
 * Takes the item's DEFAULT EAN row out of the barcode list. An item from before
 * the rule may have no row marked default: then the row carrying the item's
 * stored default barcode (case-insensitively) is that row, if there is one.
 */
export function splitItemDefaultEanRow<T extends Record<string, unknown>>(
  rows: readonly T[],
  legacyDefaultBarcode: string,
): ItemDefaultEanSplit<T> {
  let defaultIndex = rows.findIndex((row) => isTrue(row.ean_is_default));
  const legacy = text(legacyDefaultBarcode).toLowerCase();
  if (defaultIndex < 0 && legacy) {
    defaultIndex = rows.findIndex((row) => text(row.ean_code).toLowerCase() === legacy);
  }
  return {
    defaultRow: defaultIndex >= 0 ? (rows[defaultIndex] ?? null) : null,
    extras: rows.filter((_, index) => index !== defaultIndex),
  };
}

/** The hidden values remembering which stored row the Default Barcode field is. */
export function buildItemDefaultEanValues(defaultRow: Record<string, unknown> | null): Record<string, string> {
  if (!defaultRow) {
    return {
      [ITEM_DEFAULT_EAN_ID_FIELD]: "",
      [ITEM_DEFAULT_EAN_UNIT_FIELD]: "",
      [ITEM_DEFAULT_EAN_ACTIVE_FIELD]: "",
    };
  }
  const active = defaultRow.ean_is_active === undefined || isTrue(defaultRow.ean_is_active);
  return {
    [ITEM_DEFAULT_EAN_ID_FIELD]: text(defaultRow.ean_id),
    [ITEM_DEFAULT_EAN_UNIT_FIELD]: text(defaultRow.ean_unit_id),
    [ITEM_DEFAULT_EAN_ACTIVE_FIELD]: active ? "true" : "false",
  };
}

/** The field's code may not repeat a code in the grid — a barcode is unique across every item. */
export function validateItemDefaultBarcodeAgainstGrid(
  defaultBarcode: string,
  gridRows: readonly LinkedRecordRow[],
): string | null {
  const code = text(defaultBarcode);
  if (!code) {
    return null;
  }
  const repeated = gridRows.some((row) => text(row.ean_code).toLowerCase() === code.toLowerCase());
  return repeated
    ? `Barcode ${code} is already the item's main barcode (Default Barcode field). Remove it from the barcodes list.`
    : null;
}

export type BuildItemEanPayloadArgs = {
  itemId: string;
  values: Record<string, string>;
  /** The grid's real rows (no blank placeholder). */
  gridRows: readonly LinkedRecordRow[];
  /** Units on the item now (its Unit Conversion rows). */
  itemUnitIds: ReadonlySet<string>;
  /** The base unit — a NEW default barcode is the one printed on the piece. */
  baseUnitId: string;
};

/**
 * ean_codes[] for the save, and the item_default_barcode copy. The field goes
 * first as the default row (sl 1), updating the stored default row in place
 * (its id); its unit is the stored row's own while that unit is still on the
 * item, else the base unit. The grid rows follow as extras. Field empty: the
 * first grid row is the default instead, and a stored default row left out is
 * removed by the server's sync.
 */
export function buildItemEanPayload({
  itemId,
  values,
  gridRows,
  itemUnitIds,
  baseUnitId,
}: BuildItemEanPayloadArgs): { rows: Record<string, unknown>[]; defaultBarcode: string | null } {
  const rows: Record<string, unknown>[] = [];
  const fieldCode = text(values.item_default_barcode);
  if (fieldCode) {
    const storedUnitId = text(values[ITEM_DEFAULT_EAN_UNIT_FIELD]);
    const row: Record<string, unknown> = {
      ean_item_id: itemId,
      ean_sl_no: 1,
      ean_unit_id: storedUnitId && itemUnitIds.has(storedUnitId) ? storedUnitId : baseUnitId,
      ean_code: fieldCode,
      ean_is_default: true,
      ean_is_active: text(values[ITEM_DEFAULT_EAN_ACTIVE_FIELD]) !== "false",
      ean_remarks: null,
    };
    const storedId = text(values[ITEM_DEFAULT_EAN_ID_FIELD]);
    if (storedId) {
      row.ean_id = storedId;
    }
    rows.push(row);
  }
  for (const gridRow of gridRows) {
    const row: Record<string, unknown> = {
      ean_item_id: itemId,
      ean_sl_no: rows.length + 1,
      ean_unit_id: text(gridRow.ean_unit_id) || baseUnitId,
      ean_code: text(gridRow.ean_code),
      ean_is_default: rows.length === 0,
      ean_is_active: text(gridRow.ean_is_active) !== "false",
      ean_remarks: text(gridRow.ean_remarks) || null,
    };
    const id = text(gridRow.ean_id);
    if (id) {
      row.ean_id = id;
    }
    rows.push(row);
  }
  const first = rows[0];
  return { rows, defaultBarcode: first ? text(first.ean_code) || null : null };
}

// ─── Copy from Item (Qt 54b0eed) ────────────────────────────────────────────

const clearRowIds = (serializedRows: string, idKey: string) => {
  const rows = parseLinkedRecordRows(serializedRows ?? "");
  return rows.length === 0 ? serializedRows : serializeLinkedRecordRows(rows.map((row) => ({ ...row, [idKey]: "" })));
};

const detachPriceRows = (serializedRows: string) => {
  const rows = parseLinkedRecordRows(serializedRows ?? "");
  return rows.length === 0 ? serializedRows : serializeLinkedRecordRows(detachItemPriceRowsFromStored(rows));
};

/**
 * A loaded item's form values, turned into a NEW item built from it: no row
 * keeps a stored id (each saves as a new row), and what is unique or belongs to
 * the source alone is left out — item code, barcodes (unique across every
 * item), image, kit items. The base unit is not locked (a new item). The name
 * stays, for the operator to type over.
 */
export function detachItemFormValuesAsCopy(values: Record<string, string>): Record<string, string> {
  return {
    ...values,
    ...ITEM_CARD_HIDDEN_INITIAL_VALUES,
    item_code: "",
    item_default_barcode: "",
    item_image_url: "",
    item_photo_file: "",
    item_packing_item_ids: "",
    ipm_id: "",
    ir_id: "",
    ean_id: "",
    ean_code: "",
    [ITEM_EAN_ROWS_FIELD_NAME]: "",
    [ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME]: clearRowIds(values[ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME] ?? "", "iuc_id"),
    // The price grid's own stored extras (bucket, loaded copy, schedule) go too.
    [ITEM_PRICE_ROWS_FIELD_NAME]: detachPriceRows(values[ITEM_PRICE_ROWS_FIELD_NAME] ?? ""),
    [ITEM_REORDER_ROWS_FIELD_NAME]: clearRowIds(values[ITEM_REORDER_ROWS_FIELD_NAME] ?? "", "ir_id"),
  };
}

const IDENTITY_FIELDS = ["item_name_en", "item_name_ta", "item_alias", "item_sku", "item_code", "item_default_barcode"];

/**
 * Whether a new item's form holds something the operator typed, so copying an
 * item over it must ask first: any identity text, or a unit / barcode / reorder
 * row with content.
 */
export function hasTypedItemEntries(values: Record<string, string>): boolean {
  if (IDENTITY_FIELDS.some((name) => text(values[name]) !== "")) {
    return true;
  }
  const anyRow = (fieldName: string, keys: readonly string[]) =>
    parseLinkedRecordRows(values[fieldName] ?? "").some((row) => keys.some((key) => text(row[key]) !== ""));
  return (
    anyRow(ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME, ["iuc_unit_id"]) ||
    anyRow(ITEM_PRICE_ROWS_FIELD_NAME, ["ipm_unit_id", "ipm_cost_wot", "ipm_cost_price", "ipm_sales_price_a"]) ||
    anyRow(ITEM_EAN_ROWS_FIELD_NAME, ["ean_code"]) ||
    anyRow(ITEM_REORDER_ROWS_FIELD_NAME, ["ir_unit_id", "ir_min_level", "ir_max_level", "ir_reorder_level"])
  );
}

// ─── Widget config (form_section / form_field; Qt nex_dialog applyFieldConfig) ─

/**
 * The fields a switched-off SECTION hides: every field it lists (lowercased
 * field_name, as the config map is keyed). The popup's own unsaved toggles
 * (`sectionVisibilityOverrides`) win over the stored flag.
 */
export function resolveItemHiddenSectionFieldNames(
  sections: readonly WidgetMasterSectionConfig[],
  sectionVisibilityOverrides: ReadonlyMap<number, boolean>,
): Set<string> {
  const hidden = new Set<string>();
  for (const section of sections) {
    const visible =
      sectionVisibilityOverrides.get(section.sectionId) ?? section.sectionVisibility !== false;
    if (visible) {
      continue;
    }
    for (const field of Array.isArray(section.fields) ? section.fields : []) {
      const name = (field.fieldName ?? "").trim().toLowerCase();
      if (name) {
        hidden.add(name);
      }
    }
  }
  return hidden;
}

/**
 * The config map the form is laid out from, with every field of a
 * switched-off section turned off (its order and label left alone). A field the
 * map does not know yet goes in last, the same way a popup toggle adds one.
 */
export function foldItemSectionVisibility(
  config: ReadonlyMap<string, ResolvedFieldConfig>,
  hiddenSectionFieldNames: ReadonlySet<string>,
): Map<string, ResolvedFieldConfig> {
  const folded = new Map(config);
  for (const name of hiddenSectionFieldNames) {
    const existing = folded.get(name);
    folded.set(
      name,
      existing ? { ...existing, visible: false } : { label: "", order: Number.MAX_SAFE_INTEGER, visible: false },
    );
  }
  return folded;
}

/**
 * The tab headings (`type: "heading"` field names) whose tab holds a REQUIRED
 * field. Such a tab is never taken away by a switched-off section: the save
 * needs the field, so it stays, and so does its heading (Qt fieldRequired).
 */
export function collectItemTabHeadingsWithRequiredFields(
  fields: readonly ERPDynamicModalField[],
): Set<string> {
  const headings = new Set<string>();
  let currentHeading = "";
  for (const field of fields) {
    if ((field.type ?? "text") === "heading") {
      currentHeading = field.name;
      continue;
    }
    if (field.required && currentHeading) {
      headings.add(currentHeading);
    }
  }
  return headings;
}

// ─── Item Master list (Qt item_list, 4ae6575) ───────────────────────────────

/** The list row's item id and name, for the Qty-wise Price deep link. */
export function itemListRowTarget(row: MasterTableRow | null): { itemId: string; itemName: string } | null {
  if (!row) {
    return null;
  }
  const source = row.__source ?? {};
  const itemId =
    toDisplayValue(getFirstDefinedValue(source, LOOKUP_KEYS.id)) || toDisplayValue(row.__recordId);
  if (!itemId) {
    return null;
  }
  const itemName = toDisplayValue(getFirstDefinedValue(source, LOOKUP_KEYS.name)) || row.masterName;
  return { itemId, itemName };
}
