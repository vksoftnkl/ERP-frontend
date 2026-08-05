/**
 * Quotation Entry — parking a cart in `public.transaction_hold` and pulling it
 * back (F9 / F10).
 *
 * A hold is NOT a quotation: nothing is written to `sale_quotation`, no voucher
 * number is allocated and no stock is touched. The row carries a summary the
 * held list renders from (`thCustomerName` / `thItemCount` / `thTotalQty` /
 * `thTotalAmount`) plus the whole screen as JSONB in `th_ui_state`, which the
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
 * is also what keeps another screen's `SALE_ORDER` holds out of the picker (see
 * `QUOTATION_HOLD_DOC_TYPE` for why the two share a document type at all).
 */
import type { DocumentPricing } from "@/domain/pricing";
import {
  DEFAULT_HOLD_DEVICE_TYPE,
  HOLD_DEVICE_TYPES,
  HOLD_NO_MAX_LENGTH,
  HOLD_NO_PREFIX,
  HOLD_UI_STATE_KIND,
  HOLD_UI_STATE_SCREEN,
  HOLD_UI_STATE_VERSION,
  QUOTATION_HOLD_DOC_TYPE,
  type HoldDeviceType,
} from "./quotation.constants";
import type { SaveActor } from "./quotation.payload";
import { buildSavePayload } from "./quotation.payload";
import type {
  QuotationDraft,
  SaveQuotationDto,
  SaveTransactionHoldDto,
  TransactionHoldPayload,
} from "./quotation.types";
import { toNullableText, toNumber } from "./quotation.utils";
/** What this screen writes into `th_ui_state`, and the only shape it reads back. */
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
/**
 * `th_acc_year` is a SMALLINT holding the fiscal year's STARTING year, while the
 * draft carries `sq_acc_year`'s `char(9)` form (`"2026-2027"`). The leading four
 * digits are the conversion; a year the draft never resolved yields `null` and
 * the caller refuses the hold rather than parking it under a wrong year, which
 * is immutable once written.
 */
export function holdAccYearOf(accYear: string): number | null {
  const match = /^(\d{4})/.exec((accYear ?? "").trim());
  if (!match) {
    return null;
  }
  const year = Number.parseInt(match[1], 10);
  return year >= 1 && year <= 32767 ? year : null;
}
/**
 * `ck_th_device_type` is a closed set of three. The session's stored
 * `device_type` is free text written by whatever logged in, so it only narrows
 * the browser default when it actually names one of them.
 */
export function holdDeviceTypeOf(value: string | null | undefined): HoldDeviceType {
  const upper = (value ?? "").trim().toUpperCase();
  return (HOLD_DEVICE_TYPES as readonly string[]).includes(upper)
    ? (upper as HoldDeviceType)
    : DEFAULT_HOLD_DEVICE_TYPE;
}
/**
 * The envelope, if this row is one of ours.
 *
 * Anything else — another screen's hold, a row written before this version, a
 * `th_ui_state` that is null because the hold was created by hand — reads as
 * `null` rather than as a half-restorable cart.
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
export function isQuotationHold(hold: TransactionHoldPayload): boolean {
  return readHoldUiState(hold.thUiState) !== null;
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
  hold: TransactionHoldPayload,
  state: QuotationHoldUiState,
): QuotationDraft {
  return {
    ...state.draft,
    mode: "entry",
    pricing: "live",
    isDirty: false,
    storedPricing: null,
    holdId: hold.thId,
    holdNo: hold.thHoldNo,
  };
}
export type BuildHoldOptions = {
  /** Present → update that hold; absent → create one. */
  holdId?: string | null;
  /** Required on create, and left alone on update (the stored one stands). */
  holdNo?: string;
  now?: Date;
};
/**
 * The `POST /transaction-holds/create` body for the cart on screen.
 *
 * Create and update are one route, and the two differ by more than `thId`: the
 * company / branch / accounting-year scope is immutable server-side, so an
 * update deliberately does not resend it (a resend of the *same* values is
 * accepted, but there is nothing to gain by risking the comparison), and neither
 * is the hold number, which would re-run the uniqueness check for no reason.
 *
 * A resumed cart being parked again goes back to `HELD` — that is what makes
 * Hold idempotent rather than leaving a `RESUMED` row behind and creating a
 * second one for the same cart.
 */
export function buildHoldPayload(
  draft: QuotationDraft,
  pricing: DocumentPricing,
  actor: SaveActor,
  options: BuildHoldOptions = {},
): SaveTransactionHoldDto {
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
  const summary: SaveTransactionHoldDto = {
    thDocType: QUOTATION_HOLD_DOC_TYPE,
    thHoldDate: now.toISOString(),
    thStatus: "HELD",
    thUserId: actor.userId || null,
    // `thSessionId` is deliberately NOT sent, even though the screen has a
    // session id to hand. The hold service checks it against
    // `audit.user_login_sessions.ulsId` — the row's primary key — while the id
    // the client holds is the JWT's `sid`, which login stores in the *other*
    // column (`ulsSessionId`). The two are different uuids on the same row, so
    // sending ours is a guaranteed 400 ("No active login session found with id
    // …"), not an occasional one. The quotation save gets away with sending it
    // because `sqSessionId` is written unvalidated.
    thCustomerName: toNullableText(draft.customer.name, 150),
    // The lines the payload actually carries, not the grid's rows: the trailing
    // blank one the grid always keeps open is not a line anybody parked.
    thItemCount: quotation.items?.length ?? 0,
    thTotalQty: toNumber(pricing.totals.totQty),
    // `ck_th_total_amount` — the parked total is gross and never negative, even
    // when a deduction-only cart prices below zero.
    thTotalAmount: Math.max(0, toNumber(pricing.totals.bill)),
    thRemarks: toNullableText(draft.terms.remarks, 255),
    thUiState: uiState as unknown as Record<string, unknown>,
    thModifiedBy: actor.userId || null,
  };
  if (options.holdId) {
    return { thId: options.holdId, ...summary };
  }
  return {
    ...summary,
    thCompanyId: draft.companyId,
    thBranchId: draft.branchId,
    // Guarded by the caller: `holdAccYearOf` returning null refuses the hold
    // outright, because the scope cannot be corrected after create.
    thAccYear: holdAccYearOf(draft.accYear) ?? undefined,
    thHoldNo: options.holdNo,
    thDeviceId: actor.deviceId ?? undefined,
    thDeviceType: holdDeviceTypeOf(actor.deviceType),
    thCreatedBy: actor.userId || null,
  };
}
/**
 * Mark a hold as pulled back onto this screen.
 *
 * `RESUMED` is not terminal, so the row survives the operator's session: a
 * browser that dies mid-edit leaves a recoverable hold rather than nothing. The
 * picker lists `HELD` only, which is what stops two operators resuming one cart.
 */
export function buildResumePayload(
  hold: TransactionHoldPayload,
  actor: SaveActor,
  now: Date = new Date(),
): SaveTransactionHoldDto {
  return {
    thId: hold.thId,
    thStatus: "RESUMED",
    thResumedBy: toNullableText(actor.userId, 50),
    thResumedAt: now.toISOString(),
    thResumeCount: (hold.thResumeCount ?? 0) + 1,
    thModifiedBy: actor.userId || null,
  };
}
/**
 * Close a hold that has become a real quotation.
 *
 * `CONVERTED` is terminal and the server enforces the pair: an id with no type
 * leaves the polymorphic reference unresolvable, and the status without both the
 * id and the instant is a 400. Nothing here is optional, so a save with no
 * document id must not call this.
 */
export function buildConvertedPayload(
  holdId: string,
  document: { sqId: string; quoteRefno: string | null },
  actor: SaveActor,
  now: Date = new Date(),
): SaveTransactionHoldDto {
  return {
    thId: holdId,
    thStatus: "CONVERTED",
    thConvertedDocType: QUOTATION_HOLD_DOC_TYPE,
    thConvertedDocId: document.sqId,
    thConvertedNo: toNullableText(document.quoteRefno, 30),
    thConvertedAt: now.toISOString(),
    thConvertedBy: toNullableText(actor.userId, 50),
    thModifiedBy: actor.userId || null,
  };
}