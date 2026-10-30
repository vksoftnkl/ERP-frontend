/**
 * The contracts of the dialogs several purchase screens share (Qt NexERP
 * 737e671..e0c56ef): F12 batches / serials (`PurchaseAllocDialog`), Ctrl+A
 * attachments (`PurchaseAttachDialog`), labels (`PurchaseLabelDialog`) and the
 * after-post step (`PurchaseAfterPost::run`), plus the purchase.* settings.
 *
 * Written before the dialogs so Purchase Entry, GRN and Return can wire them
 * while they are built (`shared/components/purchase-*-dialog.tsx`).
 */

// ---------------------------------------------------------------------------
// purchase.* settings — GET /purchase/invoices/settings?companyId&branchId
// (server common/purchase-settings.ts; the route needs View on menu 24)
// ---------------------------------------------------------------------------

export type PurchaseSettings = {
  defaultEntry: "DIRECT" | "GRN";
  invAmountCheck: "REFUSE" | "WARN";
  duplicateBillMode: "REFUSE" | "WARN";
  labelsAfterPost: "ASK" | "ALWAYS" | "NEVER";
  allowPriceUpdate: boolean;
  priceUpdate: "UPDATE_PRICES" | "COST_ONLY" | "OPEN_CHANGE_SELLING" | "NONE";
  priceSetAt: "INVOICE" | "GRN";
  rateTolerancePct: number;
  shelfLifeMode: "OFF" | "WARN" | "REFUSE";
  minShelfLifePct: number;
  closePoOnFirstBill: boolean;
  poApprovalAbove: number;
  returnSettlementDefault: "ADJUST" | "ADVANCE" | "CASH";
};

/** What the server answers when nothing is set (the catalog defaults). */
export const PURCHASE_SETTINGS_DEFAULTS: PurchaseSettings = {
  defaultEntry: "DIRECT",
  invAmountCheck: "REFUSE",
  duplicateBillMode: "REFUSE",
  labelsAfterPost: "ASK",
  allowPriceUpdate: false,
  priceUpdate: "UPDATE_PRICES",
  priceSetAt: "INVOICE",
  rateTolerancePct: 2,
  shelfLifeMode: "WARN",
  minShelfLifePct: 60,
  closePoOnFirstBill: false,
  poApprovalAbove: 0,
  returnSettlementDefault: "ADJUST",
};

// ---------------------------------------------------------------------------
// F12 — batches / serials of ONE line (ui_table 63 "PURCHASE - ALLOCATION ROWS")
// ---------------------------------------------------------------------------

export type PurchaseAllocBucket = "SALEABLE" | "DAMAGED";

/**
 * One allocation row: what `allocs[]` sends (Purchase Entry and GRN take the
 * same keys) plus the names the grid shows. Dates are ISO `yyyy-MM-dd`.
 */
export type PurchaseAllocEntry = {
  godownId?: string;
  godownName?: string;
  bucket: PurchaseAllocBucket;
  batchNo?: string;
  mfgDate?: string;
  expiryDate?: string;
  mrp?: number;
  serialNo?: string;
  warrantyTo?: string;
  sizeId?: string;
  sizeName?: string;
  colourId?: string;
  colourName?: string;
  model?: string;
  qty: number;
  freeQty?: number;
};

/** What the rows must add up to (Qt `PurchaseAllocDialog::Need`). */
export type PurchaseAllocNeed = {
  received: number;
  damaged: number;
  free: number;
  /** The item tracks serials (signature 'R'): a row is one piece. */
  serial: boolean;
  /** stock.auto_batch_no on + batch-tracked item: size / colour / model per row, batch given on post. */
  textile: boolean;
  /** The document's godown — a new row's default. */
  godownId: string;
  godownName: string;
};

export type PurchaseAllocDialogProps = {
  open: boolean;
  /** e.g. "Batches / serials — SHIRT (PCS)". */
  title: string;
  need: PurchaseAllocNeed;
  /** The line's split so far (empty = start from the row's own batch / expiry). */
  rows: readonly PurchaseAllocEntry[];
  readOnly: boolean;
  /** Shown in place of the buttons when read-only ("Posted — the split is the server's."). */
  readOnlyReason?: string;
  /** Branch of the document — the Godown pick-list (dropdown 26 GODOWNS, `ibranch_id`). */
  branchId: string;
  /** OK, only once Σ qty + free = received + damaged + free and `problem` is empty. */
  onAccept: (rows: PurchaseAllocEntry[]) => void;
  /** Cancel / Esc (embedded: Esc in the panel). The line keeps what last added up. */
  onClose: () => void;
  /**
   * An INLINE panel in the screen, not a modal (Qt `embedded`, NexERP GRN / Shortage
   * / Purchase Entry): no window, no OK — every edit that adds up goes straight back
   * to the line (`onEdited`); Esc closes it; the screen's keys stay live around it.
   * Key it by the line (and opening) so each opening starts from the line's rows.
   */
  embedded?: boolean;
  /** Embedded: an edit left the rows adding up (Qt `edited`). */
  onEdited?: (rows: PurchaseAllocEntry[]) => void;
  /** What is still wrong ("" = the rows add up) — a screen refuses to move the panel to another line then. */
  onProblem?: (problem: string) => void;
  /** The panel's tooltip (Qt: the line's item). */
  tip?: string;
};

/** The wire row (names dropped, blanks omitted). */
export function allocDtoOf(entry: PurchaseAllocEntry): Omit<PurchaseAllocEntry, "godownName" | "sizeName" | "colourName"> {
  const out: Omit<PurchaseAllocEntry, "godownName" | "sizeName" | "colourName"> = { bucket: entry.bucket, qty: entry.qty };
  const text = (value: string | undefined) => {
    const trimmed = (value ?? "").trim();
    return trimmed ? trimmed : undefined;
  };
  const set = <K extends keyof typeof out>(key: K, value: (typeof out)[K] | undefined) => {
    if (value !== undefined) {
      out[key] = value;
    }
  };
  set("godownId", text(entry.godownId));
  set("batchNo", text(entry.batchNo));
  set("mfgDate", text(entry.mfgDate));
  set("expiryDate", text(entry.expiryDate));
  set("mrp", entry.mrp !== undefined && Number.isFinite(entry.mrp) && entry.mrp > 0 ? entry.mrp : undefined);
  set("serialNo", text(entry.serialNo));
  set("warrantyTo", text(entry.warrantyTo));
  set("sizeId", text(entry.sizeId));
  set("colourId", text(entry.colourId));
  set("model", text(entry.model));
  set("freeQty", entry.freeQty !== undefined && entry.freeQty > 0 ? entry.freeQty : undefined);
  return out;
}

// ---------------------------------------------------------------------------
// Ctrl+A — attachments (/txn-attachments, ENT-26)
// ---------------------------------------------------------------------------

export type PurchaseAttachDocType = "PURCHASE_BILL" | "GRN" | "PURCHASE_RETURN" | "PURCHASE_ORDER" | "SHORTAGE_RECEIPT";

export type PurchaseAttachDialogProps = {
  open: boolean;
  docType: PurchaseAttachDocType;
  /** The saved document's id; null = not saved yet (the dialog says "save it first"). */
  docId: string | null;
  companyId: string;
  branchId: string;
  accYear: string;
  /** "Purchase PI/0012", for the title. */
  docLabel: string;
  readOnly?: boolean;
  onClose: () => void;
  onChanged?: (count: number) => void;
};

// ---------------------------------------------------------------------------
// Labels (GET /purchase/labels/from-doc, ENT-21) + the after-post step
// ---------------------------------------------------------------------------

export type PurchaseLabelDocType = "GRN" | "PURCHASE_BILL";

export type PurchaseLabelDialogProps = {
  open: boolean;
  docType: PurchaseLabelDocType;
  docId: string;
  accYear: string;
  title: string;
  onClose: () => void;
};

/** A just-posted GRN / bill: labels per purchase.labels_after_post, then Change Selling per price_update. */
export type PurchaseAfterPostTarget = {
  docType: PurchaseLabelDocType;
  docId: string;
  accYear: string;
  refno: string;
};
