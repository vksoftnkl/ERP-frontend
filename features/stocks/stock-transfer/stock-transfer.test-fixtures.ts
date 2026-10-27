import { applyHolding, createDraft } from "./stock-transfer.state";
import type { DraftScope, TransferDraft, TransferPickRow } from "./stock-transfer.types";
import type { TransferMode } from "./stock-transfer.constants";

export const SCOPE: DraftScope = {
  companyId: "company-1",
  branchId: "branch-1",
  accYear: "2026-2027",
  deviceId: "device-1",
};

export function holding(over: Partial<TransferPickRow> = {}): TransferPickRow {
  return {
    sblId: "sbl-1",
    itemId: "item-1",
    itemCode: "I1",
    itemName: "Shirt",
    godownId: "gd-from",
    lotId: "lot-1",
    bucket: "SALEABLE",
    batchNo: "B-2604",
    mfgDate: null,
    expiryDate: "2026-06-30",
    mrp: 550,
    salePrice: null,
    serialNo: null,
    supplierId: null,
    supplierName: null,
    baseUomId: "uom-1",
    unitName: "PCS",
    onHandQty: 20,
    reservedQty: 0,
    availableQty: 20,
    avgCostRate: 473.5,
    stockValue: 9470,
    firstInDate: null,
    freeAvailableQty: 0,
    loadRate: 3.5,
    unloadRate: 1.25,
    ...over,
  } as TransferPickRow;
}

/** A draft with both godowns chosen (and a branch for Branch Outward). */
export function keyed(mode: TransferMode = "godown"): TransferDraft {
  const base = createDraft(SCOPE, mode, "2026-10-27");
  return {
    ...base,
    fromGodownId: "gd-from",
    fromGodownName: "Main Warehouse",
    toGodownId: "gd-to",
    toGodownName: "Cold Room",
    ...(mode === "branch" ? { toBranchId: "branch-2", toBranchName: "Counter2" } : {}),
  };
}

/** `keyed()` with one holding picked onto the first line, quantity keyed. */
export function withLine(mode: TransferMode = "godown", qty = "5", row: TransferPickRow = holding()): TransferDraft {
  const draft = keyed(mode);
  const picked = applyHolding(draft, draft.lines[0].key, row).draft;
  return { ...picked, lines: picked.lines.map((line, index) => (index === 0 ? { ...line, qty } : line)) };
}
