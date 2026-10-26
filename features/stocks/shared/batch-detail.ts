/**
 * Textile batch detail — what a batch IS (size, colour, model), shared by the
 * three stock screens (Qt 74b755c, plan-textile-auto-batch-2).
 *
 * When the company numbers its own batches (`stock.auto_batch_no`), an inward
 * line on a batch-tracked item may leave Batch No blank: the server gives it
 * the next number on save (CBE26-00001) and keeps the line's size, colour and
 * model against that number in `stock.stock_batch_detail`. A batch number typed
 * by hand carries none of them. The printed label is that batch number, so a
 * count or an adjustment can scan it back.
 *
 * Pure: no React, no fetching.
 */

/** The company setting; AppSession `autoBatchNo()`. Off by default. */
export const AUTO_BATCH_NO_SETTING_KEY = "stock.auto_batch_no";

/** The fields a line, a holding or a lot carries for its batch detail. */
export type BatchDetailText = {
  itemName?: string | null;
  sizeName?: string | null;
  colourName?: string | null;
  model?: string | null;
};

/**
 * The Item cell's text: the size, colour and model ride after the item name
 * rather than in columns of their own (user, 2026-10-24) — the counter reads
 * "Shirt · XL · Maroon · Slim fit" off the label and the line alike. Qt
 * `PhysicalStockCols::itemText` / `StockAdjustmentCols::itemText`.
 */
export function batchDetailItemText(line: BatchDetailText): string {
  const parts = [line.itemName ?? ""];
  for (const value of [line.sizeName, line.colourName, line.model]) {
    const text = (value ?? "").trim();
    if (text) {
      parts.push(text);
    }
  }
  return parts.join(" · ");
}

/** `GET /stock/lots/by-batch` — `bucket`: SALEABLE (the default), one other, or ALL. */
export const LOTS_BY_BATCH_ENDPOINT = "/stock/lots/by-batch";

export type LotsByBatchQuery = {
  companyId: string;
  branchId: string;
  /** What the scanner read; the server trims and upper-cases it. */
  batchNo: string;
  /** Lots with no saleable stock at the branch too — a count must reach those. */
  includeEmpty?: boolean;
  /** SALEABLE when left out; ALL = every bucket, each godown row naming its own. */
  bucket?: string;
  /** Only this godown's holdings (the lot list is unchanged). */
  godownId?: string;
};

/** The query string, as Qt `StockLots::byBatch()` builds it: optional keys left out. */
export function lotsByBatchParams(query: LotsByBatchQuery): Record<string, string> {
  const params: Record<string, string> = {
    companyId: query.companyId,
    branchId: query.branchId,
    batchNo: query.batchNo.trim(),
  };
  if (query.includeEmpty) {
    params.includeEmpty = "true";
  }
  if (query.bucket) {
    params.bucket = query.bucket;
  }
  if (query.godownId) {
    params.godownId = query.godownId;
  }
  return params;
}

/** One godown holding of a lot (server `LotByBatchGodown`). */
export type LotByBatchGodown = {
  godownId: string;
  godownName: string | null;
  bucket: string;
  onHandQty: number;
  availableQty: number;
  avgCostRate: number;
};

/** One lot the scanned label names (server `LotByBatchRow`); 404 STOCK_BATCH_NOT_FOUND when none. */
export type LotByBatchRow = {
  lotId: string;
  itemId: string;
  itemCode: string | null;
  itemName: string | null;
  baseUomId: string;
  baseUnitName: string | null;
  batchNo: string;
  mrp: number | null;
  salePrice: number | null;
  status: string;
  sizeId: string | null;
  sizeName: string | null;
  colourId: string | null;
  colourName: string | null;
  model: string | null;
  onHandQty: number;
  avgCostRate: number;
  godowns: LotByBatchGodown[];
};

/** `GET /stock/batch-detail/models` — an item's earlier models, newest first, at most 20. */
export const BATCH_MODELS_ENDPOINT = "/stock/batch-detail/models";
