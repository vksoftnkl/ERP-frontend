/**
 * Screen memory for the receipt (lib/screen-memory): a receipt left half-keyed
 * when the operator goes to another menu screen is still here when they come
 * back — the Qt MDI window that was simply still open.
 *
 * What is kept is UNSAVED WORK, and nothing else: a blank receipt, one being
 * browsed, and one just saved, posted, cancelled or deleted (each of which ends
 * in `NEW_DOCUMENT`) all reload from the server or have nothing to lose.
 *
 * The voucher helpers are generic over the draft because the payment screen is
 * this screen mirrored and keeps the same rules.
 *
 * Pure: no React, no network.
 */
import type { ScreenScope } from "@/lib/screen-memory";
import type { PartyHandoff } from "@/lib/navigation/party-handoff";
import type { TempCreditCollect } from "../domain/collect";
import type { ReceiptKeys } from "../receipt.types";
import type { ReceiptDraft } from "./draft";

/** The receipt's screen-memory slot. */
export const RECEIPT_MEMORY_KEY = "accounts/receipt";

/** What a voucher screen remembers: its draft, and whatever rides along with it. */
export type VoucherSnapshot<D> = { draft: D };

/**
 * The receipt's snapshot. The temp-credit mobile is not in the draft, but it
 * narrows the bills on screen — a collection brought back without it would
 * re-read every bill of the party on the next F6.
 */
export type ReceiptSnapshot = VoucherSnapshot<ReceiptDraft> & { tempCreditMobile: string };

/** Worth bringing back: anything the operator keyed and has not saved. */
export function isVoucherWorthRemembering(snapshot: VoucherSnapshot<{ dirty: boolean }>): boolean {
  return snapshot.draft.dirty;
}

/**
 * The tenant the voucher belongs to — its own, not the session's. A receipt
 * opened from another branch's register stays that branch's.
 */
export function voucherScopeOf(
  snapshot: VoucherSnapshot<{ header: { scope: ScreenScope } }>,
): ScreenScope {
  const { companyId, branchId, accYear } = snapshot.draft.header.scope;
  return { companyId, branchId, accYear };
}

/**
 * A write is out — one the server may still land after the screen has gone.
 * Loading is not: a read that lands late changes nothing anyone keyed.
 */
export function isVoucherWriteInFlight(busy: string): boolean {
  return busy === "saving" || busy === "posting" || busy === "cancelling" || busy === "deleting";
}

export type ReceiptView =
  | { screen: "list" }
  | {
      screen: "entry";
      keys?: ReceiptKeys;
      collect?: TempCreditCollect | null;
      party?: PartyHandoff | null;
      /** Reopened on the remembered receipt, not on an explicit Create / Open. */
      resume?: boolean;
    };

export const RESUME_RECEIPT_VIEW: ReceiptView = { screen: "entry", resume: true };

/**
 * Where the route opens.
 *
 * A remembered receipt is never written over unasked. The two hand-offs meet
 * it differently because the hook's own verbs do:
 *  - a COLLECTION opens over it: `collectTempCredit` asks before discarding
 *    unsaved work, and a No keeps the remembered receipt;
 *  - a report's PARTY is dropped: `pickParty` would graft the new party onto
 *    the remembered receipt's instruments without asking, so the operator
 *    finishes that one first and asks the report again.
 */
export function initialReceiptView(args: {
  collect: TempCreditCollect | null;
  party: PartyHandoff | null;
  remembered: boolean;
}): ReceiptView {
  const { collect, party, remembered } = args;
  if (collect) {
    return remembered ? { screen: "entry", collect, resume: true } : { screen: "entry", collect };
  }
  if (remembered) {
    return RESUME_RECEIPT_VIEW;
  }
  return party ? { screen: "entry", party } : { screen: "list" };
}
