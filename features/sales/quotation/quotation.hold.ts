/**
 * Quotation Entry — parking a cart in `public.txn_hold` and pulling it back
 * (F9 / F10).
 *
 * A hold is NOT a quotation: nothing is written to `sale_quotation`, no voucher
 * number is allocated and no stock is touched. The row carries a summary the
 * held list renders from (`txhPartyName` / `txhItemCount` / `txhTotalQty` /
 * `txhNetAmount`) plus the whole screen as JSONB in `txh_payload`, which the
 * server stores and hands back verbatim and never reads into.
 *
 * That envelope is therefore the only contract there is, and it carries BOTH
 * halves on purpose:
 *
 *  - `quotation` — the exact `POST /quotations/create` body the cart would have
 *    saved as. It is the parked *document*, readable by anything that knows the
 *    quotation contract and nothing about this screen;
 *  - `draft` — the screen's own state. The save payload alone cannot redraw the
 *    grids: `sqiItemName`, `sqiUnitName` and the charge ledger names are
 *    response-only fields that a create body has no room for, so a cart restored
 *    from `quotation` would come back with every Description cell blank.
 *
 * Every write stamps `kind` / `version` / `screen`; every read checks them, which
 * is what keeps another screen's holds out of the picker — the table is shared
 * with the till, and a POS hold is a row like any other.
 *
 * Who may open a parked cart is NOT decided here. That is the server's edit
 * LEASE: `/txn-holds/:id/resume` moves the row `HELD → LOCKED` in one
 * conditional update keyed on the device (`X-Device-Id`), so two operators
 * racing the same cart serialize on the row and the loser is told which device
 * has it. The lease also ends (`txh_lock_expires_on`), so a browser that died
 * mid-edit strands its cart only until it lapses. This module builds the bodies;
 * `use-quotation-draft` drives the transitions.
 */
import type { DocumentPricing } from "@/domain/pricing";
import {
  HOLD_ACC_YEAR_LENGTH,
  HOLD_IN_USE_STATUSES,
  HOLD_NO_MAX_LENGTH,
  HOLD_NO_PREFIX,
  HOLD_SLNO_STORAGE_PREFIX,
  HOLD_UI_STATE_KIND,
  HOLD_UI_STATE_SCREEN,
  HOLD_UI_STATE_VERSION,
  QUOTATION_HOLD_DOC_TYPE,
  QUOTATION_HOLD_KIND,
  QUOTATION_HOLD_PARTY_TYPE,
  QUOTATION_HOLD_SRC_MODULE,
} from "./quotation.constants";
import type { SaveActor } from "./quotation.payload";
import { buildSavePayload } from "./quotation.payload";
import type {
  CustomerSnapshot,
  QuotationDraft,
  SaveQuotationDto,
  SaveTxnHoldDto,
  TxnHoldConversion,
  TxnHoldLockScope,
  TxnHoldPayload,
} from "./quotation.types";
import { toNullableText, toNumber } from "./quotation.utils";
/** What this screen writes into `txh_payload`, and the only shape it reads back. */
export type QuotationHoldUiState = {
  kind: typeof HOLD_UI_STATE_KIND;
  version: number;
  screen: typeof HOLD_UI_STATE_SCREEN;
  /** When the cart was parked, as the client saw it. */
  heldAt: string;
  /** The create body the parked cart would have posted to `/quotations/create`. */
  quotation: SaveQuotationDto;
  /** The screen state, for a lossless redraw. See the module comment. */
  draft: QuotationDraft;
};
/**
 * A hold number, minted client-side because the column is required on create and
 * nothing generates one server-side — the till this table was built for owns a
 * counter, this screen does not.
 *
 * Unique per company / branch / year / document type, so the clock alone would
 * be enough at one workstation and is not enough across several: two operators
 * can park in the same second. The random tail is what makes that a retry-free
 * event; a genuine collision still answers 409 and the caller mints another.
 */
export function nextHoldNo(now: Date = new Date()): string {
  const stamp = [
    `${now.getFullYear()}`.slice(2),
    `${now.getMonth() + 1}`.padStart(2, "0"),
    `${now.getDate()}`.padStart(2, "0"),
    `${now.getHours()}`.padStart(2, "0"),
    `${now.getMinutes()}`.padStart(2, "0"),
    `${now.getSeconds()}`.padStart(2, "0"),
  ].join("");
  const tail = Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, "0");
  return `${HOLD_NO_PREFIX}${stamp}-${tail}`.slice(0, HOLD_NO_MAX_LENGTH);
}
/** The scope `ux_txh_device_slno` is keyed on, minus the device — that is this browser. */
export type HoldSlnoScope = {
  companyId: string;
  branchId: string;
  accYear: string;
  docType?: string;
};
/** Epoch the fallback serial counts from, so it stays well inside `integer`. */
const SLNO_EPOCH_MS = Date.UTC(2020, 0, 1);
/**
 * A serial with no stored counter behind it: seconds since 2020, which is ~2×10⁸
 * today and rises. Big, monotonic and inside `integer`.
 */
function clockHoldSlno(now: Date): number {
  const seconds = Math.floor((now.getTime() - SLNO_EPOCH_MS) / 1000);
  return seconds >= 1 ? seconds : 1;
}
/**
 * `txh_hold_slno` — the per-device counter behind the printed hold number.
 * Required on create, `>= 1`, and unique per company / branch / year / document
 * type / device (`ux_txh_device_slno`).
 *
 * The counter lives in `localStorage` and is bumped on every mint, so a retry
 * after a 409 gets a fresh value simply by asking again. It is SEEDED from the
 * clock rather than from 1 on purpose: this browser's device id is the login's
 * `device_master` row, which a second browser on the same login shares — two
 * counters both starting at 1 would collide on every hold, where two clock
 * seeds collide only if both were opened in the same second.
 */
export function nextHoldSlno(scope: HoldSlnoScope, now: Date = new Date()): number {
  const key = [
    HOLD_SLNO_STORAGE_PREFIX,
    scope.companyId,
    scope.branchId,
    scope.accYear,
    scope.docType ?? QUOTATION_HOLD_DOC_TYPE,
  ].join(":");
  const seed = clockHoldSlno(now);
  if (typeof window === "undefined") {
    return seed;
  }
  try {
    const stored = Number.parseInt(window.localStorage.getItem(key) ?? "", 10);
    const next = Number.isFinite(stored) && stored >= 1 ? stored + 1 : seed;
    window.localStorage.setItem(key, String(next));
    return next;
  } catch {
    // A browser with storage denied still holds carts; it just numbers each one
    // off the clock instead of counting.
    return seed;
  }
}
/**
 * `txh_acc_year` is `char(9)` — the fiscal year exactly as it names itself
 * (`"2026-2027"`), which is the form the draft already carries. It is half the
 * primary key and the partition key, so a draft whose year has not resolved
 * yields `null` and the caller refuses the hold rather than parking it under a
 * guess that can never be corrected.
 */
export function holdAccYearOf(accYear: string | null | undefined): string | null {
  const value = (accYear ?? "").trim();
  return value.length === HOLD_ACC_YEAR_LENGTH ? value : null;
}
/**
 * The envelope, if this row is one of ours.
 *
 * Anything else — the till's own holds, another screen's, a row written before
 * this version — reads as `null` rather than as a half-restorable cart.
 */
export function readHoldUiState(value: unknown): QuotationHoldUiState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const state = value as Partial<QuotationHoldUiState>;
  if (state.kind !== HOLD_UI_STATE_KIND || state.screen !== HOLD_UI_STATE_SCREEN) {
    return null;
  }
  if (state.version !== HOLD_UI_STATE_VERSION) {
    return null;
  }
  if (!state.draft || typeof state.draft !== "object") {
    return null;
  }
  return state as QuotationHoldUiState;
}
/** Whether a listed hold is a quotation cart this screen can restore. */
export function isQuotationHold(hold: TxnHoldPayload): boolean {
  return readHoldUiState(hold.txhPayload) !== null;
}
/**
 * The cart, as the screen last had it.
 *
 * Restored as an editable draft with live pricing: a parked cart is unfinished
 * work, not a saved document, so there is nothing "stored" to paint and no
 * read-only state to respect. It comes back clean (`isDirty: false`) — the
 * unsaved work is safe in the hold row, so the discard guard has nothing to
 * warn about until the operator changes something.
 */
export function draftFromHold(
  hold: TxnHoldPayload,
  state: QuotationHoldUiState,
): QuotationDraft {
  // `txh_payload` is JSON written by whatever version parked the cart, and
  // `readHoldUiState` checks the envelope rather than every leaf — so a field
  // added to the draft since then is simply absent from an older row. Only
  // `customer.masterName` needs saying: it was split out of `name` after carts
  // were already parked, and `undefined` reaching the Existing Customer
  // combobox would flip that input from uncontrolled to controlled mid-life,
  // which loses what the operator types into it. The document's own copy of the
  // name is what the box showed before the two were told apart.
  const heldCustomer = state.draft.customer as Partial<CustomerSnapshot> | undefined;
  return {
    ...state.draft,
    customer: {
      ...state.draft.customer,
      masterName: heldCustomer?.masterName ?? heldCustomer?.name ?? "",
    },
    mode: "entry",
    pricing: "live",
    isDirty: false,
    storedPricing: null,
    holdId: hold.txhId,
    holdNo: hold.txhHoldNo,
  };
}
export type BuildHoldOptions = {
  /** Present → update that hold; absent → create one. */
  holdId?: string | null;
  /** Required on create, and left alone on update (the stored one stands). */
  holdNo?: string;
  /** The same, for the per-device serial behind it — see `nextHoldSlno`. */
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
 * `txhPayload` goes on BOTH, because it is what a re-park is for: the DTO
 * requires it, and an update that omitted it would leave the stored cart as it
 * was before the operator's last edits.
 */
export function buildHoldPayload(
  draft: QuotationDraft,
  pricing: DocumentPricing,
  actor: SaveActor,
  options: BuildHoldOptions = {},
): SaveTxnHoldDto {
  const now = options.now ?? new Date();
  const quotation = buildSavePayload(draft, pricing, actor);
  const uiState: QuotationHoldUiState = {
    kind: HOLD_UI_STATE_KIND,
    version: HOLD_UI_STATE_VERSION,
    screen: HOLD_UI_STATE_SCREEN,
    heldAt: now.toISOString(),
    quotation,
    draft,
  };
  const summary: SaveTxnHoldDto = {
    txhHoldOn: now.toISOString(),
    // The party snapshot the picker renders from, so it never has to open the
    // payload or join the customer master. `ck_txh_party_typed` wants the type
    // wherever there is an id; a walk-in is a CUSTOMER with a name and no id.
    txhPartyType: QUOTATION_HOLD_PARTY_TYPE,
    txhPartyId: draft.customer.custId || null,
    txhPartyName: toNullableText(draft.customer.name, 150),
    txhPartyMobile: toNullableText(draft.customer.phone, 20),
    // The lines the payload actually carries, not the grid's rows: the trailing
    // blank one the grid always keeps open is not a line anybody parked.
    txhItemCount: quotation.items?.length ?? 0,
    // `ck_txh_amounts` — signs only, and all three are non-negative even when a
    // deduction-only cart prices below zero.
    txhTotalQty: Math.max(0, toNumber(pricing.totals.totQty)),
    txhNetAmount: Math.max(0, toNumber(pricing.totals.bill)),
    txhRemarks: toNullableText(draft.terms.remarks, 500),
    txhPayload: uiState as unknown as Record<string, unknown>,
    txhPayloadVersion: HOLD_UI_STATE_VERSION,
    txhModifiedBy: actor.userId || null,
  };
  if (options.holdId) {
    // No `txhStatus`. This cart is being re-parked, which means the row is
    // LOCKED to this device — and clearing a lease is `/release`'s job, done
    // right after this write: setting HELD through the CRUD route would leave
    // `txh_locked_device_id` pointing at a device that has moved on, and the
    // next resume would hand the cart to nobody.
    return { txhId: options.holdId, ...summary };
  }
  return {
    ...summary,
    // A brand-new row starts free — nothing leases it until a resume does.
    txhStatus: "HELD",
    txhKind: QUOTATION_HOLD_KIND,
    txhSrcModule: QUOTATION_HOLD_SRC_MODULE,
    txhDocType: QUOTATION_HOLD_DOC_TYPE,
    txhCompanyId: draft.companyId,
    txhBranchId: draft.branchId,
    // Guarded by the caller: `holdAccYearOf` returning null refuses the hold
    // outright, because the scope cannot be corrected after create.
    txhAccYear: holdAccYearOf(draft.accYear) ?? undefined,
    txhHoldNo: options.holdNo,
    txhHoldSlno: options.holdSlno,
    // `fixed.device_master.dev_id` — a real foreign key, so it is the device the
    // login registered, never the browser's own local uuid.
    txhDeviceId: actor.deviceMasterId ?? undefined,
    // A uuid column: the operator, not their name.
    txhHeldBy: actor.userId || undefined,
    txhCreatedBy: actor.userId || null,
    // `txhSessionId` is deliberately NOT sent: it means the till's SHIFT / day
    // session, which this screen does not open, and the JWT's `sid` is not one.
  };
}
/**
 * The tenant scope every lease transition is keyed on.
 *
 * Read off the HOLD rather than the draft wherever one is to hand: a hold is
 * scoped once, at create, and can never be re-scoped, so the row's own values
 * are the ones the server will compare against. Sending the draft's instead
 * would answer 404 (`no such hold here`) the moment the screen's context has
 * moved on. The year is optional to the DTO and always sent: `txn_hold` is
 * partitioned by it, so naming it prunes the lookup to one partition.
 */
export function holdLockScope(
  source: Pick<TxnHoldPayload, "txhCompanyId" | "txhBranchId" | "txhAccYear">,
): TxnHoldLockScope {
  return {
    txhCompanyId: source.txhCompanyId,
    txhBranchId: source.txhBranchId,
    ...(source.txhAccYear ? { txhAccYear: source.txhAccYear } : {}),
  };
}
/**
 * The document a saved quotation closes its hold onto.
 *
 * `txh_converted_doc_id` is polymorphic — no foreign key — and there is no
 * converted doc TYPE to send: a hold becomes the document it was parked as, so
 * the stored `txh_doc_type` already names the table. The document's own
 * accounting year does travel with the id, because a March hold can become an
 * April document and `ck_txh_converted_block` wants the whole trail together.
 */
export function holdConversionOf(
  document: { sqId: string; sqAccYear: string; quoteRefno: string | null },
  actor: SaveActor,
): TxnHoldConversion {
  return {
    txhConvertedDocId: document.sqId,
    txhConvertedAccYear: document.sqAccYear,
    txhConvertedRefno: toNullableText(document.quoteRefno, 100),
    txhConvertedBy: actor.userId || null,
  };
}
/**
 * Whether the lease on a hold is still good.
 *
 * A lease ENDS — `txh_lock_expires_on` is written with every lock and checked on
 * every resume — so a cart whose holder died mid-edit becomes resumable on its
 * own, with no take-over. A LOCKED row with no end recorded cannot happen
 * (`ck_txh_lock_block`), and is read as live rather than as free if it ever does.
 */
export function holdLeaseIsLive(hold: TxnHoldPayload, now: Date = new Date()): boolean {
  if (!hold.txhLockExpiresOn) {
    return true;
  }
  const expires = new Date(hold.txhLockExpiresOn);
  return Number.isNaN(expires.getTime()) || expires.getTime() > now.getTime();
}
/**
 * Somebody has this cart open — a live lease (`LOCKED`), or a `RESUMED` row left
 * by a client that drove the status through the CRUD route. A LAPSED lease is
 * not in use: the server hands that cart to the next device that asks.
 */
export function isHoldInUse(hold: TxnHoldPayload, now: Date = new Date()): boolean {
  if (!(HOLD_IN_USE_STATUSES as readonly string[]).includes(hold.txhStatus)) {
    return false;
  }
  return hold.txhStatus !== "LOCKED" || holdLeaseIsLive(hold, now);
}
/**
 * Who is on the cart, for the picker's "In use — …" line.
 *
 * `txh_locked_device_id` is the authority — the lease is held by a DEVICE. A row
 * driven to `RESUMED` through the CRUD route has none and recorded the *user* in
 * `txh_resumed_by` instead, so that stands in, and a row with neither still
 * reads as in use rather than as free.
 */
export function holdHolderLabel(hold: TxnHoldPayload): string {
  const holder = (hold.txhLockedDeviceId ?? hold.txhLockedBy ?? hold.txhResumedBy ?? "").trim();
  return holder || "another device";
}
/**
 * What to tell the operator when a lease transition is refused.
 *
 * The three the server distinguishes, and they mean genuinely different things:
 * 409 — somebody else has it, or it is finished with; 403 — this device is not
 * the holder, so the lease is not its to spend; 404 — the row is gone. The
 * server's own message names the device holding it, so it is preferred over
 * anything invented here.
 */
export function holdLockMessage(error: unknown, holdNo: string): string {
  const status = (error as { status?: number } | null)?.status;
  const served = serverMessageOf(error);
  if (status === 409) {
    return served || `Hold ${holdNo} is already open on another device.`;
  }
  if (status === 403) {
    return served || `Hold ${holdNo} is open on another device — take it over to continue here.`;
  }
  if (status === 404) {
    return `Hold ${holdNo} no longer exists — it was discarded from the held list.`;
  }
  return served || `Hold ${holdNo} could not be updated.`;
}
function serverMessageOf(error: unknown): string {
  const data = (error as { data?: { message?: unknown } } | null)?.data;
  return typeof data?.message === "string" ? data.message.trim() : "";
}
