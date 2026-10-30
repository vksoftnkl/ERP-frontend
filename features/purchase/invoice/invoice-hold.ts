/**
 * Purchase Entry — Hold (F9), Pick held (F10) and the crash-recovery autosave
 * on the house `public.txn_hold` (Qt NexERP 4c09536 `PurchaseHoldSupport`,
 * ENT-25), pure.
 *
 * The parked document is the screen's SAVE BODY, verbatim — the same envelope
 * the Qt screen writes, so a bill parked on one comes back on the other. Coming
 * back, the body is saved as a new DRAFT and that draft opens: the server
 * rebuilds every figure, so nothing here has to repaint a hold. Qt drops a
 * `uiState` key on the way back; this screen stamps one, which is how its F10
 * list and the Qt one both recognise a purchase bill.
 */
import type { SaveTxnHoldDto, TxnHoldPayload } from "@/features/sales/quotation/quotation.types";
import type { SavePurchaseInvoiceDto } from "./invoice.types";

export const PURCHASE_HOLD_DOC_TYPE = "PURCHASE_BILL";
export const PURCHASE_HOLD_SRC_MODULE = "PURCHASE";
export const PURCHASE_HOLD_PARTY_TYPE = "SUPPLIER";
export const PURCHASE_HOLD_KIND = "HOLD";
export const PURCHASE_AUTOSAVE_KIND = "AUTOSAVE";
/** Qt `kAutosaveMs`. */
export const PURCHASE_AUTOSAVE_INTERVAL_MS = 45_000;
/** Qt waits this long after the screen opens before offering an autosave back. */
export const PURCHASE_RECOVERY_DELAY_MS = 800;

const UI_STATE = { screen: "purchase-invoice", version: 1 } as const;

export type PurchaseHoldDescriptor = {
  companyId: string;
  branchId: string;
  accYear: string;
  /** fixed.device_master — the login's device, a real FK. */
  deviceId: string;
  /** The operator. */
  heldBy: string;
  supplierId: string;
  supplierName: string;
  itemCount: number;
  netAmount: number;
};

/** The `/txn-holds/create` body (Qt `TxnHoldService::buildHoldBody`). Hold no / serial are the server's. */
export function holdBody(desc: PurchaseHoldDescriptor, payload: SavePurchaseInvoiceDto, kind: "HOLD" | "AUTOSAVE"): SaveTxnHoldDto {
  const supplierId = desc.supplierId.trim();
  return {
    txhKind: kind,
    txhStatus: "HELD",
    txhSrcModule: PURCHASE_HOLD_SRC_MODULE,
    txhDocType: PURCHASE_HOLD_DOC_TYPE,
    txhCompanyId: desc.companyId,
    txhBranchId: desc.branchId,
    txhAccYear: desc.accYear,
    txhDeviceId: desc.deviceId,
    ...(desc.heldBy ? { txhHeldBy: desc.heldBy } : {}),
    // ck_txh_party_typed: a party id without its type violates the check.
    ...(supplierId ? { txhPartyId: supplierId, txhPartyType: PURCHASE_HOLD_PARTY_TYPE } : {}),
    ...(desc.supplierName.trim() ? { txhPartyName: desc.supplierName.trim() } : {}),
    // ck_txh_amounts: never negative.
    txhItemCount: Math.max(0, desc.itemCount),
    txhTotalQty: 0,
    txhNetAmount: Math.max(0, Number.isFinite(desc.netAmount) ? desc.netAmount : 0),
    txhPayload: { ...payload, uiState: UI_STATE } as unknown as Record<string, unknown>,
    txhPayloadVersion: 1,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A purchase bill's save body (ours or the Qt screen's) — anything else is not offered. */
export function isPurchaseBillHold(hold: Pick<TxnHoldPayload, "txhPayload">): boolean {
  const payload = hold.txhPayload;
  return isRecord(payload) && isRecord(payload.header) && Array.isArray(payload.lines);
}

/**
 * The held body as a NEW draft's save body (Qt `PurchaseHoldSupport::restore`):
 * `uiState` dropped, never posted, no `piId` — a hold is always a new document.
 * Null when the payload is not a purchase bill.
 */
export function restoreBody(payload: unknown): SavePurchaseInvoiceDto | null {
  if (!isRecord(payload) || !isRecord(payload.header) || !Array.isArray(payload.lines)) {
    return null;
  }
  const { uiState: _ui, ...body } = payload;
  void _ui;
  const { piId: _id, ...header } = payload.header;
  void _id;
  return { ...(body as unknown as SavePurchaseInvoiceDto), header: { ...(header as SavePurchaseInvoiceDto["header"]), post: false } };
}

/** The autosave row this device × operator left behind (Qt `offerRecovery`), if any. */
export function myAutosave(rows: readonly TxnHoldPayload[], heldBy: string, deviceId: string): TxnHoldPayload | null {
  return (
    rows.find(
      (row) =>
        row.txhKind === PURCHASE_AUTOSAVE_KIND &&
        row.txhStatus === "HELD" &&
        row.txhHeldBy === heldBy &&
        row.txhDeviceId === deviceId,
    ) ?? null
  );
}

/** "A purchase bill for ACME (3 lines) was not saved…" */
export function recoveryQuestion(row: Pick<TxnHoldPayload, "txhPartyName" | "txhItemCount">): string {
  const party = (row.txhPartyName ?? "").trim() || "no supplier";
  return `A purchase bill for ${party} (${row.txhItemCount ?? 0} lines) was not saved when this screen last closed. Bring it back as a draft?`;
}
