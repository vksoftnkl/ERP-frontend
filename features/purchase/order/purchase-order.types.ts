/**
 * Purchase Order — the wire shapes of `/purchase/orders/*` (server
 * src/modules/purchase/order/purchase-order.ts) and the screen's draft.
 *
 * Every money / qty field of a stored PO is a Prisma Decimal, which arrives as
 * a STRING ("1234.50"); read them through `num()`.
 */

/** A wire decimal: pg NUMERIC as a string, or a plain number. */
export type WireDecimal = string | number | null | undefined;

// ---------------------------------------------------------------------------
// Save / validate — POST body (SavePurchaseOrderDto)
// ---------------------------------------------------------------------------

export type PurchaseOrderHeaderDto = {
  poId?: string;
  companyId: string;
  branchId: string;
  accYear: string;
  deviceId: string;
  supplierId: string;
  docDate: string;
  expectedDate?: string;
  godownId?: string;
  contact?: string;
  remarks?: string;
  /** Confirm: the PO is open for GRNs and bills. */
  post: boolean;
};

export type PurchaseOrderLineDto = {
  lineNo: number;
  itemId: string;
  /** An iuc_id (item_unit_conversion), never a unit_id. */
  uomId: string;
  qty: number;
  freeQty?: number;
  rate: number;
  discPct?: number;
  mrp?: number;
};

export type SavePurchaseOrderDto = {
  header: PurchaseOrderHeaderDto;
  lines: PurchaseOrderLineDto[];
};

/** POST /purchase/orders/validate — `key` is the line's `lineNo` as a string. */
export type PurchaseOrderCalc = {
  lines: {
    key: string;
    gross?: WireDecimal;
    discAmt?: WireDecimal;
    taxable: WireDecimal;
    gstPct: WireDecimal;
    tax: WireDecimal;
    total: WireDecimal;
  }[];
  totals: { gross?: WireDecimal; taxable: WireDecimal; tax: WireDecimal; net: WireDecimal };
};

// ---------------------------------------------------------------------------
// GET /purchase/orders/get — also the answer of save, cancel and short-close
// ---------------------------------------------------------------------------

export type PurchaseOrderHeaderRow = {
  poId: string;
  poCompanyId: string;
  poBranchId: string;
  poAccYear: string;
  poRefno: string;
  poDocDate: string | null;
  poSupplierId: string;
  supplierName: string | null;
  poExpectedDate: string | null;
  poDeliverGodownId: string | null;
  poContact: string | null;
  poRemarks: string | null;
  poTaxableAmt: WireDecimal;
  poTaxAmt: WireDecimal;
  poNetAmt: WireDecimal;
  poStatus: string;
  poIsShortClosed: boolean;
  poShortCloseReason: string | null;
  /** NOT_REQUIRED / AWAITING / APPROVED / REJECTED (purchase.po_approval_above). */
  poApprovalStatus?: string | null;
};

export type PurchaseOrderLineRow = {
  poiId: string;
  poiLineNo: number;
  poiItemId: string;
  poiUomId: string;
  poiQty: WireDecimal;
  poiFreeQty: WireDecimal;
  poiRate: WireDecimal;
  poiDiscPct: WireDecimal;
  poiTaxableAmt: WireDecimal;
  poiGstPct: WireDecimal;
  poiCgstAmt: WireDecimal;
  poiSgstAmt: WireDecimal;
  poiIgstAmt: WireDecimal;
  poiCessAmt: WireDecimal;
  poiTotalAmt: WireDecimal;
  poiMrp: WireDecimal;
  itemName?: string | null;
  unitName?: string | null;
  receivedQty: WireDecimal;
  pendingQty: WireDecimal;
};

export type PurchaseOrderPayload = {
  header: PurchaseOrderHeaderRow;
  lines: PurchaseOrderLineRow[];
};

export type PurchaseOrderRefArgs = { poId: string; accYear: string };
export type PurchaseOrderReasonArgs = PurchaseOrderRefArgs & { reason: string };

/** GET /stock/opening/item-lookup — the fields this screen reads. */
export type PurchaseOrderItemLookup = {
  itemId: string;
  itemName: string;
  uomId: string;
  unitName: string;
  taxPerc: WireDecimal;
  mrp: WireDecimal;
};

export type PurchaseOrderItemLookupArgs = {
  companyId: string;
  branchId: string;
  itemId: string;
  uomId?: string;
  onDate: string;
  godownId?: string;
};

/** GET /master-lookups/item-by-barcode — `unitId` is an iuc_id. */
export type PurchaseOrderBarcodeItem = { itemId: string; unitId: string; itemName: string };

// ---------------------------------------------------------------------------
// The screen's draft
// ---------------------------------------------------------------------------

export type PoStatus = "DRAFT" | "POSTED" | "CANCELLED";

export type PoLine = {
  /** Client key — stable across edits, never sent. */
  key: string;
  /** poi_id of a stored line ("" on a new one). */
  lineId: string;
  itemId: string;
  itemName: string;
  /** An iuc_id. */
  uomId: string;
  unitName: string;
  /** What was typed — kept as text so "12." survives a keystroke. */
  qty: string;
  free: string;
  rate: string;
  discPct: string;
  mrp: string;
  /** The SERVER's figures (validate / get); null = not figured yet. */
  taxable: number | null;
  gstPct: number | null;
  tax: number | null;
  total: number | null;
  /** A loaded PO's progress (derived by the server from GRN / bill lines). */
  received: number | null;
  pending: number | null;
};

export type PoTotals = { taxable: number; tax: number; net: number };

export type PoDraft = {
  poId: string;
  refno: string;
  status: PoStatus;
  companyId: string;
  branchId: string;
  accYear: string;
  deviceId: string;
  supplierId: string;
  supplierName: string;
  docDate: string;
  expectedDate: string;
  godownId: string;
  godownName: string;
  contact: string;
  remarks: string;
  shortClosed: boolean;
  shortCloseReason: string;
  approvalStatus: string;
  lines: PoLine[];
  totals: PoTotals | null;
  /** The line under the grid: a refusal, "Barcode … not found." */
  hint: string;
  /** Unsaved keying on screen. */
  dirty: boolean;
  /** "browse" = opened read-only (F2 edits a draft). */
  viewMode: "browse" | "entry";
  /** Bumped on every change that the server's figures depend on. */
  calcVersion: number;
};

export type PoScope = { companyId: string; branchId: string; accYear: string; deviceId: string };
