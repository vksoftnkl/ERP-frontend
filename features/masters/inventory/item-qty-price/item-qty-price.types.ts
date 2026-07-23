import type { ItemQtyPriceMode } from "@/store/api/itemQtyPriceApi";

export type ItemQtyPriceRow = {
  localId: string;
  iqpId: string | null;
  itemId: string;
  itemLabel: string;
  itemUnitId: string;
  unitLabel: string;
  companyId: string;
  branchId: string;
  partyId: string;
  priceLevel: string;
  fromQty: string;
  toQty: string;
  priceMode: ItemQtyPriceMode;
  discPct: string;
  flatOff: string;
  price: string;
  isTaxIncl: boolean;
  effectiveFrom: string;
  effectiveTo: string;
  isActive: boolean;
  isDirty: boolean;
  isNew: boolean;
};

// Mode letters are the server's (`iqp_price_mode` accepts P | R | F only).
// The desktop-port spec calls the flat-rupees-off mode "Q"; the API has never
// accepted that letter, so R stays and only the label follows the spec.
export const PRICE_MODE_OPTIONS: ReadonlyArray<{ value: ItemQtyPriceMode; label: string }> = [
  { value: "P", label: "% Off" },
  { value: "R", label: "Flat Rs Off" },
  { value: "F", label: "Fixed Price" },
];
