/**
 * Stock Adjustment — the wire (the server's DTOs and payloads, spelled as it
 * spells them) and the screen's own draft.
 */
import type { Kind, KindCode, SaveKind } from "./stock-adjustment.constants";

// ---------------------------------------------------------------------------
// Wire — reads
// ---------------------------------------------------------------------------

/** `GET /stock/reasons` — one StockReasonRow. */
export type StockReasonRow = {
  srmId: string;
  companyId: string | null;
  isShared: boolean;
  code: string;
  name: string;
  /** IN | OUT | BOTH */
  direction: string;
  allowedTxnTypes: string[];
  requireRemarks: boolean;
  glLedgerId: string | null;
  glLedgerName: string | null;
  sortOrder: number;
  remarks: string | null;
  isActive: boolean;
};

/** One row of `GET /stock/adjustment/pick-stock` — balance grain, available > 0. */
export type PickStockRow = {
  sblId: string;
  itemId: string;
  itemCode: string | null;
  itemName: string;
  godownId: string;
  lotId: string;
  bucket: string;
  batchNo: string | null;
  mfgDate: string | null;
  expiryDate: string | null;
  mrp: number | null;
  salePrice: number | null;
  serialNo: string | null;
  supplierId: string | null;
  supplierName: string | null;
  baseUomId: string;
  unitName: string | null;
  onHandQty: number;
  reservedQty: number;
  availableQty: number;
  avgCostRate: number;
  stockValue: number;
  firstInDate: string | null;
};

export type PickStockQuery = {
  companyId: string;
  branchId: string;
  godownId: string;
  /** Absent = every bucket, each row naming its own. */
  bucket?: string;
  itemId?: string;
  search?: string;
  limit?: number;
};

/** `GET /stock/opening/item-lookup` — the unit, the base unit and the tracking signature. */
export type StockItemLookup = {
  itemId: string;
  itemCode: string | null;
  itemName: string;
  barcode: string | null;
  uomId: string;
  unitName: string;
  toBaseFactor: number;
  baseUomId: string;
  taxPerc: number;
  cessPerc: number;
  cessUnit: number;
  trackSignature: string;
  mrp: number;
  salePrice: number;
  alreadyOpened: boolean;
};

export type StockItemLookupQuery = {
  companyId: string;
  branchId: string;
  itemId: string;
  uomId?: string;
  onDate: string;
};

/** `GET /master-lookups/item-by-barcode` — `unitId` is an iuc_id. */
export type BarcodeItemLookup = {
  itemId: string;
  unitId: string;
  itemName: string;
};

/** `GET /ledger-map/roles` — only what the accounts card reads. */
export type LedgerRoleRow = {
  role: string;
  label?: string;
  ledgerName: string | null;
};

/** Grid 71 "POPUP - ITEMS": one row per item × unit conversion. */
export type ItemPickerRow = {
  item_id: string;
  /** An iuc_id, never a unit_id. */
  item_uom_id: string;
  item_name_en: string;
  unit_name: string;
};

export type ConfiguredGridPage<TRow> = {
  items: TRow[];
  meta: { page: number; limit: number; total: number };
};

/** The shared StockVoucherHeaderPayload — the fields this screen reads. */
export type StockAdjustmentHeaderPayload = {
  svhId: string;
  accYear: string;
  companyId: string;
  branchId: string;
  deviceId: string;
  voucherType: string;
  slno: string;
  refno: string;
  usrRefno: string | null;
  docDate: string;
  fromGodownId: string | null;
  fromGodownName: string | null;
  godownId: string | null;
  godownName: string | null;
  status: string;
  lineCount: number;
  totalQty: number;
  totalValue: number;
  totalValueWot: number;
  postedOn: string | null;
  cancelledOn: string | null;
  cancelReason: string | null;
  rateSource: string | null;
  reasonId: string | null;
  reasonName: string | null;
  remarks: string | null;
  isDeleted: boolean;
};

/** The shared StockVoucherLinePayload — the fields this screen reads. */
export type StockAdjustmentLinePayload = {
  sviId: string;
  lineNo: number;
  splitNo: number;
  itemId: string;
  itemCode: string | null;
  itemName: string;
  unitName: string | null;
  uomId: string;
  baseUomId: string;
  toBaseFactor: number;
  godownId: string;
  godownName: string | null;
  bucket: string;
  barcode: string | null;
  batchNo: string | null;
  mfgDate: string | null;
  expiryDate: string | null;
  mrp: number | null;
  salePrice: number | null;
  serialNo: string | null;
  supplierId: string | null;
  supplierName: string | null;
  toBucket: string | null;
  /** A magnitude: the sign rides on `direction`. */
  qty: number;
  baseQty: number;
  costRate: number;
  value: number;
  lotId: string | null;
  reasonId: string | null;
  reasonName: string | null;
  /** +1 / −1 on an ADJUSTMENT (re-lot included) and a move; null on the write-off kinds. */
  direction: number | null;
  remarks: string | null;
  trackSignature: string;
};

/** `GET /stock/adjustment` — the shared payload plus what the Type selector shows. */
export type StockAdjustmentPayload = {
  header: StockAdjustmentHeaderPayload;
  lines: StockAdjustmentLinePayload[];
  kind: KindCode;
};

/** `POST /stock/adjustment` — rowsPosted is null when the save left a DRAFT. */
export type StockAdjustmentSaveResult = {
  header: StockAdjustmentHeaderPayload;
  lines: StockAdjustmentLinePayload[];
  rowsPosted: number | null;
};

/** `GET /stock/adjustment/validate` — one row per line; problem null means clean. */
export type StockVoucherLineProblem = {
  sviId: string;
  lineNo: number;
  splitNo: number;
  itemId: string;
  itemCode: string | null;
  itemName: string;
  problem: string | null;
};

/** The four fields a stored document is keyed by — stock_voucher is partitioned by year. */
export type StockAdjustmentDocKey = {
  svhId: string;
  companyId: string;
  branchId: string;
  accYear: string;
  /** The list row's refno, for the prompts that name the document. */
  refno?: string;
  status?: string;
};

export type CancelStockAdjustmentArgs = {
  svhId: string;
  accYear: string;
  companyId: string;
  branchId: string;
  reason: string;
};

/** A 422 from the stock filter: `errors[]` names each refused line as `lines.<index>`. */
export type StockErrorDetail = { field: string; message: string };

// ---------------------------------------------------------------------------
// Wire — the save
// ---------------------------------------------------------------------------

export type SaveStockAdjustmentHeader = {
  svhId?: string;
  accYear: string;
  companyId: string;
  branchId: string;
  deviceId: string;
  docDate: string;
  voucherType: SaveKind;
  fromGodownId: string;
  rateSource?: string;
  reasonId?: string;
  usrRefno?: string;
  remarks?: string;
  status: "DRAFT" | "POSTED";
  lineCount: number;
  totalQty: number;
  totalValue: number;
  totalValueWot: number;
};

export type SaveStockAdjustmentLine = {
  lineNo: number;
  itemId: string;
  uomId: string;
  baseUomId: string;
  toBaseFactor: number;
  qty: number;
  baseQty: number;
  godownId: string;
  bucket: string;
  toBucket?: string;
  reasonId?: string;
  remarks?: string;
  barcode?: string;
  lotId?: string;
  batchNo?: string;
  mfgDate?: string;
  expiryDate?: string;
  serialNo?: string;
  mrp?: number;
  salePrice?: number;
  supplierId?: string;
  costRate?: number;
};

export type SaveStockAdjustmentDto = {
  header: SaveStockAdjustmentHeader;
  lines: SaveStockAdjustmentLine[];
};

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------

/** One reason as the screen keeps it (the Qt `Reason`). */
export type Reason = {
  id: string;
  code: string;
  name: string;
  /** IN | OUT | BOTH */
  direction: string;
  glLedgerName: string;
  requireRemarks: boolean;
};

/**
 * The Dir chip. DERIVED from the reason, never typed: OUT takes, IN brings,
 * BOTH takes the sign typed into Qty ("BOTH" until one is), and a Move line is
 * "MOVE".
 */
export type LineDirection = "" | "IN" | "OUT" | "BOTH" | "MOVE";

/**
 * One line of the grid — the cells of ui_table 41 that hold data, plus the
 * hidden id columns (21–30). LineNo, BaseQty-for-the-wire, the row note and the
 * totals are worked out from these, never stored.
 */
export type AdjustmentLine = {
  /** Stable React / effect key — a line is addressed by this, not by its index. */
  key: string;
  /** svi_id — the server owns it; taken back after a save. */
  id: string | null;
  barcode: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  /** Lot batch no — outward: from the pick; inward: keyed. */
  batchNo: string;
  /** dd-MM-yyyy on screen (inward identity only). */
  mfgDate: string;
  /** dd-MM-yyyy on screen. */
  expiryDate: string;
  mrp: number | null;
  supplierId: string;
  supplierName: string;
  /** The holding's bucket; on a move, FROM. */
  bucket: string;
  /** Move stock only. */
  toBucket: string;
  /** What the holding has available, in the LINE's unit; null until pick-stock answers. */
  available: number | null;
  /** SIGNED in the cell (−3 out, +2 in) — the text as it stands, "" when blank. */
  qty: string;
  /** An iuc_id, never a unit_id. */
  uomId: string;
  uomName: string;
  /** Also an iuc_id. */
  baseUomId: string;
  toBaseFactor: number;
  /** Qty × factor, signed like Qty. Set by recalc (or by the load). */
  baseQty: number | null;
  /** Per LINE unit: the branch average out, keyed in (MANUAL). */
  costRate: number | null;
  /** Qty × CostRate, signed. Set by recalc (or by the load). */
  value: number | null;
  reasonId: string;
  reasonName: string;
  remarks: string;
  /** The picked holding; empty = the engine picks. */
  lotId: string;
  direction: LineDirection;
  /** stp_track_signature: "BE" / "BMEP" / "N". */
  trackSignature: string;
  salePrice: number | null;
  serialNo: string;
};

export type FormMode = "entry" | "browse";

export type DraftScope = {
  companyId: string;
  branchId: string;
  accYear: string;
  deviceId: string;
};

export type AdjustmentDraft = DraftScope & {
  kind: Kind;
  svhId: string;
  refno: string;
  /** DRAFT | POSTED | CANCELLED */
  status: string;
  mode: FormMode;
  /** ISO yyyy-MM-dd. */
  docDate: string;
  /** What the lines were keyed against. */
  godownId: string;
  godownName: string;
  rateSource: string;
  /** The header's default reason — "" is "— per line —", which sends no header reason. */
  defaultReasonId: string;
  /** A loaded header reason the kind's list does not (yet) carry. */
  extraReason: { id: string; name: string } | null;
  usrRefno: string;
  remarks: string;
  lines: AdjustmentLine[];
  /** The reasons of THIS kind, as filtered. */
  reasons: Reason[];
  reasonsLoaded: boolean;
  /** line key -> the server's message (save 422, or /validate). */
  serverProblems: Record<string, string>;
  /** payload line index -> the line key it was built from. */
  sentKeys: string[];
  /** The grey hint line under the grid (lblHint). */
  hint: string;
  dirty: boolean;
};

/** What a state transition asks the hook to do once it has been committed. */
export type DraftEffect =
  | { type: "availability"; key: string }
  | { type: "itemDetail"; key: string; itemId: string; unitId: string; keepUnit: boolean }
  | { type: "pick"; key: string }
  | { type: "focus"; key: string; column: number };

export type Transition = { draft: AdjustmentDraft; effects: DraftEffect[] };
