/**
 * Shared builders for the Stock Adjustment tests — a draft with a godown and a
 * kind's reasons loaded, lines with an item, a pick-stock holding.
 */
import type { Kind } from "./stock-adjustment.constants";
import { applyKind, applyReasons, blankLine, createDraft } from "./stock-adjustment.state";
import type {
  AdjustmentDraft,
  AdjustmentLine,
  DraftScope,
  PickStockRow,
  StockReasonRow,
} from "./stock-adjustment.types";

export const SCOPE: DraftScope = {
  companyId: "c-1",
  branchId: "b-1",
  accYear: "2026-2027",
  deviceId: "dev-1",
};

export function reasonRow(
  srmId: string,
  code: string,
  direction: string,
  extra: Partial<StockReasonRow> = {},
): StockReasonRow {
  return {
    srmId,
    companyId: null,
    isShared: true,
    code,
    name: extra.name ?? code.replace(/_/g, " ").toLowerCase(),
    direction,
    allowedTxnTypes: [],
    requireRemarks: false,
    glLedgerId: null,
    glLedgerName: null,
    sortOrder: 0,
    remarks: null,
    isActive: true,
    ...extra,
  };
}

/** What GET /stock/reasons might answer for an ADJUSTMENT. */
export const ADJUSTMENT_REASONS: StockReasonRow[] = [
  reasonRow("r-short", "SHORTAGE", "OUT", { name: "Shortage" }),
  reasonRow("r-found", "FOUND", "IN", { name: "Found on shelf" }),
  reasonRow("r-count", "COUNT_FIX", "BOTH", { name: "Count correction" }),
  reasonRow("r-theft", "PILFERAGE", "OUT", { name: "Pilferage", requireRemarks: true, glLedgerName: "Theft Loss" }),
  reasonRow("r-rout", "RELOT_OUT", "OUT", { name: "Re-lot out" }),
  reasonRow("r-rin", "RELOT_IN", "IN", { name: "Re-lot in" }),
];

export const MOVE_REASONS: StockReasonRow[] = [
  reasonRow("r-md", "MOVE_DAMAGED", "BOTH", { name: "Damaged — hold for return" }),
  reasonRow("r-ms", "MOVE_SALEABLE", "BOTH", { name: "Back to saleable" }),
];

export function draftOf(kind: Kind, rows: StockReasonRow[] = kind === "Move" ? MOVE_REASONS : ADJUSTMENT_REASONS): AdjustmentDraft {
  const base = createDraft(SCOPE, "2026-10-02", kind);
  return applyReasons({ ...applyKind(base, kind), godownId: "g-1", godownName: "Main" }, rows);
}

export function itemLine(extra: Partial<AdjustmentLine> = {}): AdjustmentLine {
  return {
    ...blankLine(),
    itemId: "item-1",
    itemCode: "IT1",
    itemName: "Rice 1kg",
    uomId: "iuc-1",
    uomName: "PCS",
    baseUomId: "iuc-1",
    toBaseFactor: 1,
    bucket: "SALEABLE",
    trackSignature: "N",
    ...extra,
  };
}

export function withLines(draft: AdjustmentDraft, lines: AdjustmentLine[]): AdjustmentDraft {
  return { ...draft, lines: [...lines, blankLine()] };
}

export function holding(extra: Partial<PickStockRow> = {}): PickStockRow {
  return {
    sblId: "sbl-1",
    itemId: "item-1",
    itemCode: "IT1",
    itemName: "Rice 1kg",
    godownId: "g-1",
    lotId: "lot-1",
    bucket: "SALEABLE",
    batchNo: "B-0917",
    mfgDate: "2026-01-01",
    expiryDate: "2026-09-30",
    mrp: 60,
    salePrice: null,
    serialNo: null,
    supplierId: "sup-1",
    supplierName: "Acme Foods",
    baseUomId: "iuc-1",
    unitName: "PCS",
    onHandQty: 42,
    reservedQty: 0,
    availableQty: 42,
    avgCostRate: 40.5,
    stockValue: 1701,
    firstInDate: "2026-04-10",
    ...extra,
  };
}
