/**
 * Delivery Challan — the draft as this screen holds it, and the wire it reads.
 *
 * A line is the quotation's `DraftLine` (the shared grid and pricing engine
 * read it) plus what a challan line adds: its own id, the source-order trail,
 * the stock proposal, and the server-owned fulfilment quartet.
 */
import type { VoucherPolicy } from "@/domain/pricing";
import type { CustomerSnapshot, DraftLine } from "@/features/sales/quotation/quotation.types";
import type { TransportBand } from "@/features/sales/testbill/types";
import type { DcStatus } from "./dc.constants";

export type DcDocKey = {
  sdcId: string;
  sdcCompanyId: string;
  sdcBranchId: string;
  sdcAccYear: string;
};

export type DcDraftLine = DraftLine & {
  /** `sdi_id`; null on a line never saved. */
  sdiId: string | null;
  srcDocType: string | null;
  /** `sdiSrcItemId` — the order LINE drawn on (what the over-order guard settles against). */
  srcLineId: string | null;
  srcDocYear: string | null;
  srcDocRefno: string | null;
  lotId: string | null;
  bucket: string;
  serialNo: string | null;
  // Fulfilment — server-owned, painted, never sent.
  openQty: number;
  billedQty: number;
  returnedQty: number;
  lineStatus: string | null;
};

export type DcHeader = {
  dcDate: string;
  purpose: string;
  purposeLabel: string;
  usrRefno: string;
  usrRefdate: string;
  remarks: string;
  priceLevel: number;
  posStateCode: string;
  posStateName: string;
  salesmanId: string | null;
  salesmanName: string;
  driverId: string | null;
  driverName: string;
  loadmanId: string | null;
  loadmanName: string;
  vehicleNo: string;
  vehicleId: string | null;
};

/** The header trail: the FIRST order the lines draw on (Qt `m_voucherParam.srcDoc*`). */
export type DcSource = {
  docType: string;
  docId: string;
  accYear: string | null;
  refno: string | null;
  date: string | null;
};

/** What `/get` said about posting — READ, never derived (Qt `applyPostingState`). */
export type DcPostingState = {
  canPost: boolean;
  canOverride: boolean;
  canCancel: boolean;
  cancelBlockedReason: string;
  canAmend: boolean;
  amendBlockedReason: string;
  purposeEditable: boolean;
  documentEditable: boolean;
  bandEditable: boolean;
  ewbLive: boolean;
  ewbStatus: string;
  ewbNumber: string;
  ewbValidUpto: string | null;
  ewbMessage: string;
  ewbVehicleNo: string;
  registerId: string;
  cogsAmt: number;
  voucherRefno: string;
};

/** The header totals a loaded challan stored — shown until the first edit. */
export type DcStoredTotals = {
  totItems: number;
  totQty: number;
  totWeight: number;
  taxable: number;
  tax: number;
  total: number;
};

export type DcAudit = {
  createdBy: string | null;
  createdOn: string | null;
  modifiedBy: string | null;
  modifiedOn: string | null;
};

export type DcMode = "entry" | "browse";

export type DcDraft = {
  docId: string | null;
  companyId: string;
  branchId: string;
  accYear: string;
  status: DcStatus;
  refno: string;
  revisionNo: number;
  fulfilStatus: string;
  mode: DcMode;
  amending: boolean;
  isDirty: boolean;
  header: DcHeader;
  customer: CustomerSnapshot;
  /** "Edit for this challan" — the bill-to snapshot unlocked on this document only. */
  billToUnlocked: boolean;
  isLocalSale: boolean;
  policy: VoucherPolicy;
  source: DcSource | null;
  /** refno per source document id, for the chip and the per-line trail. */
  sourceRefnos: Record<string, string>;
  lines: DcDraftLine[];
  transport: TransportBand;
  posting: DcPostingState | null;
  storedTotals: DcStoredTotals | null;
  audit: DcAudit;
};

/** One row of grid 116. */
export type DcListRow = {
  sdc_id: string;
  sdc_company_id: string;
  sdc_branch_id: string;
  sdc_acc_year: string;
  sdc_dc_date: string | null;
  sdc_dc_refno: string | null;
  sdc_purpose: string | null;
  sdc_cust_name: string | null;
  sdc_cust_place: string | null;
  sdc_cust_phone: string | null;
  sdc_tot_items: number | string | null;
  sdc_dc_amt: number | string | null;
  sdc_status: string | null;
  sdc_fulfil_status: string | null;
  sdc_vehicle_no: string | null;
  sdc_src_doc_refno: string | null;
  sdc_created_by: string | null;
};

/** The GET / create answer — header FLAT plus the nested blocks. Loose by design. */
export type DcPayload = Record<string, unknown> & {
  sdcId?: string;
  items?: Array<Record<string, unknown>>;
  transport?: Record<string, unknown> | null;
  posting?: Record<string, unknown> | null;
  locks?: Record<string, unknown> | null;
  rights?: Record<string, unknown> | null;
};
