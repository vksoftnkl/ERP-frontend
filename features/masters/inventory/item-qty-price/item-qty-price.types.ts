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

export const PRICE_MODE_OPTIONS: ReadonlyArray<{ value: ItemQtyPriceMode; label: string }> = [
  { value: "P", label: "% Discount" },
  { value: "R", label: "Flat Off (Qty)" },
  { value: "F", label: "Fixed Price" },
];
