/**
 * Shortage Receipt — the wire shapes of `PurchaseShortageController` (ERP server
 * src/modules/purchase/shortage/purchase-shortage.ts) and the screen's own draft.
 * Decimals arrive as strings (pg NUMERIC through `jsonSafe`); read them with `num()`.
 */
import type { DropdownSelection } from "@/components/design-system/dropdown/types";
import type { PurchaseAllocEntry } from "../shared/purchase-dialogs.types";

type WireDecimal = string | number | null;

/** The shortage's last standing close (`lastAction` on /open). */
export type ShortageLastAction = {
  closeId: string;
  accYear: string;
  kind: string;
  qty: WireDecimal;
  amount: WireDecimal;
  cnNo: string | null;
  partyId: string | null;
  partyName: string | null;
  reason: string | null;
  on: string | null;
};

/** GET /purchase/shortages/open — one shortage (in BASE units); `all=true` also the closed ones. */
export type OpenShortageRow = {
  shortageId: string;
  accYear: string;
  supplierId: string;
  supplierName: string | null;
  itemId: string;
  itemName?: string | null;
  unitName?: string | null;
  uomId: string;
  /** SHORT_BILL · SHORT_CHALLAN · REPLACE. */
  reason: string;
  /** The server's words for `reason` ("Short on bill"). */
  reasonText?: string | null;
  srcRefno: string | null;
  /** PURCHASE_BILL · GRN · PURCHASE_RETURN. */
  srcDocType?: string | null;
  srcDocId?: string | null;
  srcDocDate?: string | null;
  /** The source document's line no; null when unknown. */
  srcLineNo?: number | null;
  ageDays?: number | null;
  qtyBase: WireDecimal;
  received: WireDecimal;
  closed: WireDecimal;
  closedByCn?: WireDecimal;
  closedByClaim?: WireDecimal;
  writtenOffQty?: WireDecimal;
  openQty: WireDecimal;
  value: WireDecimal;
  gst: WireDecimal;
  openValue: WireDecimal;
  openGst: WireDecimal;
  costRate: WireDecimal;
  /** true: the GST sits in Input GST pending and is released when the goods come. */
  gstPending?: boolean;
  batchNo: string | null;
  expiryDate: string | null;
  mrp: WireDecimal;
  /** OPEN · PART · CLOSED. */
  status?: string | null;
  lastAction?: ShortageLastAction | null;
};

/** One stock row of a saved line (`pur_item_alloc`). */
export type ShortageReceiptAllocRow = {
  rowNo: number;
  godownId: string | null;
  batchNo: string | null;
  mfgDate: string | null;
  expiryDate: string | null;
  mrp: WireDecimal;
  serialNo: string | null;
  warrantyTo: string | null;
  qty: WireDecimal;
  lotId?: string | null;
};

/** GET /purchase/shortages/receipt/get — the `pur_shortage_receipt` row as Prisma names it. */
export type ShortageReceiptHeader = {
  psrId: string;
  psrCompanyId: string;
  psrBranchId: string;
  psrAccYear: string;
  psrRefno: string;
  psrDocDate: string;
  psrStatus: string;
  psrSupplierId: string;
  psrGodownId: string;
  /** ISO instant (UTC). */
  psrReceivedAt?: string | null;
  psrChallanNo: string | null;
  psrReceivedBy: string[] | null;
  psrSupervisorId?: string | null;
  psrValue: WireDecimal;
  psrRemarks: string | null;
  psrCreatedOn?: string | null;
  supplierName: string | null;
  godownName?: string | null;
  /** The loadmen with their names. */
  receivedBy?: { id: string; name: string }[] | null;
  supervisorName?: string | null;
};

export type ShortageReceiptLineRow = {
  psriId: string;
  psriLineNo: number;
  psriShortageId: string;
  psriShortageAccYear: string;
  psriItemId?: string | null;
  psriUomId?: string | null;
  psriQty: WireDecimal;
  psriCostRate: WireDecimal;
  psriValue: WireDecimal;
  psriGstReleased?: WireDecimal;
  itemName?: string | null;
  unitName?: string | null;
  reason: string | null;
  srcRefno: string | null;
  /** What is still open, this draft's own qty NOT counted; null once the shortage is gone. */
  openQty: WireDecimal;
  shortQty?: WireDecimal;
  batchNo: string | null;
  expiryDate: string | null;
  mrp: WireDecimal;
  allocs?: ShortageReceiptAllocRow[] | null;
};

export type ShortageReceiptPayload = {
  header: ShortageReceiptHeader;
  lines: ShortageReceiptLineRow[];
};

/** One F12 row on the wire (`PurchaseAllocDto`; bucket is always SALEABLE here). */
export type ShortageAllocDto = {
  bucket: "SALEABLE";
  qty: number;
  godownId?: string;
  batchNo?: string;
  mfgDate?: string;
  expiryDate?: string;
  mrp?: number;
  serialNo?: string;
  warrantyTo?: string;
};

export type ShortageReceiptLineDto = {
  lineNo: number;
  shortageId: string;
  shortageAccYear: string;
  qty: number;
  batchNo?: string;
  expiryDate?: string;
  mrp?: number;
  allocs?: ShortageAllocDto[];
};

export type SaveShortageReceiptDto = {
  header: {
    psrId?: string;
    companyId: string;
    branchId: string;
    accYear: string;
    deviceId: string;
    supplierId: string;
    godownId: string;
    docDate: string;
    /** ISO instant; sent when typed or on the first save (the server keeps the first one). */
    receivedAt?: string;
    challanNo?: string;
    receivedBy: string[];
    /** Omitted = keep the saved one; null = clear it. */
    supervisorId?: string | null;
    remarks?: string;
    post: boolean;
  };
  lines: ShortageReceiptLineDto[];
};

/** POST /purchase/shortages/close — the dialog's keys plus the row's. */
export type CloseShortageDto = {
  shortageId: string;
  accYear: string;
  deviceId: string;
  kind: string;
  partyId?: string;
  claimAgainst?: string;
  qty?: number | string;
  cnNo?: string;
  cnDate?: string;
  reason?: string;
};

export type CloseShortageResult = {
  closeId: string;
  accYear: string;
  qty: WireDecimal;
  amount: WireDecimal;
  openQty: WireDecimal;
  voucherRefno: string | null;
};

/** GET /stock/opening/item-lookup — only the tracking signature is read here. */
export type ShortageItemLookup = { trackSignature?: string | null };

// ---------------------------------------------------------------------------
// The screen's draft
// ---------------------------------------------------------------------------

/** One row of the grid: one shortage of the supplier (a new receipt), or one saved line. */
export type ShortageLine = {
  /** Stable React / DOM key — the shortage id, unique on a receipt. */
  key: string;
  shortageId: string;
  shortageYear: string;
  /** `psriId` on a saved line. */
  lineId: string;
  /** The full source refno (tooltip, hints). */
  refno: string;
  /** "PUR/…/00012 · line 2". */
  from: string;
  /** "<refno> (purchase bill)". */
  fromTip: string;
  /** dd/MM/yyyy of the source document. */
  srcDate: string;
  ageDays: number | null;
  itemId: string;
  uomId: string;
  itemName: string;
  unitName: string;
  /** The reason CODE (SHORT_BILL · SHORT_CHALLAN · REPLACE). */
  reason: string;
  /** The reason in words. */
  why: string;
  /** OPEN · PART · CLOSED ("" unknown). */
  status: string;
  /** The shortage's own qty (base). */
  shortQty: number | null;
  receivedSoFar: number | null;
  closedSoFar: number | null;
  /** "CN 1 · claim 0 · written off 0". */
  closedTip: string;
  /** What is still open (base); null when the server no longer knows it. */
  openQty: number | null;
  /** Ticked = received on this receipt. */
  ticked: boolean;
  /** Receive now, as typed. */
  receive: string;
  /** The row's one batch (no split). */
  batch: string;
  /** Typed dd/MM/yyyy (no split). */
  expiry: string;
  /** The source line's MRP (sent with a one-batch line). */
  mrp: number;
  /** F12 rows when the line is split; null = Batch / Expiry on the row. */
  allocs: PurchaseAllocEntry[] | null;
  /** The item's tracking signature (R = serials); "" unknown. */
  signature: string;
  /** Per base unit, at the original bill cost. */
  cost: number;
  /** Open value at the original cost (tooltip). */
  openValue: number;
  /** The open GST parked as pending (released when the goods come); null = not parked. */
  gstHeld: number | null;
  /** GST released per base unit received (0 when not parked). */
  gstPerUnit: number;
  /** A saved line: the GST the server released. */
  gstReleased: number | null;
};

export type DocStatus = "DRAFT" | "POSTED" | "CANCELLED";

export type ShortageDraft = {
  companyId: string;
  branchId: string;
  accYear: string;
  deviceId: string;
  psrId: string;
  refno: string;
  status: DocStatus;
  /** "browse" = read-only until Edit (F2). */
  mode: "browse" | "entry";
  supplierId: string;
  supplierName: string;
  godownId: string;
  godownName: string;
  /** Local `yyyy-MM-ddTHH:mm`: when the goods came. Its date is the doc date. */
  receivedAt: string;
  /** receivedAt is sent only when typed (or on the first save). */
  receivedTyped: boolean;
  challanNo: string;
  remarks: string;
  supervisorId: string;
  supervisorName: string;
  receivedBy: DropdownSelection[];
  lines: ShortageLine[];
  /** The current row (F12, Close row… with nothing ticked). */
  activeKey: string;
  dirty: boolean;
};

export type ShortageScope = {
  companyId: string;
  branchId: string;
  accYear: string;
  deviceId: string;
};
