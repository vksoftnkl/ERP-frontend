/**
 * Godown Transfer / Branch Outward — the wire (the server's DTOs and payloads,
 * spelled as it spells them) and the screen's own draft.
 */
import type { PickStockRow } from "@/features/stocks/stock-adjustment/stock-adjustment.types";
import type { TransferMode } from "./stock-transfer.constants";

// ---------------------------------------------------------------------------
// Wire — reads
// ---------------------------------------------------------------------------

/** A pick-stock row as the transfer reads it: notes 160 A's free stock and notes 153's unit rates. */
export type TransferPickRow = PickStockRow & {
  /** Base unit; `sbl_free_in_qty − sbl_free_out_qty`, never below 0. Absent = none. */
  freeAvailableQty?: number | null;
  /** `unit_loading` / `unit_unloading` per unit of the holding's unit. */
  loadRate?: number | null;
  unloadRate?: number | null;
};

/** The shared StockVoucherHeaderPayload — the fields this screen reads, plus notes 153's crew. */
export type TransferHeaderPayload = {
  svhId: string;
  accYear: string;
  companyId: string;
  branchId: string;
  deviceId: string;
  voucherType: string;
  slno: string;
  refno: string;
  docDate: string;
  /** FROM is `fromGodownId`; the TO side comes back as `godownId`. */
  fromGodownId: string | null;
  fromGodownName: string | null;
  godownId: string | null;
  godownName: string | null;
  toBranchId: string | null;
  toBranchName: string | null;
  status: string;
  lineCount: number;
  totalQty: number;
  totalValue: number;
  postedOn: string | null;
  postedBy?: string | null;
  postedByName?: string | null;
  cancelledOn: string | null;
  cancelReason: string | null;
  createdOn?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  reasonId: string | null;
  reasonName: string | null;
  remarks: string | null;
  // notes 153
  loadEnabled?: boolean;
  loadDatetime?: string | null;
  loadmanIds?: string[];
  loadmanNames?: string[];
  driverId?: string | null;
  driverName?: string | null;
  supervisorId?: string | null;
  supervisorName?: string | null;
  vehicleId?: string | null;
  vehicleNo?: string | null;
  loadingCharge?: number | null;
  unloadEnabled?: boolean;
  unloadDatetime?: string | null;
  unloadmanIds?: string[];
  unloadmanNames?: string[];
  unloadSupervisorId?: string | null;
  unloadSupervisorName?: string | null;
  unloadingCharge?: number | null;
};

export type TransferLinePayload = {
  sviId: string;
  lineNo: number;
  itemId: string;
  itemCode: string | null;
  itemName: string;
  unitName: string | null;
  uomId: string;
  baseUomId: string;
  toBaseFactor: number;
  godownId: string;
  bucket: string;
  barcode: string | null;
  batchNo: string | null;
  expiryDate: string | null;
  mrp: number | null;
  qty: number;
  freeQty?: number | null;
  costRate: number;
  value: number;
  lotId: string | null;
  loadRate?: number | null;
  unloadRate?: number | null;
  sizeName?: string | null;
  colourName?: string | null;
  model?: string | null;
};

/** One `stock_transit` row — Branch Outward's panel. */
export type TransitRow = {
  sttId: string;
  status: string;
  itemName: string;
  batchNo: string | null;
  toGodownName: string | null;
  sentQty: number;
  receivedQty: number;
  damageQty: number;
  remainingQty: number;
  costRate: number;
  lrNo: string | null;
  vehicleNo: string | null;
  expectedOn: string | null;
};

/** `GET /stock/transfer?svhId=` — the document with its transit rows. */
export type TransferPayload = {
  header: TransferHeaderPayload;
  lines: TransferLinePayload[];
  transit?: TransitRow[];
};

/** `POST /stock/transfer` — a DRAFT. */
export type TransferSaveResult = {
  header: TransferHeaderPayload;
  lines: TransferLinePayload[];
};

/** `POST /stock/transfer/despatch`. */
export type TransferDespatchResult = {
  sameBranch: boolean;
  status: string;
  ledgerRows: number;
  transitRows: number;
};

/** The four fields a stored document is addressed by, as the routes spell them. */
export type TransferDocKey = {
  svhId: string;
  companyId: string;
  branchId: string;
  accYear: string;
  refno?: string;
  status?: string;
};

export type CancelTransferArgs = TransferDocKey & { reason: string };

export type SettleShortArgs = {
  outVoucherId: string;
  accYear: string;
  companyId: string;
  branchId: string;
  reasonId: string;
  remarks: string;
};

export type DespatchArgs = TransferDocKey & {
  lrNo?: string;
  vehicleNo?: string;
  expectedOn?: string;
};

/** `GET /stock/reasons` — the fields the picker reads. */
export type TransferReasonRow = {
  srmId: string;
  code: string;
  name: string;
  direction: string;
  isActive?: boolean;
  allowedTxnTypes?: string[];
};

// ---------------------------------------------------------------------------
// Wire — the save
// ---------------------------------------------------------------------------

export type SaveTransferHeader = {
  svhId?: string;
  accYear: string;
  companyId: string;
  branchId: string;
  deviceId: string;
  docDate: string;
  fromGodownId: string;
  toGodownId: string;
  toBranchId?: string;
  reasonId?: string;
  remarks?: string;
  loadEnabled: boolean;
  unloadEnabled: boolean;
  loadDatetime?: string;
  loadmanIds?: string[];
  driverId?: string | null;
  supervisorId?: string | null;
  vehicleNo?: string | null;
  unloadDatetime?: string;
  unloadmanIds?: string[];
  unloadSupervisorId?: string | null;
};

export type SaveTransferLine = {
  lineNo: number;
  itemId: string;
  uomId: string;
  baseUomId: string;
  toBaseFactor: number;
  /** The SOURCE godown; the destination is the header's. */
  godownId: string;
  lotId: string;
  bucket: string;
  qty: number;
  baseQty: number;
  freeQty?: number;
  freeBaseQty?: number;
  barcode?: string;
  loadRate: number;
  unloadRate: number;
};

export type SaveTransferDto = {
  header: SaveTransferHeader;
  lines: SaveTransferLine[];
};

/** A 422 from the stock filter: `errors[]` names each refused field. */
export type StockErrorDetail = { field: string; message: string; code?: string };

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------

/** A picked master row: the id it stores and the text it shows. */
export type Pick = { id: string; text: string };

export type TransferLine = {
  /** Stable React / effect key — a line is addressed by this, not by its index. */
  key: string;
  /** svi_id — the server owns it; taken back after a save. */
  id: string | null;
  barcode: string;
  itemId: string;
  itemCode: string;
  /** Name plus a textile batch's size · colour · model. */
  itemName: string;
  lotId: string;
  bucket: string;
  batchNo: string;
  /** dd/MM/yyyy on screen. */
  expiryDate: string;
  mrp: number | null;
  /** An iuc_id, never a unit_id. */
  uomId: string;
  uomName: string;
  baseUomId: string;
  toBaseFactor: number;
  /** The holding's available qty in the LINE's unit; null until pick-stock answers. */
  available: number | null;
  /** The holding's free stock, BASE unit (notes 160 A); null until pick-stock answers. */
  freeAvailableBase: number | null;
  qty: string;
  freeQty: string;
  /** The branch average per line unit — shown, never sent. */
  costRate: number | null;
  loadRate: string;
  unloadRate: string;
};

/** The Loading / Unloading boxes (notes 153). The charge is the server's: never sent. */
export type Handling = {
  loadEnabled: boolean;
  /** `datetime-local` text (yyyy-MM-ddTHH:mm). */
  loadAt: string;
  loadmen: Pick[];
  driver: Pick | null;
  supervisor: Pick | null;
  /** godown mode: the Loading box's vehicle; branch mode keeps the header's here too. */
  vehicleNo: string;
  unloadEnabled: boolean;
  unloadAt: string;
  unloadmen: Pick[];
  unloadSupervisor: Pick | null;
};

export type FormMode = "entry" | "browse";

export type AuditStamps = {
  createdOn: string;
  createdBy: string;
  postedOn: string;
  postedBy: string;
  cancelledOn: string;
  cancelReason: string;
};

export type DraftScope = {
  companyId: string;
  branchId: string;
  accYear: string;
  deviceId: string;
};

export type TransferDraft = DraftScope & {
  mode: TransferMode;
  svhId: string;
  refno: string;
  /** DRAFT | POSTED | CANCELLED | IN_TRANSIT | RECEIVED */
  status: string;
  viewMode: FormMode;
  /** ISO yyyy-MM-dd. */
  docDate: string;
  fromGodownId: string;
  fromGodownName: string;
  toGodownId: string;
  toGodownName: string;
  /** Branch Outward. */
  toBranchId: string;
  toBranchName: string;
  /** Branch Outward: ISO yyyy-MM-dd. */
  expectedOn: string;
  lrNo: string;
  reasonId: string;
  /** A loaded header reason the list does not (yet) carry. */
  extraReason: { id: string; name: string } | null;
  remarks: string;
  handling: Handling;
  lines: TransferLine[];
  transit: TransitRow[];
  /** line key -> the server's message (save 422). */
  serverProblems: Record<string, string>;
  /** header field -> the server's message (save 422). */
  headerProblems: Record<string, string>;
  /** payload line index -> the line key it was built from. */
  sentKeys: string[];
  hint: string;
  stamps: AuditStamps | null;
  notice: string;
  dirty: boolean;
};
