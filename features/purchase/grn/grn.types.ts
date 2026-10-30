/**
 * GRN (menu 196) — the wire shapes of `/purchase/grns/*` (server
 * src/modules/purchase/grn/purchase-grn.ts) and the screen's own draft.
 *
 * The server's `get` spreads the Prisma rows, so the header and line keys are
 * the model's camelCase fields (`grnRefno`, `griReceivedQty` …); decimals arrive
 * as strings (pg NUMERIC), dates as ISO timestamps.
 */
import type { PurchaseChargeMasterRow } from "../shared/purchase-charges";
import type { DropdownSelection } from "@/components/design-system/dropdown/types";
import type { PurchaseAllocEntry } from "../shared/purchase-dialogs.types";
import type { PurchaseIssue, PurchaseTransportBand } from "../shared/purchase-parts";

type WireNumber = number | string | null;

// ---------------------------------------------------------------------------
// GET /purchase/grns/get (also the answer of save / post / cancel)
// ---------------------------------------------------------------------------

export type GrnAllocWire = {
  piaId?: string;
  piaGodownId?: string | null;
  piaBucket?: string | null;
  piaBatchNo?: string | null;
  piaMfgDate?: string | null;
  piaExpiryDate?: string | null;
  piaMrp?: WireNumber;
  piaSerialNo?: string | null;
  piaWarrantyTo?: string | null;
  piaSizeId?: string | null;
  piaColourId?: string | null;
  piaModel?: string | null;
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
  /** When the goods came in (ISO timestamp); kept as first saved unless typed again. */
  grnReceivedAt?: string | null;
  grnSupervisorId?: string | null;
  grnVehicleNo?: string | null;
  grnDriverName?: string | null;
  grnEwbNo?: string | null;
  grnEwbDate?: string | null;
  grnPackagesSent?: number | null;
  grnPackagesReceived?: number | null;
  grnRemarks?: string | null;
  grnStatus: string;
  grnProvisionalValue?: WireNumber;
  grnOffbillCharges?: WireNumber;
  godownName?: string | null;
  supervisorName?: string | null;
  receivedBy?: { id: string; name: string }[];
  billStatus?: GrnBillStatus | string;
  poRefs?: { poId: string; accYear: string; refno: string }[];
  transport?: PurchaseTransportBand | null;
};

export type GrnBillStatus = "NOT_BILLED" | "PART" | "BILLED";

/** One chip of the Check column (server purchase-grn-checks.ts GrnChip). */
export type GrnChip = { code: "OK" | "SHORT" | "DAMAGED" | "SHELF_LIFE" | "SERIALS" | "EXCESS" | string; text: string };

/** The line's check (server GrnLineCheck) — /validate, /save, /get. */
export type GrnLineCheck = {
  shortQty?: string;
  damagedQty?: string;
  damageReasonMissing?: boolean;
  excessQty?: string;
  excessAction?: string | null;
  shelfLifePct: number | null;
  minShelfLifePct: number | null;
  labels: number;
  serials: { have: number; need: string } | null;
  chips: GrnChip[];
};

/** The six cells of the totals strip (server `totalsOf`). Decimals as strings. */
export type GrnServerTotals = {
  lines: number;
  receivedBase: string;
  damagedBase: string;
  freeBase: string;
  shortBase: string;
  shortLines: number;
  offbillCharges: string;
  provisionalValue: string;
  total: string;
};

/** A charge as /validate prices it, or /get stores it (with the master's words). */
export type GrnChargeWire = {
  chgId: string;
  chgName?: string;
  role?: string | null;
  method?: string;
  type?: string;
  rate?: string;
  amount: string;
  payees: { partyId: string; partyName?: string | null; amount: string }[];
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
  griDamageReasonId?: string | null;
  damageReasonName?: string | null;
  griProvisionalRate?: WireNumber;
  griValue?: WireNumber;
  griMrp?: WireNumber;
  /** purchase.price_set_at = GRN: the price levels written on Post (Qt 6e025ef / 40c8b2c). */
  griSellA?: WireNumber;
  griSellB?: WireNumber;
  griSellC?: WireNumber;
  griSellD?: WireNumber;
  /** Over the PO's pending, and what was done with it. */
  griExcessQty?: WireNumber;
  griExcessAction?: string | null;
  billed?: boolean;
  billRefno?: string | null;
  check?: GrnLineCheck | null;
  allocs?: GrnAllocWire[];
};

export type GrnPayload = {
  header: GrnHeaderWire;
  lines: GrnLineWire[];
  charges?: GrnChargeWire[];
  totals?: GrnServerTotals | null;
  /** save / post only: excess held, shelf life, prices not written … */
  warnings?: PurchaseIssue[];
  refusals?: PurchaseIssue[];
};

/** POST /purchase/grns/validate — writes nothing. */
export type GrnValidateAnswer = {
  header: { supplierName?: string; godownName?: string | null; poRefs?: { poId: string; accYear: string; refno: string }[] };
  lines: { lineNo: number; receivedQty: string; freeQty: string; excessQty: string; excessAction: string | null; value: string | null; check: GrnLineCheck | null }[];
  charges: GrnChargeWire[];
  totals: GrnServerTotals | null;
  warnings: PurchaseIssue[];
  refusals: PurchaseIssue[];
};

/** GET /stock/reasons — only what the screen reads. */
export type GrnReasonRow = { srmId: string; name: string; isActive?: boolean };

/** GET /charges/get?chgModule=P — the GRN reads these keys (Qt `withChargeMaster`, `loadCoolieCharge`). */
/** The purchase charge master row (shared/purchase-charges.ts — one master read for the bill and the GRN). */
export type GrnChargeMasterRow = PurchaseChargeMasterRow;

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
  /** The item's tracking signature — B = batch, R = serial (F12 and the textile cells follow it). */
  trackSignature?: string | null;
};

// ---------------------------------------------------------------------------
// POST /purchase/grns/save
// ---------------------------------------------------------------------------

/** The server's PurchaseAllocDto (shared with Purchase Entry). */
export type GrnAllocDto = {
  godownId?: string;
  bucket: "SALEABLE" | "DAMAGED";
  batchNo?: string;
  mfgDate?: string;
  expiryDate?: string;
  mrp?: number;
  serialNo?: string;
  warrantyTo?: string;
  sizeId?: string;
  colourId?: string;
  model?: string;
  qty: number;
  freeQty?: number;
};

/** What to do with what came over the PO's pending (Qt `GrnCols::ExcessAct`). */
export type GrnExcessAction = "" | "HOLD_FOR_BILL" | "KEEP_FREE" | "RETURN";

export type GrnLineDto = {
  lineNo: number;
  itemId: string;
  uomId: string;
  poItemId?: string;
  poItemAccYear?: string;
  challanQty?: number;
  receivedQty: number;
  damagedQty?: number;
  damageReasonId?: string;
  freeQty?: number;
  excessQty?: number;
  excessAction?: Exclude<GrnExcessAction, "">;
  rate: number;
  mrp?: number;
  sellA?: number;
  sellB?: number;
  sellC?: number;
  sellD?: number;
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
  /** Only when typed (the server keeps the first one). ISO with zone. */
  receivedAt?: string;
  challanNo?: string;
  challanDate?: string;
  vehicleNo?: string;
  driverName?: string;
  supervisorId?: string;
  ewbNo?: string;
  ewbDate?: string;
  packagesSent?: number;
  packagesReceived?: number;
  remarks?: string;
  receivedBy: string[];
  /** false = the coolie row was taken out (the operator's own charge set). */
  payCoolie?: boolean;
  /** Omitted = the saved band is kept; null = removed. */
  transport?: PurchaseTransportBand | null;
  overrideWarnings?: boolean;
  overrideReason?: string;
  post: boolean;
};

export type GrnChargeDto = { chgId: string; rate?: number; amount?: number; payees?: { partyId: string }[] };

export type SaveGrnDto = { header: GrnHeaderDto; lines: GrnLineDto[]; charges?: GrnChargeDto[] };

export type GrnRefArgs = { grnId: string; accYear: string; overrideWarnings?: boolean; overrideReason?: string };
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
  /** The PO's number, whole ("PO/2026-2027/D14/00106"); From PO shows the refs. */
  poRef: string;
  /** The PO line's number (the PO pend. tooltip). */
  poLineNo: string;
  /** What the PO still had to come when the row was filled; blank otherwise. */
  pending: string;
  challan: string;
  recd: string;
  dmg: string;
  /** Callout 3: the Stock Reason a damaged qty names. */
  damageReasonId: string;
  damageReasonName: string;
  free: string;
  rate: string;
  batch: string;
  /** dd/MM/yyyy as typed. */
  expiry: string;
  mrp: string;
  /** The item's tracking signature (Qt `GrnCols::Signature`): B = batch, R = serial; "" = not known yet. */
  signature: string;
  /**
   * The line's F12 split (Qt `GrnCols::Allocs`); empty = Batch / Expiry (and the
   * textile cells) on the row are the line's one allocation row.
   */
  allocs: PurchaseAllocEntry[];
  /** Textile (stock.auto_batch_no + a batch-tracked item): ids; the grid names them from the lists. */
  sizeId: string;
  colourId: string;
  model: string;
  /** purchase.price_set_at = GRN: Sell A–D, written on Post. */
  sellA: string;
  sellB: string;
  sellC: string;
  sellD: string;
  /** What came over the PO's pending: kept back at the gate (RETURN only). */
  excess: string;
  excessAction: GrnExcessAction;
  /** The server's line value (/validate, /get); "" = not priced yet (the screen's estimate shows). */
  serverValue: string;
  /** The server's Check (/validate, /get): chips, shelf life %, labels; null = not judged yet. */
  check: GrnLineCheck | null;
  /** A bill took this line: its refno (Bill status). */
  billRefno: string;
};

/** One off-bill charge row (Qt `PurchaseChargeCols` on the GRN). */
export type GrnChargeRow = {
  key: string;
  chgId: string;
  name: string;
  method: string;
  type: string;
  role: string;
  /** As typed / as the server last priced it. */
  rate: string;
  amount: string;
  /** The operator typed the Amount: it is sent as the amount. */
  typed: boolean;
  /** Payee ids as the screen sends them (employees), and their names in order. */
  payeeIds: string[];
  payeeNames: string[];
  /** "Ravi 321.00 · Kumar 321.00" — the server's split, once priced. */
  payeeText: string;
  /** The charge's own ledger, when it has no payees ("Loading Charges Payable (ledger)"). */
  ledgerName: string;
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
  /** ISO yyyy-MM-dd — the date part of Received. */
  docDate: string;
  /** Received, local `yyyy-MM-ddTHH:mm` (DateTimeInput). */
  receivedAt: string;
  /** Typed here: sent (else the server keeps the first one). */
  receivedTyped: boolean;
  challanNo: string;
  /** ISO yyyy-MM-dd, or "". */
  challanDate: string;
  vehicleNo: string;
  driverName: string;
  /** The employee who checked the goods in — the GRN's "Received by". */
  supervisorId: string;
  supervisorName: string;
  ewbNo: string;
  /** ISO yyyy-MM-dd, or "". */
  ewbDate: string;
  packagesSent: string;
  packagesReceived: string;
  /** The transport band (popup); null = none. Sent only when touched. */
  transport: PurchaseTransportBand | null;
  transportTouched: boolean;
  remarks: string;
  /** Who unloaded — the coolie is owed to each. In pick order. */
  loadmen: DropdownSelection[];
  /** Off-bill charges (our own labour / freight), payees loadman-wise. */
  charges: GrnChargeRow[];
  /** The operator changed the charges: the screen sends them all (else the server's coolie default). */
  chargesTouched: boolean;
  /** The operator took the unloading coolie row out (payCoolie: false). */
  coolieDropped: boolean;
  /** The server's six totals (/validate, /get); null = none yet. */
  serverTotals: GrnServerTotals | null;
  /** The strip: the server's warnings / refusals (a refused post adds its errors[]). */
  warnings: PurchaseIssue[];
  refusals: PurchaseIssue[];
  /** "override (logged)" ticked. */
  overrideTicked: boolean;
  lines: GrnLine[];
  /** The supplier's pending PO lines ("Against PO"), and whose they are. */
  pendingLines: PendingPoLine[];
  pendingFor: string;
  /** The PO last chosen in Against PO ("" = without PO). */
  poChoice: string;
  /** Off-bill coolie the server worked out (grnOffbillCharges); 0 until saved. */
  coolie: number;
  billed: boolean;
  billStatus: GrnBillStatus;
  /** stock.auto_batch_no — a batch-tracked line takes Model · Size · Colour, Post numbers the batch. */
  autoBatchNo: boolean;
  /** purchase.price_set_at = GRN (+ allow_price_update, UPDATE_PRICES): Sell A–D on the line. */
  priceAtGrn: boolean;
  /** "browse" = opened to look at; "entry" = keyable while DRAFT. */
  viewMode: "browse" | "entry";
  dirty: boolean;
  hint: string;
};

/** What a new document is raised under. */
export type GrnScope = { companyId: string; branchId: string; accYear: string; deviceId: string };

export type GrnTotals = { lines: number; qty: number; value: number; short: number };
