/**
 * Reorder → PO — the wire shapes of `/purchase/reorder/*` (server
 * src/modules/purchase/reorder/purchase-reorder.ts) and the screen's rows.
 *
 * Decimals arrive as STRINGS (`jsonSafe` of Prisma Decimals); read them with `num()`.
 */
export type WireDecimal = string | number | null | undefined;

/** GET /purchase/reorder/suggestions — one reorder row of the branch (item × unit × godown). */
export type ReorderSuggestion = {
  reorderId: string;
  itemId: string;
  itemName: string | null;
  itemCode: string | null;
  /** An iuc_id (item_unit_conversion) — the reorder row's unit. */
  uomId: string;
  unitName: string | null;
  godownId: string | null;
  godownName: string | null;
  reorderType: string | null;
  onHand: WireDecimal;
  onOrder: WireDecimal;
  cover: WireDecimal;
  reorderLevel: WireDecimal;
  minLevel: WireDecimal;
  maxLevel: WireDecimal;
  reorderQty: WireDecimal;
  leadDays: number | null;
  /** cover (on hand + pending on confirmed POs) ≤ the reorder level (or min). */
  below: boolean;
  suggestedQty: WireDecimal;
  supplierId: string | null;
  supplierName: string | null;
  /** PREFERRED (supplier–item map) / LAST_BILL / null. */
  supplierSource: string | null;
  supplierCode: string | null;
  rate: WireDecimal;
  lastPurchaseDate: string | null;
};

export type ReorderSuggestionsQuery = {
  companyId: string;
  branchId: string;
  /** Only the items this supplier is the suggested one for. */
  supplierId?: string;
  /** true (the server's default): only rows at / below their level. */
  belowOnly: boolean;
};

/** POST /purchase/reorder/create-pos — rows of one supplier become one DRAFT PO. */
export type CreateReorderPosDto = {
  companyId: string;
  branchId: string;
  accYear: string;
  deviceId: string;
  rows: { itemId: string; uomId: string; qty: number; supplierId: string; rate?: number }[];
};

/** One PO the create made. */
export type ReorderMadePo = {
  poId: string;
  accYear: string;
  refno: string;
  supplierId: string;
  supplierName: string | null;
  lines: number;
  value: WireDecimal;
};

/** One row on screen. Order qty / Rate are kept as typed. */
export type ReorderRow = {
  /** Stable client key (the reorder row's id). */
  key: string;
  ticked: boolean;
  itemId: string;
  itemName: string;
  uomId: string;
  unitName: string;
  godownName: string;
  onHand: number;
  onOrder: number;
  /** The reorder level, else the min level. */
  level: number;
  max: number;
  orderQty: string;
  rate: string;
  supplierId: string;
  supplierName: string;
  /** "preferred" / "last bill" / "set" (picked here) / "". */
  source: string;
  /** ISO date of the last posted bill of the item, "" when never bought. */
  lastBought: string;
  below: boolean;
};

export type ReorderSummary = {
  ticked: number;
  /** One PO per distinct supplier among the ticked rows that have one. */
  pos: number;
  /** Σ order qty × rate over the ticked rows (before tax). */
  value: number;
  /** Ticked rows with no supplier yet. */
  withoutSupplier: number;
};
