/**
 * Purchase Entry (menu 24) — the wire shapes (server
 * `src/modules/purchase/invoice/dto/save-purchase-invoice.dto.ts` and the
 * service's answers) and the screen's own draft.
 *
 * Every pg NUMERIC arrives as a STRING (jsonSafe / `decimals()`): read them
 * with `num()`, never with bare arithmetic.
 */

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
  post: boolean;
};

export type SavePurchaseInvoiceDto = {
  header: PurchaseInvoiceHeaderDto;
  lines: PurchaseInvoiceLineDto[];
  charges: never[];
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
};

/** `GET /purchase/invoices/get` (and every write's answer). */
export type PurchaseInvoicePayload = {
  header: PurchaseInvoiceHeaderRow;
  lines: PurchaseInvoiceLineRow[];
  charges?: unknown[];
  /** Save only: a WARN setting let the bill through and says so. */
  warnings?: { code: string; message: string; field: string }[];
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
  };
  invoiceAmountPrinted?: Wire;
  difference?: Wire;
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
   * A loaded line split into several batches (not one SALEABLE row, plus at
   * most one DAMAGED): its stored rows, sent back as they were. The batch and
   * expiry cells cannot express them, so they are shut.
   */
  keptAllocs: PurchaseAllocDto[] | null;
  calc: LineCalc | null;
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
};

export type InvoiceScope = {
  companyId: string;
  branchId: string;
  accYear: string;
  deviceId: string;
};
