/**
 * Purchase Entry (menu 24) — the wire shapes (server
 * `src/modules/purchase/invoice/dto/save-purchase-invoice.dto.ts` and the
 * service's answers) and the screen's own draft.
 *
 * Every pg NUMERIC arrives as a STRING (jsonSafe / `decimals()`): read them
 * with `num()`, never with bare arithmetic.
 */
import type { PurchaseIssue } from "../shared/purchase-parts";
import type {
  InvoiceHeaderExt,
  InvoiceHeaderFacts,
  InvoiceIssues,
  InvoiceLineCheck,
  InvoiceServerTotals,
} from "./invoice-fidelity";
import type { PurchaseAllocEntry } from "../shared/purchase-dialogs.types";
import type { InvoiceChargeRow, PurchaseChargeCalc, PurchaseChargeDto, PurchaseChargeStored } from "./invoice-header.types";

// ---------------------------------------------------------------------------
// Save / validate payload (SavePurchaseInvoiceDto)
// ---------------------------------------------------------------------------

export type PurchaseAllocDto = {
  godownId?: string;
  bucket?: "SALEABLE" | "DAMAGED";
  batchNo?: string;
  mfgDate?: string;
  expiryDate?: string;
  mrp?: number;
  salePrice?: number;
  serialNo?: string;
  warrantyTo?: string;
  sizeId?: string;
  colourId?: string;
  model?: string;
  qty: number;
  freeQty?: number;
};

export type PurchaseInvoiceLineDto = {
  lineNo: number;
  itemId: string;
  /** item_unit_conversion.iuc_id */
  uomId: string;
  billedQty: number;
  /** Defaults to billed − damaged; sent only when typed (Qt). */
  receivedQty?: number;
  damagedQty?: number;
  freeQty?: number;
  rate: number;
  discPct?: number;
  mrp?: number;
  allocs?: PurchaseAllocDto[];
  // ── Qt 0fbe19c..e0c56ef line fields (PI-LINES) ─────────────────────────
  /** R4: the GRN line billed, whole — qty, unit and lots are the GRN's. */
  grnItemId?: string;
  grnItemAccYear?: string;
  /** DOC-04: the PO line received with the bill. */
  poItemId?: string;
  poItemAccYear?: string;
  /** DOC-08: the sister company's sale line this purchase line pulls. */
  sisterSaleItemId?: string;
  sisterSaleItemAccYear?: string;
  /** ENT-04: cost per billed unit incl. tax, as typed — the server back-solves the rate. */
  costIncl?: number;
  /** ENT-06. */
  schPct?: number;
  extraDiscAmt?: number;
  /** purchase.allow_price_update + UPDATE_PRICES: written on Post. */
  sellA?: number;
  sellB?: number;
  sellC?: number;
  sellD?: number;
  /** ENT-18: with no sellA, the server prices Sell A from it. */
  markupAPct?: number;
};

export type PurchaseInvoiceHeaderDto = {
  piId?: string;
  companyId: string;
  branchId: string;
  accYear: string;
  deviceId: string;
  supplierId: string;
  supplierInvNo: string;
  supplierInvDate: string;
  docDate: string;
  godownId: string;
  invoiceAmountPrinted: number;
  remarks?: string;
  // ── Qt 9028830 header (PI-HEADER) ──
  /** The supplier's TCS, when charged. */
  tcsAmount?: number;
  ewbNo?: string;
  ewbDate?: string;
  post: boolean;
  // ── rebuild 2026-10-29 (verified on :3011) ──
  goodsReceivedOn?: string;
  mode?: string;
  creditDays?: number;
  irn?: string;
  ackNo?: string;
  agentId?: string | null;
  billFromGstin?: string | null;
  /** Omit = keep the saved band; null = remove it. */
  transport?: Record<string, unknown> | null;
  overrideWarnings?: boolean;
  overrideReason?: string;
};

export type SavePurchaseInvoiceDto = {
  header: PurchaseInvoiceHeaderDto;
  lines: PurchaseInvoiceLineDto[];
  /** Qt 88cd3f2: charge-master rows, priced by the server (PI-HEADER). */
  charges: PurchaseChargeDto[];
};

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

type Wire = string | number | null | undefined;

/** One stock-side row as stored (pur_item_alloc). */
export type PurchaseAllocRow = {
  piaId?: string;
  piaGodownId?: string | null;
  piaBucket?: string | null;
  piaBatchNo?: string | null;
  piaMfgDate?: string | null;
  piaExpiryDate?: string | null;
  piaMrp?: Wire;
  piaSalePrice?: Wire;
  piaSerialNo?: string | null;
  piaWarrantyTo?: string | null;
  piaSizeId?: string | null;
  piaColourId?: string | null;
  piaModel?: string | null;
  piaQty?: Wire;
  piaFreeQty?: Wire;
};

export type PurchaseInvoiceLineRow = {
  piiId: string;
  piiLineNo?: Wire;
  piiItemId: string;
  piiUomId: string;
  piiBilledQty?: Wire;
  piiReceivedQty?: Wire;
  piiDamagedQty?: Wire;
  piiShortQty?: Wire;
  piiFreeQty?: Wire;
  piiRate?: Wire;
  piiDiscPct?: Wire;
  piiTaxableAmt?: Wire;
  piiGstPct?: Wire;
  piiCgstAmt?: Wire;
  piiSgstAmt?: Wire;
  piiIgstAmt?: Wire;
  piiCessAmt?: Wire;
  piiTotalAmt?: Wire;
  piiLandedCostWot?: Wire;
  piiMrp?: Wire;
  allocs?: PurchaseAllocRow[];
  // ── Qt 0fbe19c..e0c56ef (PI-LINES) ──────────────────────────────────────
  /** "GRN" / "PURCHASE_ORDER" / "SALE_BILL" (sister company) — or none. */
  piiSrcDocType?: string | null;
  piiSrcItemId?: string | null;
  piiSrcDocYear?: string | null;
  piiSrcDocRefno?: string | null;
  piiSchPct?: Wire;
  piiExtraDiscAmt?: Wire;
  piiMarkupAPct?: Wire;
  piiItcClass?: string | null;
  piiItcEligibleAmt?: Wire;
  piiItcPendingAmt?: Wire;
  piiItcIneligibleAmt?: Wire;
  piiSellA?: Wire;
  piiSellB?: Wire;
  piiSellC?: Wire;
  piiSellD?: Wire;
  /** R18: billed beyond what the GRN kept (sent back on a GRN return). */
  piiRejectedAtGrnQty?: Wire;
  /** D16: KEPT_NEWER = a newer price change won; the bill kept its price as history. */
  piiPriceUpdateResult?: string | null;
  check?: InvoiceLineCheck | null;
};

export type PurchaseInvoiceHeaderRow = {
  piId: string;
  piCompanyId: string;
  piBranchId: string;
  piAccYear: string;
  piDeviceId?: string | null;
  piRefno: string;
  piStatus: string;
  piDocDate?: string | null;
  piSupplierId: string;
  supplierName?: string | null;
  piSupplierInvNo?: string | null;
  piSupplierInvDate?: string | null;
  piGodownId: string;
  godownName?: string | null;
  piInvoiceAmountPrinted?: Wire;
  piRemarks?: string | null;
  piTaxableAmt?: Wire;
  piCgstAmt?: Wire;
  piSgstAmt?: Wire;
  piIgstAmt?: Wire;
  piCessAmt?: Wire;
  piRoundOff?: Wire;
  piNetPayable?: Wire;
  piShortValue?: Wire;
  piItcPendingAmt?: Wire;
  /** "GRN" when the bill bills GRN lines (the post message says so). */
  piSourceKind?: string | null;
  // ── Qt 9028830 / 348957f / 88cd3f2 header (PI-HEADER) ──
  piTcsAmt?: Wire;
  piEwbNo?: string | null;
  piEwbDate?: string | null;
  /** R19: Payment refuses a held bill. */
  piPaymentHold?: boolean | null;
  piHoldReason?: string | null;
  piChargesOnBill?: Wire;
  piOffbillCharges?: Wire;
};

/** `GET /purchase/invoices/get` (and every write's answer). */
export type PurchaseInvoicePayload = {
  header: PurchaseInvoiceHeaderRow;
  lines: PurchaseInvoiceLineRow[];
  /** One stored row per charge, or per payee for an off-bill one (PI-HEADER). */
  charges?: PurchaseChargeStored[];
  /** Save only: a WARN setting let the bill through and says so. */
  warnings?: { code: string; message: string; field: string; level?: string; lineNo?: number | null; needsRight?: string | null }[];
  refusals?: PurchaseIssue[];
  totals?: Record<string, unknown> | null;
};

/** One line of `POST /purchase/invoices/validate`. */
export type PurchaseCalcLine = {
  lineNo: number;
  taxable?: Wire;
  gstPct?: Wire;
  cgst?: Wire;
  sgst?: Wire;
  igst?: Wire;
  cess?: Wire;
  total?: Wire;
  landedCostWot?: Wire;
  pendingShortQty?: Wire;
  // ── Qt 0fbe19c..e0c56ef (PI-LINES) ──────────────────────────────────────
  /** R18. */
  rejectedQty?: Wire;
  /** LAW-01: ELIGIBLE / RCM / BLOCKED_17_5 / INELIGIBLE / COMPOSITION / UNREGISTERED. */
  itcClass?: string | null;
  itcEligible?: Wire;
  itcPending?: Wire;
  itcIneligible?: Wire;
  /** The line's rate — back-solved when costIncl was sent (ENT-04). */
  rate?: Wire;
  /** Cost per billed unit incl. tax, 2 places, as text. */
  costIncl?: string | null;
  sellA?: Wire;
  markupAPct?: string | null;
  marginAPct?: string | null;
  poRefno?: string | null;
  check?: InvoiceLineCheck | null;
};

export type PurchaseCalcAnswer = {
  lines: PurchaseCalcLine[];
  totals: {
    taxable?: Wire;
    cgst?: Wire;
    sgst?: Wire;
    igst?: Wire;
    cess?: Wire;
    roundOff?: Wire;
    netPayable?: Wire;
    shortValue?: Wire;
    itcPending?: Wire;
    // ── PI-HEADER ──
    chargesOnBill?: Wire;
    offbillCharges?: Wire;
    tcs?: Wire;
  };
  /** In the order the charges were sent (PI-HEADER). */
  charges?: PurchaseChargeCalc[];
  invoiceAmountPrinted?: Wire;
  difference?: Wire;
  // ── rebuild 2026-10-29 ──
  interState?: boolean;
  header?: Record<string, unknown>;
  warnings?: PurchaseIssue[];
  refusals?: PurchaseIssue[];
};

/** `GET /stock/opening/item-lookup`. */
export type PurchaseItemLookup = {
  itemId: string;
  itemCode?: string | null;
  itemName: string;
  barcode?: string | null;
  uomId: string;
  unitName: string;
  toBaseFactor: Wire;
  taxPerc: Wire;
  trackSignature?: string | null;
  mrp?: Wire;
};

export type PurchaseItemLookupQuery = {
  companyId: string;
  branchId: string;
  itemId: string;
  uomId?: string;
  onDate: string;
};

/** `GET /master-lookups/item-by-barcode` — `unitId` is an iuc_id. */
export type PurchaseBarcodeItem = {
  itemId: string;
  unitId?: string | null;
  itemName?: string | null;
};

// ── Qt 0fbe19c..e0c56ef line sources and context (PI-LINES) ──────────────

/** `GET /purchase/invoices/grn-lines` — a supplier's posted GRN lines not billed yet (R4). */
export type PurchaseGrnLine = {
  grnItemId: string;
  grnItemAccYear: string;
  grnId: string;
  grnRefno: string;
  /** ISO day. */
  grnDate?: string | null;
  lineNo?: Wire;
  challanNo?: string | null;
  supplierInvNo?: string | null;
  poRefno?: string | null;
  itemId: string;
  itemName?: string | null;
  uomId: string;
  unitName?: string | null;
  challanQty?: Wire;
  receivedQty?: Wire;
  damagedQty?: Wire;
  freeQty?: Wire;
  returnedQty?: Wire;
  returnedFreeQty?: Wire;
  provisionalRate?: Wire;
  poRate?: Wire;
  poDiscPct?: Wire;
  mrp?: Wire;
  sellA?: Wire;
  sellB?: Wire;
  sellC?: Wire;
  sellD?: Wire;
  /** Why it cannot be billed yet — null today (WS6). */
  blocked?: string | null;
};

/** `GET /purchase/orders/pending-lines` — a supplier's confirmed PO lines with qty pending (DOC-04). */
export type PurchasePoPendingLine = {
  poId: string;
  accYear: string;
  refno: string;
  docDate?: string | null;
  poiId: string;
  lineNo?: Wire;
  itemId: string;
  itemName?: string | null;
  uomId: string;
  unitName?: string | null;
  rate?: Wire;
  discPct?: Wire;
  schPct?: Wire;
  mrp?: Wire;
  orderedQty?: Wire;
  pendingQty?: Wire;
};

/** `GET /purchase/lookup/item-context` (B9) — the item strip, the line defaults (ENT-02) and the scheme (ENT-07). */
export type PurchaseItemContext = {
  itemId: string;
  itemName?: string | null;
  baseUnit?: string | null;
  lastPurchases?: {
    docDate?: string | null;
    refno?: string | null;
    supplierName?: string | null;
    supplierId?: string | null;
    rate?: Wire;
    discPct?: Wire;
    unitName?: string | null;
    baseCostWot?: Wire;
  }[];
  poRate?: {
    poId?: string;
    poiId?: string;
    accYear?: string;
    discPct?: Wire;
    schPct?: Wire;
    refno?: string | null;
    rate?: Wire;
    netRate?: Wire;
    unitName?: string | null;
    pendingQty?: Wire;
  } | null;
  stock?: { saleable?: Wire; damaged?: Wire; unitName?: string | null } | null;
  prices?: {
    sellA?: Wire;
    sellB?: Wire;
    sellC?: Wire;
    sellD?: Wire;
    mrp?: Wire;
    costWot?: Wire;
    effectiveFrom?: string | null;
  } | null;
  supplierItem?: {
    code?: string | null;
    barcode?: string | null;
    moq?: Wire;
    leadDays?: Wire;
    preferred?: boolean | null;
    packQty?: Wire;
    schemeBuyQty?: Wire;
    schemeFreeQty?: Wire;
  } | null;
};

export type PurchaseItemContextQuery = {
  companyId: string;
  branchId: string;
  itemId: string;
  uomId?: string;
  supplierId?: string;
  onDate?: string;
};

/** The session rules the line grid follows (not the bill's own data). */
export type LineSettings = {
  /** purchase.allow_price_update + UPDATE_PRICES: Sell A–D and Markup are keyed and sent. */
  priceUpdate: boolean;
  /** stock.auto_batch_no: a batch-tracked line takes Size · Colour · Model; Post gives the batch. */
  autoBatchNo: boolean;
};

// ---------------------------------------------------------------------------
// The screen's draft
// ---------------------------------------------------------------------------

/** The server's figures for one line — painted, never computed here. */
export type LineCalc = {
  taxable: number;
  gstPct: number;
  tax: number;
  total: number;
  costWot: number;
  shortQty: number;
  /** R18 — billed beyond what the GRN kept. */
  rejectedQty: number;
  /** LAW-01 — the ITC cell's words ("Elig.", "RCM", "120.00 E · 12.00 P"). */
  itc: string;
  /** Callout 9 — the server's line judgement (`lines[].check`, rebuild 2026-10-29). */
  check?: InvoiceLineCheck | null;
};

export type InvoiceLine = {
  key: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  /** iuc_id */
  uomId: string;
  unitName: string;
  factor: number;
  signature: string;
  /** The typed cells, as typed. */
  batch: string;
  /** dd/MM/yyyy as typed; ISO only in the payload. */
  expiry: string;
  billed: string;
  recd: string;
  dmg: string;
  free: string;
  rate: string;
  discPct: string;
  mrp: string;
  /** The item's GST % until the server's answer paints its own. */
  gstPct: string;
  /** pii_id of a loaded line. */
  lineId: string;
  /**
   * The line's F12 split (Qt hidden Allocs column 27): several batches /
   * serials / sizes, or rows in another godown. Null = Batch / Expiry (and the
   * textile cells) on the row are the whole story. A split line's batch and
   * expiry cells are shut; the payload sends these rows as allocs[].
   */
  split: PurchaseAllocEntry[] | null;
  calc: LineCalc | null;
  // ── Qt 0fbe19c..e0c56ef (PI-LINES) ──────────────────────────────────────
  /** R4: a line billing a GRN line — qty, unit and batches are the GRN's. */
  grnItemId: string;
  grnYear: string;
  /** DOC-04: a line receiving a PO line. */
  poItemId: string;
  poYear: string;
  /** DOC-08: a line pulled from a sister company's sale bill. */
  sisterSaleItemId: string;
  sisterSaleItemYear: string;
  /** The "PO / GRN" cell — the source document's number (its last segment). */
  srcRefno: string;
  /** Textile (stock.auto_batch_no): picked from dropdowns 70 / 71; Model typed. */
  sizeId: string;
  sizeName: string;
  colourId: string;
  colourName: string;
  model: string;
  /** Selling prices (shown with priceUpdate): as typed / as the server answered. */
  sellA: string;
  sellB: string;
  sellC: string;
  sellD: string;
  /** ENT-18 Sell A markup % on cost w/o tax; the margin is its tooltip. */
  markup: string;
  marginPct: string;
  /** ENT-06. */
  schPct: string;
  extraDisc: string;
  /** ENT-04: the cost per billed unit incl. tax; `costTyped` until the answer back-solves Rate. */
  costIncl: string;
  costTyped: boolean;
  /** ENT-07: Free was typed (or blanked) by the operator — the scheme leaves it alone. */
  freeTyped: boolean;
  /** ENT-07: the Free the scheme last filled in. */
  freeAuto: string;
  /** D16 on a posted line: a newer price change won (Check reads PRICE KEPT). */
  priceKept: boolean;
};

export type InvoiceTotals = {
  taxable: number;
  gst: number;
  roundOff: number;
  netPayable: number;
  invoiceAmount: number;
  difference: number;
  shortValue: number;
  itcPending: number;
  // ── PI-HEADER ──
  chargesOnBill: number;
  /** Our own (off-bill) costs — not on the supplier's bill. */
  offbillCharges: number;
  tcs: number;
};

export type InvoiceDraft = {
  piId: string;
  refno: string;
  status: string;
  companyId: string;
  branchId: string;
  accYear: string;
  deviceId: string;
  supplierId: string;
  supplierName: string;
  supplierInvNo: string;
  /** ISO yyyy-MM-dd */
  supplierInvDate: string;
  docDate: string;
  godownId: string;
  godownName: string;
  /** As typed. */
  invoiceAmount: string;
  remarks: string;
  lines: InvoiceLine[];
  totals: InvoiceTotals | null;
  hint: string;
  /** "browse" = read-only until Edit (F2). */
  viewMode: "browse" | "entry";
  dirty: boolean;
  /** Line keys are `l<n>`; this is the next n. */
  nextKey: number;
  /** The session's line rules (purchase / stock settings) — carried across New and loads (PI-LINES). */
  lineSettings: LineSettings;
  // ── Qt 88cd3f2 / 9028830 / 348957f header and side (PI-HEADER) ──
  charges: InvoiceChargeRow[];
  /** Charge keys are `c<n>`; this is the next n. */
  nextChargeKey: number;
  /** The auto-apply charges were put on (or the bill was loaded): not seeded again. */
  chargesSeeded: boolean;
  /** As typed. */
  tcsAmount: string;
  ewbNo: string;
  /** ISO yyyy-MM-dd; "" = none. */
  ewbDate: string;
  /** R19 — a posted bill Payment must not settle. */
  paymentHold: boolean;
  holdReason: string;
  // ── 2026-10-29 fidelity rebuild (invoice-fidelity.ts) ──
  ext: InvoiceHeaderExt;
  facts: InvoiceHeaderFacts;
  /** The WARN / REFUSE strip's rows (validate, save, a refused post). */
  issues: InvoiceIssues;
  /** The server's totals object as sent (the boxed TOTALS). */
  serverTotals: InvoiceServerTotals | null;
};

export type InvoiceScope = {
  companyId: string;
  branchId: string;
  accYear: string;
  deviceId: string;
};
