import type { DropdownSelection } from "@/components/design-system/dropdown";

/** The four fields a stored receipt is addressed by (stock_voucher is partitioned by year). */
export type BranchInwardDocKey = {
  svhId: string;
  companyId: string;
  branchId: string;
  accYear: string;
  refno?: string;
  status?: string;
};

/** One row of grid 186 — a despatch still on its way here. */
export type InboundRow = {
  out_id?: string;
  out_acc_year?: string;
  out_refno?: string;
  out_date?: string;
  from_branch?: string;
  from_godown?: string;
  to_godown?: string;
  lines?: number | string;
  sent_qty?: number | string;
  remaining_qty?: number | string;
  remaining_value?: number | string;
  lr_no?: string;
  vehicle_no?: string;
  expected_on?: string;
  days_in_flight?: number | string;
  transit_status?: string;
};

export type InboundPage = { items: InboundRow[]; meta?: { total?: number } };

/** A transit row of the despatch, at what is still owed (GET …/receive/prefill). */
export type PrefillRow = {
  sttId: string;
  itemId: string;
  itemName?: string | null;
  lotId: string;
  batchNo?: string | null;
  baseUomId: string;
  unitName?: string | null;
  toGodownId: string;
  toGodownName?: string | null;
  bucket: string;
  sentQty: number | string;
  receivedQty: number | string;
  damageQty: number | string;
  remainingQty: number | string;
};

export type PrefillPayload = {
  outVoucher: {
    svhId: string;
    accYear: string;
    refno: string;
    fromBranchName?: string | null;
    fromGodownId?: string | null;
    toGodownId?: string | null;
    toGodownName?: string | null;
  };
  rows: PrefillRow[];
};

/** A saved receipt line (GET …/receive). */
export type ReceiptLine = {
  sviId?: string;
  itemId: string;
  itemName?: string | null;
  lotId: string;
  batchNo?: string | null;
  unitName?: string | null;
  godownId?: string | null;
  bucket?: string | null;
  qty: number | string;
  unloadRate?: number | string | null;
};

export type ReceiptHeader = {
  svhId: string;
  accYear: string;
  companyId?: string;
  branchId?: string;
  refno?: string | null;
  status?: string | null;
  docDate?: string | null;
  remarks?: string | null;
  fromGodownId?: string | null;
  godownId?: string | null;
  godownName?: string | null;
  linkSrcDocId?: string | null;
  linkSrcAccYear?: string | null;
  linkSrcRefno?: string | null;
  fromBranchName?: string | null;
  unloadEnabled?: boolean;
  unloadDatetime?: string | null;
  unloadmanIds?: string[];
  unloadmanNames?: string[];
  unloadSupervisorId?: string | null;
  unloadSupervisorName?: string | null;
  unloadingCharge?: number | string | null;
  createdByName?: string | null;
  postedByName?: string | null;
};

export type ReceiptPayload = { header: ReceiptHeader; lines: ReceiptLine[] };

/** What the draft save answers with — only the identity is read. */
export type SaveResult = { header?: { svhId?: string; refno?: string } };

export type PostResult = {
  outVoucher?: { refno?: string; closed?: boolean };
  inVoucher?: { ledgerRows?: number };
};

/** One line of the grid: a transit row, or a DAMAGED split of one. */
export type InwardLine = {
  /** React key; stable for the life of the line. */
  key: string;
  /** The transit row this line belongs to ("" never — a line always has one). */
  sttId: string;
  /** The saved line's id (a reopened receipt only). */
  sviId: string;
  itemId: string;
  itemName: string;
  batchNo: string;
  unitName: string;
  lotId: string;
  baseUomId: string;
  toGodownId: string;
  /** The bucket the transit row sits in. */
  transitBucket: string;
  sentQty: number;
  /** received + damaged so far, by earlier receipts. */
  receivedQty: number;
  /** Still in transit — the most this transit row takes. */
  remainingQty: number;
  /** Keyed text, so a half-typed "1." survives; parsed with `num()`. */
  qty: string;
  bucket: string;
  unloadRate: string;
};

export type InwardDraft = {
  svhId: string;
  refno: string;
  /** DRAFT until posted. */
  status: string;
  /** browse = read-only (posted, or a draft opened to look at). */
  mode: "entry" | "browse";
  companyId: string;
  branchId: string;
  /** The receipt's own year; the despatch's is `outAccYear`. */
  accYear: string;
  deviceId: string;
  docDate: string;
  remarks: string;
  // the despatch being received
  outId: string;
  outAccYear: string;
  outRefno: string;
  fromBranchName: string;
  fromGodownId: string;
  toGodownId: string;
  toGodownName: string;
  lines: InwardLine[];
  // Unloading box
  unloadEnabled: boolean;
  /** `datetime-local` text. */
  unloadAt: string;
  unloadmen: DropdownSelection[];
  unloadSupervisor: DropdownSelection | null;
  /** The charge a saved receipt posted (header.unloadingCharge) — null while keying. */
  postedUnloadCharge: number | null;
  createdByName: string;
  postedByName: string;
  /** A line the server refused, by line key. */
  problems: Record<string, string>;
  dirty: boolean;
  /** Lines are as keyed on a saved receipt: no sent / remaining figures to check against. */
  asKeyed: boolean;
  notice: string;
};

export type Outcome = {
  tone: "" | "good" | "warn";
  title: string;
  text: string;
};

export type Totals = {
  receiving: number;
  damaged: number;
  remaining: number;
  shortAfter: number;
  unloadCharge: number;
};
