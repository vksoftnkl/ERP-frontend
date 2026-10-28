/**
 * GRN (menu 196) — the wire shapes of `/purchase/grns/*` (server
 * src/modules/purchase/grn/purchase-grn.ts) and the screen's own draft.
 *
 * The server's `get` spreads the Prisma rows, so the header and line keys are
 * the model's camelCase fields (`grnRefno`, `griReceivedQty` …); decimals arrive
 * as strings (pg NUMERIC), dates as ISO timestamps.
 */
import type { DropdownSelection } from "@/components/design-system/dropdown/types";

type WireNumber = number | string | null;

// ---------------------------------------------------------------------------
// GET /purchase/grns/get (also the answer of save / post / cancel)
// ---------------------------------------------------------------------------

export type GrnAllocWire = {
  piaBucket?: string | null;
  piaBatchNo?: string | null;
  piaExpiryDate?: string | null;
  piaMrp?: WireNumber;
  piaQty?: WireNumber;
  piaFreeQty?: WireNumber;
};

export type GrnHeaderWire = {
  grnId: string;
  grnRefno: string;
  grnCompanyId: string;
  grnBranchId: string;
  grnAccYear: string;
  grnDeviceId?: string | null;
  grnSupplierId: string;
  supplierName?: string | null;
  grnGodownId: string;
  grnDocDate: string;
  grnChallanNo?: string | null;
  grnChallanDate?: string | null;
  grnVehicleNo?: string | null;
  grnRemarks?: string | null;
  grnStatus: string;
  grnProvisionalValue?: WireNumber;
  grnOffbillCharges?: WireNumber;
  receivedBy?: { id: string; name: string }[];
  billStatus?: "BILLED" | "NOT_BILLED" | string;
};

export type GrnLineWire = {
  griId: string;
  griLineNo?: number;
  griItemId: string;
  griUomId: string;
  itemName?: string | null;
  unitName?: string | null;
  griSrcItemId?: string | null;
  griSrcDocYear?: string | null;
  poRefno?: string | null;
  griChallanQty?: WireNumber;
  griReceivedQty?: WireNumber;
  griDamagedQty?: WireNumber;
  griFreeQty?: WireNumber;
  griProvisionalRate?: WireNumber;
  griMrp?: WireNumber;
  allocs?: GrnAllocWire[];
};

export type GrnWarning = { field?: string; code?: string; message: string };

export type GrnPayload = {
  header: GrnHeaderWire;
  lines: GrnLineWire[];
  /** save / post only: excess held, shelf life, prices not written … */
  warnings?: GrnWarning[];
};

// ---------------------------------------------------------------------------
// GET /purchase/orders/pending-lines
// ---------------------------------------------------------------------------

export type PendingPoLine = {
  poId: string;
  accYear: string;
  refno: string;
  docDate: string;
  poiId: string;
  lineNo?: number;
  itemId: string;
  itemName: string;
  uomId: string;
  unitName: string;
  rate: WireNumber;
  discPct: WireNumber;
  schPct: WireNumber;
  mrp: WireNumber;
  orderedQty?: WireNumber;
  pendingQty: WireNumber;
};

// ---------------------------------------------------------------------------
// Item reads
// ---------------------------------------------------------------------------

/** GET /master-lookups/item-by-barcode — `unitId` is an iuc_id. */
export type GrnBarcodeItem = { itemId: string; unitId?: string | null; itemName: string };

/** GET /stock/opening/item-lookup — only what the GRN reads. */
export type GrnItemLookup = {
  itemId: string;
  itemName: string;
  uomId: string;
  unitName: string | null;
  mrp: WireNumber;
};

// ---------------------------------------------------------------------------
// POST /purchase/grns/save
// ---------------------------------------------------------------------------

export type GrnAllocDto = {
  bucket: "SALEABLE" | "DAMAGED";
  batchNo?: string;
  expiryDate?: string;
  mrp?: number;
  qty: number;
  freeQty?: number;
};

export type GrnLineDto = {
  lineNo: number;
  itemId: string;
  uomId: string;
  poItemId?: string;
  poItemAccYear?: string;
  challanQty?: number;
  receivedQty: number;
  damagedQty?: number;
  freeQty?: number;
  rate: number;
  mrp?: number;
  allocs?: GrnAllocDto[];
};

export type GrnHeaderDto = {
  grnId?: string;
  companyId: string;
  branchId: string;
  accYear: string;
  deviceId: string;
  supplierId: string;
  godownId: string;
  docDate: string;
  challanNo?: string;
  challanDate?: string;
  vehicleNo?: string;
  remarks?: string;
  receivedBy: string[];
  post: boolean;
};

export type SaveGrnDto = { header: GrnHeaderDto; lines: GrnLineDto[] };

export type GrnRefArgs = { grnId: string; accYear: string };
export type CancelGrnArgs = GrnRefArgs & { reason: string };

// ---------------------------------------------------------------------------
// The screen's draft
// ---------------------------------------------------------------------------

/** One grid row. Cells are held as typed text, as the Qt grid holds them. */
export type GrnLine = {
  key: string;
  /** griId of a saved line (LineId). */
  lineId: string;
  /** What was scanned into the Barcode cell. */
  barcode: string;
  itemId: string;
  itemName: string;
  uomId: string;
  unitName: string;
  /** The PO line this row receives (PoItemId), and that PO's accounting year. */
  poItemId: string;
  poItemAccYear: string;
  /** The PO's number, last segment ("00106"). */
  poRef: string;
  /** What the PO still had to come when the row was filled; blank otherwise. */
  pending: string;
  challan: string;
  recd: string;
  dmg: string;
  free: string;
  rate: string;
  batch: string;
  /** dd/MM/yyyy as typed. */
  expiry: string;
  mrp: string;
};

export type GrnStatus = "DRAFT" | "POSTED" | "CANCELLED";

export type GrnDraft = {
  grnId: string;
  refno: string;
  status: string;
  companyId: string;
  branchId: string;
  accYear: string;
  deviceId: string;
  supplierId: string;
  supplierName: string;
  godownId: string;
  godownName: string;
  /** ISO yyyy-MM-dd. */
  docDate: string;
  challanNo: string;
  /** ISO yyyy-MM-dd, or "". */
  challanDate: string;
  vehicleNo: string;
  remarks: string;
  /** Who unloaded — the coolie is owed to each. In pick order. */
  loadmen: DropdownSelection[];
  lines: GrnLine[];
  /** The supplier's pending PO lines ("Against PO"), and whose they are. */
  pendingLines: PendingPoLine[];
  pendingFor: string;
  /** The PO last chosen in Against PO ("" = without PO). */
  poChoice: string;
  /** Off-bill coolie the server worked out (grnOffbillCharges); 0 until saved. */
  coolie: number;
  billed: boolean;
  /** "browse" = opened to look at; "entry" = keyable while DRAFT. */
  viewMode: "browse" | "entry";
  dirty: boolean;
  hint: string;
};

/** What a new document is raised under. */
export type GrnScope = { companyId: string; branchId: string; accYear: string; deviceId: string };

export type GrnTotals = { lines: number; qty: number; value: number; short: number };
