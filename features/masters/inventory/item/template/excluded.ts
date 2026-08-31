import {
  ITEM_EAN_ROWS_FIELD_NAME,
  ITEM_PRICE_ROWS_FIELD_NAME,
  ITEM_REORDER_ROWS_FIELD_NAME,
  ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME,
} from "../item-master-page.constants";

/**
 * What identifies ONE item, and can therefore never be a default for the next
 * one. Same rule as the customer list: a template describes a KIND of item.
 *
 * HSN code, batch config, storage location and stock type are deliberately NOT
 * here — they are properties of a kind of item, and a branch that stocks one
 * kind of thing is exactly who this feature is for.
 */
export const ITEM_TEMPLATE_EXCLUDED = [
  "item_name_en",
  "item_name_ta",
  "item_code",
  "item_sku",
  "item_alias",
  "item_default_barcode",
  "item_image_url",
  "item_photo_file",
  "item_notes",
  // The kit components of one item.
  "item_packing_item_ids",
  // The four linked-row editors, serialized: one item's prices, unit
  // conversions, reorder levels and EAN codes. Rows belong to a record, not to
  // a kind of record, and a template that carried them would put another item's
  // price list on every new item.
  ITEM_PRICE_ROWS_FIELD_NAME,
  ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME,
  ITEM_REORDER_ROWS_FIELD_NAME,
  ITEM_EAN_ROWS_FIELD_NAME,
] as const;

/**
 * The row editors' own draft fields — the boxes above each linked table that
 * hold the row being added (`ipm_cost_price`, `ean_code`, `ir_min_level`, …).
 *
 * A prefix rather than a list because these are generated per table and a new
 * column would otherwise leak into every template silently.
 */
export const ITEM_TEMPLATE_EXCLUDED_PREFIXES = ["ipm_", "iuc_", "ir_", "ean_"] as const;
