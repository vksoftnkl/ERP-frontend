/**
 * The challan's item grid — ui_table 38 "DELIVERY CHALLAN - LINES", all 101
 * columns in `ui_tbl_clm_no` order, one per Qt `SalesItemCols` entry.
 *
 * 0–91 are the sale order's vocabulary; table 38 renames some of them
 * ("Lot / Batch", "Godown", "Stock", "Qty", "Disc %", "GST %", "Amount",
 * "Cost") and those names are the tokens here. 92–100 are the challan's own:
 * the open quantity and line status (server-owned), the source trail, the lot
 * proposal and bucket, and billed / returned (server-owned fulfilment).
 *
 * What the Qt `SalesItemDelegate` lets the operator edit on this grid, and so
 * the only columns with a `write`: Barcode (while empty), Description (the
 * picker), Qty, Rate (edit-price right), Disc %. Godown, Lot / Batch and Bucket
 * are display only here (the delegate returns no editor for them).
 */
import {
  normalizeColumnToken,
  type ColumnAlign,
  type GridCellKind,
  type ItemColumnMeaning,
} from "@/features/sales/quotation/quotation.constants";

function col(
  token: string,
  kind: GridCellKind,
  align: ColumnAlign,
  extra: Omit<ItemColumnMeaning, "token" | "key" | "kind" | "align"> = {},
): ItemColumnMeaning {
  return { token, key: normalizeColumnToken(token), kind, align, ...extra };
}

export const DC_ITEM_COLUMN_MEANINGS: ItemColumnMeaning[] = [
  col("Id", "serial", "right"),
  col("Barcode", "text", "left", { write: "barcode", read: "barcode" }),
  col("Code", "text", "left", { read: "itemCode" }),
  col("Description", "itemLookup", "left", { read: "itemName" }),
  col("Size", "text", "left", { read: "itemSize" }),
  col("Hsn", "text", "left", { read: "hsnCode" }),
  col("Lot / Batch", "text", "left", { read: "batchNo", aliases: ["BatchNo"] }),
  col("ExpiryDate", "date", "center", { read: "expiryDate" }),
  col("Godown", "text", "left", { read: "godownName", aliases: ["GodownName"] }),
  col("Stock", "qty", "right", { read: "stockQty", precision: 3, aliases: ["StockQty"] }),
  col("Uom", "text", "left", { read: "unitName" }),
  col("ToBaseFactor", "qty", "right", { read: "toBaseFactor", precision: 6 }),
  // 12 — the order line's OPEN quantity: the cap SALES_DC_LINE_OVER_ORDER enforces.
  col("OrderQty", "qty", "right", { read: "orderQty", precision: 3 }),
  col("Case Qty", "qty", "right", { read: "caseQty", precision: 3 }),
  col("Qty", "qty", "right", { write: "billQty", read: "billQty", precision: 3, aliases: ["Bill Qty"] }),
  col("Length Qty", "qty", "right", { read: "lengthQty", precision: 3 }),
  col("NetQty", "qty", "right", { read: "netQty", precision: 3 }),
  col("Sch", "check", "center", { read: "schemeFlag" }),
  col("IsFree", "check", "center", { read: "isFree" }),
  col("Weight", "qty", "right", { read: "weight", precision: 3 }),
  col("PriceLevel", "label", "center", { read: "priceLevel" }),
  col("Mrp", "currency", "right", { read: "mrp" }),
  col("Rate", "currency", "right", { write: "rate", read: "rate", editableWhen: "editPrice" }),
  col("Rate.BTax", "rate", "right", { read: "rateBeforeTax", precision: 4 }),
  col("Gross", "currency", "right", { read: "grossAmt" }),
  col("Disc %", "perc", "right", { write: "discPerc", read: "discPerc", aliases: ["DiscPerc"] }),
  col("DiscPerQty", "rate", "right", { read: "discPerQty" }),
  col("DiscAmt", "currency", "right", { read: "discAmt" }),
  col("SplDiscPerc", "perc", "right", { read: "splDiscPerc" }),
  col("SplDiscPerQty", "rate", "right", { read: "splDiscPerQty" }),
  col("SplDiscAmt", "currency", "right", { read: "splDiscAmt" }),
  col("SchemeName", "text", "left", { read: "schemeName" }),
  col("SchPerc", "perc", "right", { read: "schPerc" }),
  col("SchPerQty", "rate", "right", { read: "schPerQty" }),
  col("SchAmt", "currency", "right", { read: "schAmt" }),
  col("BillSchDiscPerc", "perc", "right", { read: "billSchDiscPerc" }),
  col("BillSchDiscAmt", "currency", "right", { read: "billSchDiscAmt" }),
  col("NetGross", "currency", "right", { read: "netGross" }),
  col("ChrgBeforeTax", "currency", "right", { read: "chrgBeforeTax" }),
  col("CashDiscPerc", "perc", "right", { read: "cashDiscPerc" }),
  col("CashDiscAmt", "currency", "right", { read: "cashDiscAmt" }),
  col("Taxable", "currency", "right", { read: "taxableAmt" }),
  col("GST %", "perc", "right", { read: "gstPerc", aliases: ["Gst %"] }),
  col("GstAmt", "currency", "right", { read: "gstAmt" }),
  col("Cgst %", "perc", "right", { read: "cgstPerc" }),
  col("CgstAmt", "currency", "right", { read: "cgstAmt" }),
  col("Sgst %", "perc", "right", { read: "sgstPerc" }),
  col("SgstAmt", "currency", "right", { read: "sgstAmt" }),
  col("Igst %", "perc", "right", { read: "igstPerc" }),
  col("IgstAmt", "currency", "right", { read: "igstAmt" }),
  col("Cess %", "perc", "right", { read: "cessPerc" }),
  col("CessUom", "rate", "right", { read: "cessPerUnit" }),
  col("CessAmt", "currency", "right", { read: "cessAmt" }),
  col("HasFreight", "check", "center", { read: "hasFreight" }),
  col("FreightPerQty", "rate", "right", { read: "freightPerQty" }),
  col("FreightAmt", "currency", "right", { read: "freightAmt" }),
  col("CoolyPerQty", "rate", "right", { read: "loadingPerQty" }),
  col("CoolyAmt", "currency", "right", { read: "loadingAmt" }),
  col("ChrgAfterTax", "currency", "right", { read: "chrgAfterTax" }),
  col("Amount", "currency", "right", { read: "total", aliases: ["Total"] }),
  col("NetPrice", "currency", "right", { read: "netPrice" }),
  col("Cost", "currency", "right", { read: "costPrice", aliases: ["CostPrice"] }),
  col("SavingsPerc", "perc", "right", { read: "savingsPerc" }),
  col("Remarks", "text", "left", { read: "remarks" }),
  col("DecimalCount", "int", "center", { read: "decimalCount" }),
  col("BatchConfig", "int", "center", { read: "batchConfig" }),
  col("AllowNegative", "check", "center", { read: "allowNegative" }),
  col("Reorder", "qty", "right", { read: "reorderQty", precision: 3 }),
  col("ActualPrice", "currency", "right", { read: "actualPrice" }),
  col("MinPrice", "currency", "right", { read: "minPrice" }),
  col("CostBeforeTax", "currency", "right", { read: "costBeforeTax" }),
  col("Profit", "currency", "right", { read: "profit" }),
  col("ProfitBeforeTax", "currency", "right", { read: "profitBeforeTax" }),
  col("LoyaltyPv", "rate", "right", { read: "loyaltyPv" }),
  col("SalesmanName", "text", "left", { read: "salesmanName" }),
  col("ServiceItem", "check", "center", { read: "isService" }),
  col("SrcDocId", "label", "left", { read: "srcDocId" }),
  col("ItemId", "label", "left", { read: "itemId" }),
  col("GroupId", "label", "left", { read: "groupId" }),
  col("BrandId", "label", "left", { read: "brandId" }),
  col("SectionId", "label", "left", { read: "sectionId" }),
  col("CategoryId", "label", "left", { read: "categoryId" }),
  col("GodownId", "label", "left", { read: "godownId" }),
  col("UnitId", "label", "left", { read: "itemUnitId" }),
  col("SchemeId", "label", "left", { read: "schemeId" }),
  col("SalesmanId", "label", "left", { read: "salesmanId" }),
  col("IsInclusiveTax", "check", "center", { read: "isInclusiveTax" }),
  col("NetB.Tax", "rate", "right", { read: "netPriceBeforeTax", precision: 4 }),
  col("Diff", "currency", "right", { read: "rateDiff" }),
  col("StockId", "label", "left"),
  col("BatchDate", "date", "center", { read: "batchDate" }),
  col("SerialNo", "label", "left", { read: "serialNo" }),
  // 92–100 — the challan's own.
  col("Open", "qty", "right", { read: "openQty", precision: 3, aliases: ["PendingQty"] }),
  col("Status", "label", "center", { read: "lineStatus", aliases: ["LineStatus"] }),
  col("Src", "label", "left", { read: "srcDocRefno" }),
  col("Src Line", "label", "left", { read: "srcLineId" }),
  col("Src Year", "label", "left", { read: "srcDocYear" }),
  col("Lot Id", "label", "left", { read: "lotId" }),
  col("Bucket", "label", "center", { read: "bucket" }),
  col("Billed", "qty", "right", { read: "billedQty", precision: 3 }),
  col("Returned", "qty", "right", { read: "returnedQty", precision: 3 }),
];

/** Qt `SalesItemCols::ColumnCount`. */
export const DC_ITEM_COLUMN_COUNT = 101;
