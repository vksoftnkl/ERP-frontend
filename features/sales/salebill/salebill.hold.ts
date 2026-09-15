/**
 * Sale Bill Entry — parking a cart in `public.txn_hold`, and crash recovery
 * (§12). This is the one section of the plan where the Qt design does not port.
 *
 * **What Qt does:** writes JSON files under `AppLocalDataLocation/salebill/` —
 * `holds_<deviceId>.json` and `autosave_<deviceId>.json` — keyed by device id.
 *
 * **Why it cannot port as-is:** there is no such directory in a browser, and the
 * device id is not a file name. More importantly the quotation already does this
 * the other way — `TxnHoldController`, server-side, shared, identical on every
 * screen that uses it. The bill is the outlier, and it is the screen where
 * losing a held sale matters most.
 *
 * So:
 *
 *  - **Holds → the server.** A hold taken at one counter must be resumable at
 *    another; a file on one machine cannot do that, and a counter that dies
 *    takes its held sales with it. The lease (`/resume`, `/release`) is what
 *    stops two operators opening the same cart.
 *  - **Autosave → IndexedDB**, per device, as crash recovery ONLY — never as a
 *    second source of truth. It needs at least one real item row, or every
 *    abandoned blank screen offers itself back on the next open.
 *
 * The autosave snapshot carries the adjustments **with their display fields**,
 * which is what lets a recovered bill name the credits it had set off even when
 * the open-credits endpoint is unreachable at recovery time. That is the one
 * thing worth keeping from the Qt version.
 *
 * ---
 *
 * A finding the plan predates, recorded rather than acted on: `txn_hold` already
 * has an **`AUTOSAVE` kind** (`ck_txh_kind`), invisible to the pick list, with a
 * unique index (`ux_txh_autosave`) giving at most one live row per year /
 * device / operator / doc type, so posting one overwrites in place. That is a
 * server-side crash recovery this plan did not know existed, and it would
 * survive a cleared browser store and reach a second browser on the same device.
 * It is NOT used here, deliberately: crash recovery has to work when the network
 * does not, and a debounced write per edit at a busy counter is chatty. Worth a
 * decision, not a silent swap.
 */
import type { DocumentPricing } from "@/domain/pricing";
import {
  holdAccYearOf,
  nextHoldNo,
  nextHoldSlno,
} from "@/features/sales/quotation/quotation.hold";
import type { SaveActor } from "@/features/sales/quotation/quotation.payload";
import type {
  SaveTxnHoldDto,
  TxnHoldPayload,
} from "@/features/sales/quotation/quotation.types";
import { toNullableText, toNumber } from "@/features/sales/quotation/quotation.utils";
import {
  DEFAULT_BILL_STATUS,
  SALE_BILL_HOLD_DOC_TYPE,
  SALE_BILL_HOLD_KIND,
  SALE_BILL_HOLD_PARTY_TYPE,
  SALE_BILL_HOLD_SRC_MODULE,
  SALE_BILL_UI_STATE_KIND,
  SALE_BILL_UI_STATE_SCREEN,
  SALE_BILL_UI_STATE_VERSION,
} from "./salebill.constants";
import { buildSavePayload } from "./salebill.payload";
import type { SaleBillDraft, SaveBillDto } from "./salebill.types";

export { nextHoldNo, nextHoldSlno, holdAccYearOf };
export {
  holdConversionOf,
  holdHolderLabel,
  holdLeaseIsLive,
  holdLockMessage,
  holdLockScope,
  isHoldInUse,
} from "@/features/sales/quotation/quotation.hold";

/**
 * What this screen writes into `txh_payload`, and the only shape it reads back.
 *
 * Both halves, on purpose, exactly as the quotation's envelope does:
 *
 *  - `bill` — the `POST /bills/create` body the cart would have saved as. The
 *    parked DOCUMENT, readable by anything that knows the bill contract and
 *    nothing about this screen.
 *  - `draft` — the screen's own state. The save payload alone cannot redraw the
 *    grids: `sbiItemName`, `sbiUnitName`, the godown name and the charge ledger
 *    names are response-only fields a create body has no room for, so a cart
 *    restored from `bill` would come back with every Description cell blank.
 *
 * Every write stamps `kind` / `version` / `screen`; every read checks them,
 * which is what keeps another screen's holds out of this picker — the table is
 * shared with the till and with the quotation screen.
 */
export type SaleBillHoldUiState = {
  kind: typeof SALE_BILL_UI_STATE_KIND;
  version: number;
  screen: typeof SALE_BILL_UI_STATE_SCREEN;
  /** When the cart was parked, as the client saw it. */
  heldAt: string;
  bill: SaveBillDto;
  draft: SaleBillDraft;
};

/** Read the envelope, or `null` when this is not one of our carts. */
export function readBillHoldUiState(value: unknown): SaleBillHoldUiState | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<SaleBillHoldUiState>;
  if (candidate.kind !== SALE_BILL_UI_STATE_KIND) {
    return null;
  }
  if (candidate.screen !== SALE_BILL_UI_STATE_SCREEN) {
    return null;
  }
  if (!candidate.draft || typeof candidate.draft !== "object") {
    return null;
  }
  return candidate as SaleBillHoldUiState;
}

/** Whether a listed hold is a bill cart this screen can restore. */
export function isBillHold(hold: TxnHoldPayload): boolean {
  return readBillHoldUiState(hold.txhPayload) !== null;
}

/**
 * The cart, as the screen last had it.
 *
 * Restored as an editable draft with live pricing: a parked cart is unfinished
 * work, not a saved document, so there is nothing "stored" to paint. It comes
 * back CLEAN — the unsaved work is safe in the hold row, so the discard guard
 * has nothing to warn about until the operator changes something.
 *
 * The lines come back with their stock gate UNRESOLVED whatever the parked draft
 * said: the cart may have sat for an hour and the stock has moved since (§7.2).
 */
export function draftFromBillHold(
  hold: TxnHoldPayload,
  state: SaleBillHoldUiState,
): SaleBillDraft {
  return {
    ...state.draft,
    mode: "entry",
    pricing: "live",
    isDirty: false,
    storedPricing: null,
    // A parked cart is a bill that has not been raised yet, whatever status the
    // draft was parked with, so it comes back on the status a new bill opens on.
    // An existing bill keeps its own — parking one does not re-post it.
    status: state.draft.docId ? state.draft.status : DEFAULT_BILL_STATUS,
    lines: (state.draft.lines ?? []).map((line) => ({ ...line, stockGateResolved: false })),
    holdId: hold.txhId,
    holdNo: hold.txhHoldNo,
  };
}

export type BuildBillHoldOptions = {
  /** Present → update that hold; absent → create one. */
  holdId?: string | null;
  /** Required on create, and left alone on update (the stored one stands). */
  holdNo?: string;
  holdSlno?: number;
  now?: Date;
};

/**
 * The `POST /txn-holds/create` body for the cart on screen.
 *
 * Create and update are one route, and the two differ by more than `txhId`: the
 * company / branch / accounting-year scope is immutable server-side (the year is
 * half the primary key), so an update deliberately does not resend it, and
 * neither is the hold number or its serial, which would re-run two uniqueness
 * checks for no reason.
 *
 * `txhPayload` goes on BOTH, because it is what a re-park is for.
 */
export function buildBillHoldPayload(
  draft: SaleBillDraft,
  pricing: DocumentPricing,
  actor: SaveActor,
  options: BuildBillHoldOptions = {},
): SaveTxnHoldDto {
  const now = options.now ?? new Date();
  const bill = buildSavePayload(draft, pricing, actor);
  const uiState: SaleBillHoldUiState = {
    kind: SALE_BILL_UI_STATE_KIND,
    version: SALE_BILL_UI_STATE_VERSION,
    screen: SALE_BILL_UI_STATE_SCREEN,
    heldAt: now.toISOString(),
    bill,
    draft,
  };
  const summary: SaveTxnHoldDto = {
    txhHoldOn: now.toISOString(),
    // The party snapshot the picker renders from, so it never has to open the
    // payload or join the customer master.
    txhPartyType: SALE_BILL_HOLD_PARTY_TYPE,
    txhPartyId: draft.customer.custId || null,
    txhPartyName: toNullableText(draft.customer.name, 150),
    txhPartyMobile: toNullableText(draft.customer.phone, 20),
    // The lines the payload actually carries, not the grid's rows: the trailing
    // blank one the grid always keeps open is not a line anybody parked.
    txhItemCount: bill.items?.length ?? 0,
    // `ck_txh_amounts` — never negative, even on a deduction-heavy cart.
    txhTotalQty: Math.max(0, toNumber(pricing.totals.totQty)),
    txhNetAmount: Math.max(0, toNumber(pricing.totals.bill)),
    txhRemarks: toNullableText(draft.terms.remarks, 500),
    txhPayload: uiState as unknown as Record<string, unknown>,
    txhPayloadVersion: SALE_BILL_UI_STATE_VERSION,
    txhModifiedBy: actor.userId || null,
  };
  if (options.holdId) {
    // No `txhStatus`. This cart is being re-parked, which means the row is
    // LOCKED to this device — clearing a lease is `/release`'s job, done right
    // after this write.
    return { txhId: options.holdId, ...summary };
  }
  return {
    ...summary,
    txhStatus: "HELD",
    txhKind: SALE_BILL_HOLD_KIND,
    txhSrcModule: SALE_BILL_HOLD_SRC_MODULE,
    txhDocType: SALE_BILL_HOLD_DOC_TYPE,
    txhCompanyId: draft.companyId,
    txhBranchId: draft.branchId,
    // Guarded by the caller: `holdAccYearOf` returning null refuses the hold
    // outright, because the scope cannot be corrected after create.
    txhAccYear: holdAccYearOf(draft.accYear) ?? undefined,
    txhHoldNo: options.holdNo,
    txhHoldSlno: options.holdSlno,
    // `fixed.device_master.dev_id` — a real foreign key, so it is the device the
    // LOGIN registered, never the browser's own local uuid.
    txhDeviceId: actor.deviceMasterId ?? undefined,
    txhHeldBy: actor.userId || undefined,
    txhCreatedBy: actor.userId || null,
  };
}

// ---------------------------------------------------------------------------
// Autosave — IndexedDB, per device, crash recovery ONLY
// ---------------------------------------------------------------------------

const AUTOSAVE_DB = "erp-sale-bill";
const AUTOSAVE_STORE = "autosave";
const AUTOSAVE_DB_VERSION = 1;

/** One recovered snapshot, and enough about it to describe the offer. */
export type BillAutosave = {
  /** The device this was taken on — the record's own key. */
  deviceId: string;
  savedAt: string;
  companyId: string;
  branchId: string;
  accYear: string;
  /** For the offer's wording: "3 lines for ACME, ₹4,120". */
  itemCount: number;
  netAmount: number;
  partyName: string;
  draft: SaleBillDraft;
};

/**
 * Whether this draft is worth keeping.
 *
 * At least one REAL item row — the guard the Qt version has and the one that
 * matters, because the grid always keeps a blank row waiting and without this
 * every abandoned blank screen would offer itself back on the next open.
 */
export function isWorthAutosaving(draft: SaleBillDraft): boolean {
  return draft.lines.some((line) => Boolean(line.itemId) && line.billQty > 0);
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(AUTOSAVE_DB, AUTOSAVE_DB_VERSION);
    } catch {
      // Private browsing, blocked storage, a quota policy — crash recovery is a
      // convenience and its absence must never stop the screen opening.
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(AUTOSAVE_STORE)) {
        db.createObjectStore(AUTOSAVE_STORE, { keyPath: "deviceId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) {
          resolve(null);
          return;
        }
        let request: IDBRequest<T>;
        try {
          request = run(db.transaction(AUTOSAVE_STORE, mode).objectStore(AUTOSAVE_STORE));
        } catch {
          db.close();
          resolve(null);
          return;
        }
        request.onsuccess = () => {
          resolve(request.result ?? null);
          db.close();
        };
        request.onerror = () => {
          resolve(null);
          db.close();
        };
      }),
  );
}

/**
 * Take a snapshot. Debounced by the caller; a draft with no real item row is
 * silently skipped rather than stored and later offered.
 *
 * The whole draft goes in, adjustments and their display fields included — that
 * is what lets a recovered bill NAME the credits it had set off even when the
 * open-credits endpoint is unreachable at recovery time.
 */
export async function writeAutosave(
  deviceId: string,
  draft: SaleBillDraft,
  pricing: DocumentPricing,
  now: Date = new Date(),
): Promise<void> {
  if (!deviceId || !isWorthAutosaving(draft)) {
    return;
  }
  const record: BillAutosave = {
    deviceId,
    savedAt: now.toISOString(),
    companyId: draft.companyId,
    branchId: draft.branchId,
    accYear: draft.accYear,
    itemCount: draft.lines.filter((line) => Boolean(line.itemId)).length,
    netAmount: pricing.totals.bill,
    partyName: draft.customer.name,
    draft,
  };
  await withStore("readwrite", (store) => store.put(record) as IDBRequest<IDBValidKey>);
}

/**
 * The snapshot this device left behind, or `null`.
 *
 * Scope-checked: a snapshot taken under another company / branch / year is not
 * offered, because re-tenanting a bill would leave one company's prices on a
 * document stamped for another — the same reason the screen refuses to
 * re-tenant a dirty draft.
 */
export async function readAutosave(
  deviceId: string,
  scope: { companyId: string; branchId: string; accYear: string },
): Promise<BillAutosave | null> {
  if (!deviceId) {
    return null;
  }
  const record = await withStore<BillAutosave>("readonly", (store) =>
    store.get(deviceId) as IDBRequest<BillAutosave>,
  );
  if (!record?.draft) {
    return null;
  }
  if (
    record.companyId !== scope.companyId ||
    record.branchId !== scope.branchId ||
    record.accYear !== scope.accYear
  ) {
    return null;
  }
  return record;
}

/** Drop the snapshot — on save, on clear, and on a declined offer. */
export async function clearAutosave(deviceId: string): Promise<void> {
  if (!deviceId) {
    return;
  }
  await withStore("readwrite", (store) => store.delete(deviceId) as IDBRequest<undefined>);
}

/**
 * A recovered snapshot as a draft.
 *
 * Live pricing and clean, like a resumed hold — but marked DIRTY, because unlike
 * a hold the work is not safe anywhere: the snapshot is about to be deleted, and
 * the discard guard is the only thing standing between it and a stray F7. The
 * stock gate is reset for the same reason a hold's is.
 */
export function draftFromAutosave(record: BillAutosave): SaleBillDraft {
  return {
    ...record.draft,
    mode: "entry",
    pricing: "live",
    isDirty: true,
    storedPricing: null,
    status: record.draft.docId ? record.draft.status : DEFAULT_BILL_STATUS,
    lines: (record.draft.lines ?? []).map((line) => ({ ...line, stockGateResolved: false })),
  };
}
