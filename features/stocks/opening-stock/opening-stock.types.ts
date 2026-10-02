/**
 * Opening Stock — wire shapes (the `stock/opening` contract) and the screen's
 * own draft.
 *
 * The wire types follow `opening-stock-voucher/dto/*.ts` on the server exactly:
 * `SaveOpeningStockVoucherDto` is STANDALONE and runs under
 * `forbidNonWhitelisted`, so a property not declared there is a 400 — nothing
 * may be sent that is not on these types.
 */
import type { RateSource, StockBucket, VoucherStatus } from "./opening-stock.constants";

// ---------------------------------------------------------------------------
// Save — POST /stock/opening/create
// ---------------------------------------------------------------------------

export type SaveOpeningStockHeaderDto = {
  /** Present = update the existing DRAFT; absent = create. The server branches on this alone. */
  svhId?: string;
  accYear: string;
  companyId: string;
  branchId: string;
  /** `fixed.device_master.dev_id` — a real FK, and what mints the number. */
  deviceId: string;
  /** yyyy-MM-dd */
  docDate: string;
  toGodownId: string;
  rateSource?: RateSource;
  usrRefno?: string;
  remarks?: string;
  /** The totals as THE SCREEN counted them — nothing server-side recomputes a draft's. */
  lineCount?: number;
  totalQty?: number;
  totalValue?: number;
  totalValueWot?: number;
  /** Omitted = DRAFT. 'POSTED' saves and posts in ONE transaction. */
  status?: "DRAFT" | "POSTED";
};

export type SaveOpeningStockLineDto = {
  lineNo: number;
  splitNo?: number;
  itemId: string;
  /** item_unit_conversion.iuc_id — never a unit_id. */
  uomId: string;
  baseUomId: string;
  toBaseFactor: number;
  godownId: string;
  bucket?: StockBucket;
  qty?: number;
  baseQty: number;
  freeQty?: number;
  freeBaseQty?: number;
  weightQty?: number;
  costRate?: number;
  costRateWot?: number;
  landedRate?: number;
  taxPerc?: number;
  batchNo?: string;
  mfgDate?: string;
  expiryDate?: string;
  serialNo?: string;
  mrp?: number;
  salePrice?: number;
  supplierId?: string;
  barcode?: string;
  remarks?: string;
};

export type SaveOpeningStockDto = {
  header: SaveOpeningStockHeaderDto;
  lines: SaveOpeningStockLineDto[];
};

// ---------------------------------------------------------------------------
// The stored document — GET /stock/opening/get, and every write's answer
// ---------------------------------------------------------------------------

/** Postgres numerics can arrive as strings; everything numeric is read through `toNumber`. */
export type WireNumber = number | string | null;

export type OpeningStockHeaderPayload = {
  svhId: string;
  accYear: string;
  companyId: string;
  branchId: string;
  deviceId: string;
  refno: string | null;
  usrRefno: string | null;
  docDate: string | null;
  godownId: string | null;
  godownName: string | null;
  status: string | null;
  lineCount: WireNumber;
  totalQty: WireNumber;
  totalValue: WireNumber;
  totalValueWot: WireNumber;
  rateSource: string | null;
  remarks: string | null;
  postedOn?: string | null;
  postedByName?: string | null;
  cancelledOn?: string | null;
  cancelReason?: string | null;
};

export type OpeningStockLinePayload = {
  sviId: string;
  lineNo: WireNumber;
  splitNo: WireNumber;
  itemId: string;
  itemCode: string | null;
  itemName: string | null;
  unitName: string | null;
  uomId: string;
  baseUomId: string;
  toBaseFactor: WireNumber;
  godownId: string | null;
  godownName: string | null;
  bucket: string | null;
  barcode: string | null;
  batchNo: string | null;
  mfgDate: string | null;
  expiryDate: string | null;
  mrp: WireNumber;
  salePrice: WireNumber;
  serialNo: string | null;
  supplierId: string | null;
  supplierName: string | null;
  qty: WireNumber;
  baseQty: WireNumber;
  freeQty: WireNumber;
  freeBaseQty: WireNumber;
  weightQty: WireNumber;
  costRate: WireNumber;
  costRateWot: WireNumber;
  landedRate: WireNumber;
  taxPerc: WireNumber;
  value: WireNumber;
  valueWot: WireNumber;
  lotId: string | null;
  remarks: string | null;
  /** The effective policy on the DOCUMENT's date — the same answer item-lookup gives. */
  trackSignature: string | null;
};

export type OpeningStockDocumentPayload = {
  header: OpeningStockHeaderPayload;
  lines: OpeningStockLinePayload[];
};

/** /create's answer: the document, plus the ledger rows a save-and-post wrote (null on a draft). */
export type OpeningStockSaveResult = OpeningStockDocumentPayload & {
  rowsPosted: number | null;
};

export type OpeningStockCancelResult = OpeningStockDocumentPayload & {
  rowsReversed: number;
  status: string;
  cancelledOn: string | null;
};

/** The scope every read and the cancel are addressed by — the DOCUMENT's own. */
export type OpeningStockScope = {
  companyId: string;
  branchId: string;
  accYear: string;
};

export type OpeningStockDocKey = OpeningStockScope & {
  svhId: string;
  /** The list row's refno and status — what the list's own cancel prompt names. */
  refno?: string;
  status?: string;
};

export type CancelOpeningStockDto = OpeningStockScope & {
  svhId: string;
  reason: string;
};

// ---------------------------------------------------------------------------
// GET /stock/opening/item-lookup
// ---------------------------------------------------------------------------

export type OpeningStockItemLookupQuery = {
  companyId: string;
  branchId: string;
  itemId: string;
  /** An iuc_id; omitted for the item's default unit. */
  uomId?: string;
  /** The DOCUMENT's date — the tracking policy is resolved as at this day. */
  onDate: string;
};

export type OpeningStockItemLookup = {
  itemId: string;
  itemCode: string | null;
  itemName: string;
  barcode: string | null;
  uomId: string;
  unitName: string | null;
  toBaseFactor: WireNumber;
  baseUomId: string;
  taxPerc: WireNumber;
  cessPerc?: WireNumber;
  cessUnit?: WireNumber;
  trackSignature: string | null;
  mrp: WireNumber;
  salePrice: WireNumber;
  /** A warning, not a refusal — the preflight's per-holding rule is the real check. */
  alreadyOpened: boolean;
};

/** GET /master-lookups/item-by-barcode — `unitId` is an iuc_id. */
export type BarcodeItem = {
  itemId: string;
  unitId: string;
  itemName: string;
};

/** `/configured-grid-sql/run` — one page of rows. */
export type ConfiguredGridPage<TRow> = {
  items: TRow[];
  meta: { page: number; limit: number; total: number };
};

/** One row of a configured popup grid, keyed by its SELECT's own column names. */
export type GridRow = Record<string, unknown>;

/** A failed write's body: `{ success:false, message, errors:[{ field, message }] }`. */
export type ApiFieldError = { field?: string; message?: string };

// ---------------------------------------------------------------------------
// The draft — what the screen holds between the round trips
// ---------------------------------------------------------------------------

/**
 * One grid row — `OpeningStockCols`, as fields. Numbers are 0 where the Qt cell
 * is blank: `cellNumber()` reads a blank cell as 0, and every rule of the screen
 * ("derive the without-tax rate only when it is 0") is written against that.
 */
export type OpeningStockLine = {
  /** React's key for the row; never sent. */
  key: string;
  /** svi_id (col 0) — the stored line's id; empty on a line never saved. */
  sviId: string;
  /** The stored line number, as loaded. Display only; the save numbers lines itself. */
  lineNo: number;
  splitNo: number;
  barcode: string;
  itemCode: string;
  itemName: string;
  unitName: string;
  qty: number;
  freeQty: number;
  batchNo: string;
  /** dd-mm-yyyy as keyed (the cell's text) — converted to ISO only on the way out. */
  mfgDate: string;
  expiryDate: string;
  mrp: number;
  salePrice: number;
  serialNo: string;
  bucket: string;
  /** What the operator TYPES: the cost of one of the unit on the line. Never sent. */
  costPerUnit: number;
  taxPerc: number;
  costRateWot: number;
  landedRate: number;
  weightQty: number;
  value: number;
  valueWot: number;
  remarks: string;
  itemId: string;
  uomId: string;
  baseUomId: string;
  toBaseFactor: number;
  baseQty: number;
  freeBaseQty: number;
  godownId: string;
  godownName: string;
  lotId: string;
  supplierId: string;
  supplierName: string;
  /** item_decimal_count — the quantity editors' precision; 0 = the default 3. */
  decimalCount: number;
  /** stp_track_signature — "BE", "BMEP", "N"; empty only on a row with no item. */
  trackSignature: string;
  /** svi_cost_rate — PER BASE UNIT, derived from costPerUnit; the wire value. */
  costRate: number;
  /** What the server's pre-post check said about this line, when Save & Post was refused. */
  problem: string;
};

/** The text fields of a line the grid can write. */
export type OpeningStockLineTextField =
  | "barcode"
  | "batchNo"
  | "mfgDate"
  | "expiryDate"
  | "serialNo"
  | "bucket"
  | "remarks";

/** The numeric fields of a line the grid can write. */
export type OpeningStockLineNumberField =
  | "splitNo"
  | "qty"
  | "freeQty"
  | "mrp"
  | "salePrice"
  | "costPerUnit"
  | "taxPerc"
  | "costRateWot"
  | "landedRate"
  | "weightQty";

export type OpeningStockLineField = OpeningStockLineTextField | OpeningStockLineNumberField;

export type OpeningStockHeader = {
  /** yyyy-MM-dd; empty when the field was cleared. */
  docDate: string;
  godownId: string;
  godownName: string;
  rateSource: RateSource;
  usrRefno: string;
  remarks: string;
};

export type OpeningStockDraft = {
  /** This document's own scope — the session's for a new one, the header's for a loaded one. */
  companyId: string;
  branchId: string;
  accYear: string;
  deviceId: string;
  svhId: string;
  refno: string;
  status: VoucherStatus;
  header: OpeningStockHeader;
  /** Always ends in one blank row — the row the next item is picked into. */
  lines: OpeningStockLine[];
  /** FormMode: Entry (keyable) or Browse (read-only). */
  mode: "entry" | "browse";
  dirty: boolean;
  /** lblAudit — "X already has an opening in this branch". */
  audit: string;
};

export type OpeningStockTotals = {
  /** Counted by SPLIT NO — a split of 1 starts a line, so three splits are one line. */
  lines: number;
  /** BASE units, free goods included — the quantity the ledger will carry. */
  qty: number;
  value: number;
  valueWot: number;
};

/** A client-side refusal: Qt's warning, and where it put the cursor. */
export type OpeningStockViolation = {
  title: string;
  message: string;
  focus:
    | { kind: "godown" }
    | { kind: "date" }
    | { kind: "cell"; rowKey: string; field: OpeningStockFocusField }
    | null;
};

/** Every cell a refusal can point at — the writable fields plus the item picker. */
export type OpeningStockFocusField = OpeningStockLineField | "itemName";
