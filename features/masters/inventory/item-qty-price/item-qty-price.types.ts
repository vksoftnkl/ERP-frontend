import type { ItemQtyPriceMode } from "@/store/api/itemQtyPriceApi";

// One slab of the item the screen is scoped to. The grid shows Uom · From ·
// To · Mode · Value; the scope (company … price level) and the dates are the
// panel under it (Qt 4ae6575, "the promotion page's layout"). The names ride
// beside their ids so the panel's dropdowns show a saved slab's scope without
// a lookup.
export type ItemQtyPriceRow = {
  localId: string;
  iqpId: string | null;
  itemId: string;
  itemLabel: string;
  /** An `item_unit_conversion.iuc_id`, not a unit id. */
  itemUnitId: string;
  unitLabel: string;
  companyId: string;
  companyName: string;
  branchId: string;
  branchName: string;
  partyId: string;
  partyName: string;
  /** `item_price_levels.ipl_id` as text; "" = every level. */
  priceLevel: string;
  priceLevelName: string;
  fromQty: string;
  /** "" = "& above". */
  toQty: string;
  priceMode: ItemQtyPriceMode;
  /** The mode's own figure — saved into iqp_disc_pct, iqp_flat_off or iqp_price. */
  value: string;
  isTaxIncl: boolean;
  effectiveFrom: string;
  effectiveTo: string;
  isActive: boolean;
  isDirty: boolean;
};

// The three modes as the operator reads them (Qt IqpCols::modeChoices). The
// letters are the server's: `iqp_price_mode` accepts P | R | F only — the old
// desktop spec's "Q" for the flat-rupees mode was never accepted, so R stays.
export const PRICE_MODE_OPTIONS: ReadonlyArray<{ value: ItemQtyPriceMode; label: string }> = [
  { value: "P", label: "% off" },
  { value: "R", label: "₹ off" },
  { value: "F", label: "Fixed price" },
];

/** A cell of the slab grid, in the order Enter walks them. */
export type SlabGridCell = "unit" | "fromQty" | "toQty" | "mode" | "value";

/** A field of the panel under the grid. */
export type SlabPanelField =
  | "company"
  | "branch"
  | "party"
  | "priceLevel"
  | "effectiveFrom"
  | "effectiveTo";

/** Where a problem with a slab is shown: a grid cell or a panel field. */
export type SlabCell = SlabGridCell | SlabPanelField;
