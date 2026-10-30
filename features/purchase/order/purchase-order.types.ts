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
  /** Confirm: the PO is open for GRNs and bills. An amendment sends true. */
  post: boolean;
  /** Why a confirmed PO is amended (kept on the trail with the old version). */
  amendReason?: string;
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
  /** pur_order_item.poi_id of a stored line — an amendment keeps it; absent = a new line. */
  lineId?: string;
  schPct?: number;
};

/** CHG-07 — an estimated charge: the rate, or a typed amount. */
export type PurchaseOrderChargeDto = { chgId: string; rate?: number; amount?: number };

export type SavePurchaseOrderDto = {
  header: PurchaseOrderHeaderDto;
  lines: PurchaseOrderLineDto[];
  /** A save replaces the set (sent when any, or on a stored PO). */
  charges?: PurchaseOrderChargeDto[];
};

/** A charge row of validate / get (`charges[]`). */
export type PurchaseOrderChargeRow = {
  chgId?: string;
  chgName?: string | null;
  type?: string | null;
  method?: string | null;
  rate?: WireDecimal;
  amount?: WireDecimal;
  signedAmount?: WireDecimal;
  onBill?: boolean | null;
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
  totals: {
    gross?: WireDecimal;
    taxable: WireDecimal;
    tax: WireDecimal;
    net: WireDecimal;
    lines?: number;
    orderedValue?: WireDecimal;
    chargesEstimate?: WireDecimal;
    poTotal?: WireDecimal;
  };
  header?: { agentId?: string | null; agentName?: string | null };
  charges?: PurchaseOrderChargeRow[];
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
  /** 1 on the first save; + 1 per amendment (DOC-01). */
  poRevisionNo?: WireDecimal;
  /** Who approved / refused it, from the status trail (APPROVED / REJECTED only). */
  approvedBy?: string | null;
  approvedOn?: string | null;
  approvalRemarks?: string | null;
  // ── rebuild ──
  poAgentId?: string | null;
  agentName?: string | null;
  poCreditDays?: number | null;
  poTermsId?: string | null;
  poTermsText?: string | null;
  termsName?: string | null;
  deliverGodownName?: string | null;
  revisionNo?: number | null;
  lastAmendReason?: string | null;
  /** CONFIRMED / PART_RECEIVED / RECEIVED / CLOSED / AWAITING_APPROVAL / NOT_APPROVED / DRAFT / CANCELLED. */
  docStatus?: string | null;
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
  // ── rebuild ──
  poiSchPct?: WireDecimal;
  poiShortClosedQty?: WireDecimal;
  /** OPEN / PART / DONE / SHORT_CLOSED. */
  lineStatus?: string | null;
  lastRate?: WireDecimal;
  lastRateRefno?: string | null;
  lastRateDate?: string | null;
  stockQty?: WireDecimal;
  reorderLevel?: WireDecimal;
  reorderQty?: WireDecimal;
};

export type PurchaseOrderPayload = {
  header: PurchaseOrderHeaderRow;
  lines: PurchaseOrderLineRow[];
  charges?: PurchaseOrderChargeRow[];
  totals?: Record<string, unknown> | null;
};

export type PurchaseOrderRefArgs = { poId: string; accYear: string };
export type PurchaseOrderReasonArgs = PurchaseOrderRefArgs & { reason: string };

// ---------------------------------------------------------------------------
// DOC-01 — clone / merge / approve / revisions / pending lines
// ---------------------------------------------------------------------------

/** POST /purchase/orders/approve — `approve: false` refuses it (reason required). */
export type PurchaseOrderApproveArgs = PurchaseOrderRefArgs & { approve: boolean; reason?: string };

/** POST /purchase/orders/clone — a new DRAFT with this PO's lines. */
export type PurchaseOrderCloneArgs = PurchaseOrderRefArgs & { deviceId: string };

/** POST /purchase/orders/merge — the pending of two or more confirmed POs of one supplier → one draft. */
export type PurchaseOrderMergeArgs = {
  sources: PurchaseOrderRefArgs[];
  accYear: string;
  deviceId: string;
};

/** GET /purchase/orders/pending-lines — one confirmed PO line with qty still pending (oldest PO first). */
export type PurchaseOrderPendingLine = {
  poId: string;
  accYear: string;
  refno: string;
  docDate: string | null;
  poiId: string;
  lineNo: number;
  itemId: string;
  itemName: string | null;
  uomId: string;
  unitName: string | null;
  rate: WireDecimal;
  pendingQty: WireDecimal;
  orderedQty: WireDecimal;
};

/** GET /purchase/orders/revisions — one save of the PO (audit.audit_log), newest first. */
export type PurchaseOrderRevision = {
  revNo: number | string | null;
  savedOn: string | null;
  action: string | null;
  notes: string | null;
  savedBy: string | null;
  /** The PO in the /get shape, before and after that save. */
  before: Partial<PurchaseOrderPayload> | null;
  after: Partial<PurchaseOrderPayload> | null;
};

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
  // ── rebuild 2026-10-29 ──
  schPct?: string;
  shortClosedQty?: number | null;
  lastRate?: string;
  lastRateTip?: string;
  stock?: string;
  reorder?: string;
  reorderTip?: string;
  /** OPEN / PART / DONE / SHORT_CLOSED (a confirmed PO's line). */
  lineStatus?: string;
};

export type PoTotals = { taxable: number; tax: number; net: number };

/** CHG-07 — one estimated charge on the PO. */
export type PoChargeLine = {
  key: string;
  chgId: string;
  name: string;
  onBill: boolean;
  method: string;
  type: string;
  rate: string;
  /** Signed (a deduction is minus); "" until figured. */
  amount: string;
  /** The amount was typed: sent as the amount (the rate is the server's). */
  typed: boolean;
};

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
  /** NOT_REQUIRED / AWAITING / APPROVED / REJECTED ("" on a new PO). */
  approvalStatus: string;
  /** Who approved / refused it (from the trail). */
  approvedBy: string;
  /** 1 on the first save, + 1 per amendment; 0 on a new PO. */
  revisionNo: number;
  /** A confirmed PO opened for change (DOC-01): Save amendment = revision + 1. */
  amending: boolean;
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
  // ── 2026-10-29 rebuild (po-fidelity.ts) ──
  agentId?: string;
  agentName?: string;
  creditDays?: string;
  /** Typed (or the PO's own): the supplier's default no longer fills it. */
  creditTyped?: boolean;
  /** "(supplier default)" after the context filled it. */
  creditNote?: string;
  termsId?: string;
  /** The master row's name (dropdown label) or the PO's typed copy. */
  termsLabel?: string;
  /** The PO's own copy of the terms (poTermsText) — sent when no master row is picked. */
  termsText?: string;
  lastAmendReason?: string;
  docStatus?: string;
  charges?: PoChargeLine[];
  /** The server's totals object (validate / get): the strip's cells. */
  serverTotals?: Record<string, unknown> | null;
};

export type PoScope = { companyId: string; branchId: string; accYear: string; deviceId: string };
