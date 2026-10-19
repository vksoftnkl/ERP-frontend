/**
 * Textile Tags — endpoints, registry keys and the texts the screen shares.
 *
 * The `/textile-tags/*` routes are the server's step B-1 (notes 136) and are
 * NOT on the box yet; the item lookup is the Opening Stock one Qt calls.
 */
import type { ListKind } from "./domain/textile-tag-entity";

export const TEXTILE_TAG_ROUTE_HREF = "/stock/textile-tags";

/** Relative to the API base, which already ends in `/api/v1`. */
export const TEXTILE_TAG_RESERVE_ENDPOINT = "/textile-tags/reserve";
export const TEXTILE_TAG_SUGGEST_PRICE_ENDPOINT = "/textile-tags/suggest-price";
export const TEXTILE_TAG_ITEM_LOOKUP_ENDPOINT = "/stock/opening/item-lookup";
export const DROPDOWN_RUN_ENDPOINT = "/dropdown-details/run";

/**
 * kind = size | colour | fabric | season. Create or update one row; a name
 * that already exists answers 409 TEXTILE_TAG_LIST_DUPLICATE WITH the existing
 * row, which the quick-add takes as its answer.
 */
export function textileTagListSaveEndpoint(kind: ListKind): string {
  return `/textile-tags/lists/${kind}/save`;
}

export const TEXTILE_TAG_LIST_DUPLICATE_STATUS = 409;

/** ui_table 53 "TEXTILE TAGS - NEW TAG LINES", by name (lib/ui-tables). */
export const TEXTILE_TAG_LINES_UI_TABLE_KEY = "textileTagLines" as const;
/** Grid 71 "POPUP - ITEMS", by name (lib/configured-grids). */
export const ITEM_PICKER_GRID_KEY = "itemPickerPopup" as const;
/**
 * Grid 91 "POPUP - ITEM BRANDS" has no registry key; it is resolved by this
 * name from Grid Master's Desktop rows, with 91 as the fallback until the
 * directory lands (the same contract `lib/configured-grids` gives its keys).
 */
export const BRAND_PICKER_GRID_NAME = "POPUP - ITEM BRANDS";
export const BRAND_PICKER_GRID_FALLBACK_ID = "91";

/** Dropdowns, by name (lib/configured-dropdowns): 35 SUPPLIERS, 42 ITEMS, 18 ITEM BRANDS. */
export const SUPPLIER_DROPDOWN_KEY = "supplier" as const;
export const ITEM_DROPDOWN_KEY = "item" as const;
export const BRAND_DROPDOWN_KEY = "itemBrand" as const;

/** The grid's name for the Enter walker's `data-quotation-grid` attribute. */
export const TEXTILE_TAG_GRID_NAME = "textileTagLines";

export const MODEL_MAX_LENGTH = 100;
export const SUPPLIER_ARTICLE_MAX_LENGTH = 60;
export const ATTR_NOTE_MAX_LENGTH = 250;

export const RESERVE_PRINT_TOOLTIP =
  "Label printing arrives with the server's step B-2 (print purpose TEXTILE_TAG_LABEL). " +
  "Reserve now; print from the Register then.";

export const PREVIEW_NOTE =
  "The printed label is the print module's TEXTILE_TAG_LABEL design. Cost code: from the " +
  "company setting once it exists; staff read it, customers can't.";

export const NO_TAX_NOTE =
  "No Tax column: the tag keeps no tax — the bill decides the slab on the value charged. Cost " +
  "here only prints the cost code; stock is valued from the lot. The item must use the Textile " +
  "tag tracking (batch only, manual issue).";

export const SPARE_ROW_PLACEHOLDER = "add a row… type to search";
