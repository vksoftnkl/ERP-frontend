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
};

export type PhysicalStockDocument = {
  header: PhysicalStockWireHeader;
  lines: PhysicalStockWireLine[];
};

export type PhysicalStockPostResult = PhysicalStockDocument & {
  rowsPosted: number;
  status: string;
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
};

export type SavePhysicalStockPayload = {
  header: SavePhysicalStockHeader;
  lines: SavePhysicalStockLine[];
};

export type CountSheetQuery = PhysicalStockScope & {
  godownId: string;
  bucket?: string;
  itemGroupId?: string;
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
};

export type PhysicalStockMode = "entry" | "browse";

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
  /** The status line under the grid (Qt's lblAudit). */
  audit: string;
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
