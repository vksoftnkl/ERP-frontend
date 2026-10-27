/**
 * Physical Stock Update — the wire shapes (`/stock/physical/*`, camelCase as
 * the server answers) and the screen's own draft.
 */

// ---------------------------------------------------------------------------
// Wire — what the server sends
// ---------------------------------------------------------------------------

/** Decimals arrive as numbers, but nothing stops a `numeric` reaching us as text. */
export type WireNumber = number | string | null | undefined;

/** GET /stock/physical/count-sheet — one holding: godown × lot × bucket. */
export type CountSheetRow = {
  lineNo: number;
  splitNo: number;
  itemId: string;
  itemCode: string | null;
  itemName: string;
  lotId: string;
  godownId: string;
  godownName: string | null;
  bucket: string;
  baseUomId: string;
  unitName: string | null;
  batchNo: string | null;
  mfgDate: string | null;
  expiryDate: string | null;
  mrp: WireNumber;
  salePrice: WireNumber;
  serialNo: string | null;
  supplierId: string | null;
  bookQty: WireNumber;
  avgCostRate: WireNumber;
  stockValue: WireNumber;
  countedQty: null;
  /**
   * The batch's size, colour and model off `stock_batch_detail` (server notes
   * 150 #9) — set only on a textile company's auto-numbered batches. They ride
   * after the item name in the Item cell (`batchDetailItemText`).
   */
  sizeName?: string | null;
  colourName?: string | null;
  model?: string | null;
};

/** One saved line, as `/get`, `/create`, `/post` and `/cancel` answer it. */
export type PhysicalStockWireLine = {
  sviId: string;
  lineNo: number;
  splitNo: number;
  itemId: string;
  itemCode: string | null;
  itemName: string;
  unitName: string | null;
  uomId?: string;
  baseUomId: string;
  godownId: string;
  godownName: string | null;
  bucket: string;
  batchNo: string | null;
  mfgDate: string | null;
  expiryDate: string | null;
  mrp: WireNumber;
  salePrice: WireNumber;
  serialNo: string | null;
  supplierId: string | null;
  supplierName: string | null;
  bookQty: WireNumber;
  countedQty: WireNumber;
  diffQty: WireNumber;
  reasonId: string | null;
  reasonName: string | null;
  lotId: string | null;
  remarks: string | null;
  /** The batch's size, colour and model, as on the count sheet's rows. */
  sizeName?: string | null;
  colourName?: string | null;
  model?: string | null;
  /**
   * SAVE answer only (server notes 150 #4): this save replaced the line's stored
   * book figure with a different one — stock moved since the sheet was drawn —
   * and what it held before. Absent on `/get`.
   */
  bookChanged?: boolean;
  previousBookQty?: WireNumber;
};

export type PhysicalStockWireHeader = {
  svhId: string;
  accYear: string;
  companyId: string;
  branchId: string;
  deviceId: string;
  refno: string;
  usrRefno: string | null;
  docDate: string;
  godownId: string | null;
  godownName: string | null;
  reasonId: string | null;
  reasonName: string | null;
  freezeStock: boolean;
  freezeFrom: string | null;
  freezeTo: string | null;
  status: string;
  lineCount: WireNumber;
  totalQty: WireNumber;
  totalValue: WireNumber;
  rateSource: string | null;
  remarks: string | null;
  /** Who did what, and when — the audit lines under the title (Qt `showAudit`). */
  createdOn?: string | null;
  /** `svh_created_by` as stored — free text, usually a user id. */
  createdBy?: string | null;
  /** The createdBy user's name; null when createdBy names no user. */
  createdByName?: string | null;
  postedOn?: string | null;
  postedByName?: string | null;
  cancelledOn?: string | null;
};

export type PhysicalStockDocument = {
  header: PhysicalStockWireHeader;
  lines: PhysicalStockWireLine[];
};

/**
 * `/stock/physical/create`'s answer. `rowsPosted` is null for a draft; on a
 * save that posted (header.status POSTED) it is one ledger row per VARYING
 * line — 0 is a success, every line agreed.
 */
export type PhysicalStockSaveResult = PhysicalStockDocument & {
  rowsPosted?: number | null;
};

export type PhysicalStockCancelResult = PhysicalStockDocument & {
  rowsReversed: number;
  status: string;
};

/** GET /stock/physical/validate — every line, `problem` null on the clean ones. */
export type PhysicalStockLineProblem = {
  sviId: string;
  lineNo: number;
  splitNo: number;
  itemId: string;
  itemCode: string | null;
  itemName: string;
  problem: string | null;
};

/** GET /master-lookups/item-by-barcode */
export type BarcodeLookup = {
  itemId: string;
  itemName: string;
};

// ---------------------------------------------------------------------------
// Wire — what the screen sends
// ---------------------------------------------------------------------------

export type PhysicalStockScope = {
  companyId: string;
  branchId: string;
  accYear: string;
};

/** The routes that address one document: get, validate, post, cancel. */
export type PhysicalStockDocKey = PhysicalStockScope & { svhId: string };

/** A count line is four required fields and one typed number. */
export type SavePhysicalStockLine = {
  /**
   * A SAVED line's id: the server updates that row rather than inserting a new
   * one — and can then say its book figure moved since (notes 150 #4). Never
   * sent on a new sheet, which has no lines yet.
   */
  sviId?: string;
  lineNo: number;
  splitNo: number;
  itemId: string;
  godownId: string;
  lotId: string;
  bucket: string;
  countedQty: number;
  reasonId?: string;
  remarks?: string;
};

export type SavePhysicalStockHeader = {
  svhId?: string;
  accYear: string;
  companyId: string;
  branchId: string;
  deviceId: string;
  docDate: string;
  toGodownId: string;
  rateSource: string;
  reasonId?: string;
  freezeStock: boolean;
  freezeFrom?: string;
  freezeTo?: string;
  lineCount: number;
  totalQty: number;
  totalValue: number;
  totalValueWot: number;
  usrRefno?: string;
  remarks?: string;
  /**
   * Omitted saves a DRAFT. "POSTED" saves AND posts in one transaction (notes
   * 106) — a refused line fails the save too and leaves no document behind.
   */
  status?: "DRAFT" | "POSTED";
};

export type SavePhysicalStockPayload = {
  header: SavePhysicalStockHeader;
  lines: SavePhysicalStockLine[];
};

export type CountSheetQuery = PhysicalStockScope & {
  godownId: string;
  bucket?: string;
  itemGroupId?: string;
  /** Notes 157 — sent only when chosen. */
  itemBrandId?: string;
  itemCategoryId?: string;
  itemSectionId?: string;
  /** Notes 157 — only holdings with a book quantity below zero. */
  negativeOnly?: boolean;
  includeZero?: boolean;
  limit?: number;
  offset?: number;
};

// ---------------------------------------------------------------------------
// The draft
// ---------------------------------------------------------------------------

/**
 * One grid row. A row with no `lotId` is the BLANK row at the bottom — the one
 * the item picker and the scanner land in. Every other row is a holding.
 *
 * `countedText` is kept as typed, never as a number: an empty string means
 * "nobody has walked this line", and `"0"` means "walked, found nothing". The
 * whole screen turns on that distinction.
 */
export type CountLine = {
  key: string;
  sviId: string;
  lineNo: number | null;
  splitNo: number | null;
  itemId: string;
  itemCode: string;
  itemName: string;
  unitName: string;
  baseUomId: string;
  lotId: string;
  godownId: string;
  godownName: string;
  bucket: string;
  batchNo: string;
  /** ISO `yyyy-mm-dd`, or "". */
  mfgDate: string;
  expiryDate: string;
  mrp: number | null;
  salePrice: number | null;
  serialNo: string;
  supplierId: string;
  supplierName: string;
  bookQty: number | null;
  countedText: string;
  /** counted − book, SIGNED. null while uncounted. */
  diffQty: number | null;
  avgCostRate: number | null;
  /** diff × avg cost — an ESTIMATE. null while uncounted. */
  diffValue: number | null;
  stockValue: number | null;
  reasonId: string;
  reasonName: string;
  remarks: string;
  /** What the scanner read; only a blank row takes one. */
  barcode: string;
  /** A textile batch's size, colour and model — painted after the item name. */
  sizeName: string;
  colourName: string;
  model: string;
};

export type PhysicalStockMode = "entry" | "browse";

/**
 * Who created, posted and cancelled the sheet, and when — read off the header
 * of a loaded document (Qt `showAudit`). `createdBy` is already the name when
 * the server could resolve one.
 */
export type PhysicalStockAuditStamps = {
  createdOn: string;
  createdBy: string;
  postedOn: string;
  postedBy: string;
  cancelledOn: string;
};

export type PhysicalStockDraft = {
  companyId: string;
  branchId: string;
  accYear: string;
  deviceId: string;
  svhId: string;
  refno: string;
  status: string;
  /** Qt's FormMode: Entry may key, Browse only reads. */
  mode: PhysicalStockMode;
  dirty: boolean;
  /** ISO `yyyy-mm-dd`. */
  docDate: string;
  godownId: string;
  godownName: string;
  reasonId: string;
  reasonName: string;
  rateSource: string;
  usrRefno: string;
  remarks: string;
  freezeStock: boolean;
  /** Local wall-clock `yyyy-mm-ddTHH:mm`. */
  freezeFrom: string;
  freezeTo: string;
  /** Survives New and the next sheet — it is the counter's choice, not the document's. */
  blind: boolean;
  lines: CountLine[];
  /** The loaded document's audit stamps; null on a sheet never saved. */
  stamps: PhysicalStockAuditStamps | null;
  /**
   * The latest notice — "12 holdings added …" — shown under the audit lines
   * beside the title (Qt `setNotice()`, the second half of lblAudit).
   */
  notice: string;
  /** The title bar's "godown · year" (Qt's lblScope). */
  scope: string;
  /** Hands out row keys. */
  seq: number;
};

/** The totals bar, as computed — never re-parsed from what it displays. */
export type CountTotals = {
  lines: number;
  counted: number;
  varianceLines: number;
  netQty: number;
  netValue: number;
};

/** Where the session is working — the document's own scope once one is loaded. */
export type SessionScope = {
  companyId: string;
  branchId: string;
  accYear: string;
  deviceId: string;
};
