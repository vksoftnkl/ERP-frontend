/**
 * Shortage Receipt — the wire shapes of `PurchaseShortageController` and the
 * screen's own draft. Decimals arrive as strings (pg NUMERIC through
 * `jsonSafe`); read them with `num()`.
 */
import type { DropdownSelection } from "@/components/design-system/dropdown/types";

type WireDecimal = string | number | null;

/** GET /purchase/shortages/open — one shortage with qty still open, in BASE units. */
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
  srcRefno: string | null;
  qtyBase: WireDecimal;
  received: WireDecimal;
  closed: WireDecimal;
  openQty: WireDecimal;
  value: WireDecimal;
  gst: WireDecimal;
  openValue: WireDecimal;
  openGst: WireDecimal;
  costRate: WireDecimal;
  batchNo: string | null;
  expiryDate: string | null;
  mrp: WireDecimal;
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
  psrChallanNo: string | null;
  psrReceivedBy: string[] | null;
  psrValue: WireDecimal;
  psrRemarks: string | null;
  psrCreatedOn?: string | null;
  supplierName: string | null;
};

export type ShortageReceiptLineRow = {
  psriId: string;
  psriLineNo: number;
  psriShortageId: string;
  psriShortageAccYear: string;
  psriQty: WireDecimal;
  psriCostRate: WireDecimal;
  psriValue: WireDecimal;
  itemName?: string | null;
  unitName?: string | null;
  reason: string | null;
  srcRefno: string | null;
  /** What is still open, this draft's own qty NOT counted; null once the shortage is gone. */
  openQty: WireDecimal;
  batchNo: string | null;
  expiryDate: string | null;
  mrp: WireDecimal;
};

export type ShortageReceiptPayload = {
  header: ShortageReceiptHeader;
  lines: ShortageReceiptLineRow[];
};

export type ShortageReceiptLineDto = {
  lineNo: number;
  shortageId: string;
  shortageAccYear: string;
  qty: number;
  batchNo?: string;
  expiryDate?: string;
  mrp?: number;
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
    challanNo?: string;
    receivedBy: string[];
    remarks?: string;
    post: boolean;
  };
  lines: ShortageReceiptLineDto[];
};

export type CloseKind = "SUPPLIER_CN" | "WRITE_OFF";

export type CloseShortageDto = {
  shortageId: string;
  accYear: string;
  deviceId: string;
  kind: CloseKind;
  cnNo?: string;
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

/** GET /purchase/shortages/closes — one standing close (not undone). */
export type ShortageCloseRow = {
  closeId: string;
  accYear: string;
  kind: CloseKind;
  qty: WireDecimal;
  amount: WireDecimal;
  cnNo: string | null;
  reason: string | null;
  createdOn: string | null;
};

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
  source: string;
  /** The reason CODE; shown through REASON_TEXT. */
  reason: string;
  itemName: string;
  unitName: string;
  /** Still open (base units); null when the server no longer knows it. */
  shortQty: number | null;
  /** Typed — blank means "not this time". */
  received: string;
  batch: string;
  /** Typed dd/MM/yyyy. */
  expiry: string;
  mrp: string;
  /** The shortage's own cost per base unit. */
  cost: number;
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
  /** ISO yyyy-MM-dd. */
  docDate: string;
  challanNo: string;
  remarks: string;
  receivedBy: DropdownSelection[];
  lines: ShortageLine[];
  /** The row the close buttons act on. */
  activeKey: string;
  dirty: boolean;
};

export type ShortageScope = {
  companyId: string;
  branchId: string;
  accYear: string;
  deviceId: string;
};
