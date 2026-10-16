/**
 * Re-check a held cart's lease after the operator comes back to a screen that
 * was showing it (see `lib/screen-memory`).
 *
 * The lease lives on the server (`txh_lock_expires_on`) and the client never
 * renews it, so it can lapse — or another device can take the cart over — while
 * the screen is gone. The `lockedHold` ref the screen kept is gone too. So the
 * hold is read back, and:
 *   - still LOCKED to this device with a live lease → the ref is rebuilt;
 *   - free, or the lease lapsed                     → the lease is taken again;
 *   - converted, discarded, or in use elsewhere     → the cart is detached: the
 *     bill carries on as an ordinary new one, so saving it can never convert a
 *     cart another counter is working on;
 *   - the read itself failed (network)              → nothing changes.
 */
import { HOLD_LIVE_STATUSES } from "@/features/sales/quotation/quotation.constants";
import {
  holdLeaseIsLive,
  holdLockMessage,
  holdLockScope,
  isHoldInUse,
} from "@/features/sales/quotation/quotation.hold";
import type { TxnHoldLockScope, TxnHoldPayload } from "@/features/sales/quotation/quotation.types";

export type HeldLease = {
  txhId: string;
  holdNo: string;
  scope: TxnHoldLockScope;
};

export type HoldLeaseDecision = "held" | "retake" | "closed" | "taken";

/** What to do with a hold this device had resumed, judged from its row as read now. */
export function decideHoldLease(
  hold: TxnHoldPayload,
  deviceMasterId: string,
  now: Date = new Date(),
): HoldLeaseDecision {
  if (hold.txhConvertedDocId || !(HOLD_LIVE_STATUSES as readonly string[]).includes(hold.txhStatus)) {
    return "closed";
  }
  if (
    hold.txhStatus === "LOCKED" &&
    hold.txhLockedDeviceId === deviceMasterId &&
    holdLeaseIsLive(hold, now)
  ) {
    return "held";
  }
  return isHoldInUse(hold, now) ? "taken" : "retake";
}

export type HoldLeaseOutcome =
  | { kind: "held"; lease: HeldLease }
  | { kind: "lost"; message: string }
  | { kind: "unverified" };

function statusOf(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : undefined;
}

/** A refusal that means the cart is not ours any more — anything else may be transient. */
function isLeaseRefusal(error: unknown): boolean {
  const status = statusOf(error);
  return status === 403 || status === 404 || status === 409;
}

export async function verifyHoldLease(args: {
  txhId: string;
  holdNo: string;
  deviceMasterId: string | null | undefined;
  readHold: (txhId: string) => Promise<TxnHoldPayload>;
  retake: (lock: { txhId: string; deviceId: string; scope: TxnHoldLockScope }) => Promise<unknown>;
  /** What the operator calls the document — "bill", "quotation". */
  noun?: string;
  now?: Date;
}): Promise<HoldLeaseOutcome> {
  const { txhId, holdNo, deviceMasterId, readHold, retake, noun = "bill" } = args;
  if (!deviceMasterId) {
    return { kind: "unverified" };
  }
  let hold: TxnHoldPayload;
  try {
    hold = await readHold(txhId);
  } catch (error) {
    return isLeaseRefusal(error)
      ? { kind: "lost", message: `${holdLockMessage(error, holdNo)} This ${noun} continues without it.` }
      : { kind: "unverified" };
  }
  const shownNo = hold.txhHoldNo || holdNo;
  const scope = holdLockScope(hold);
  switch (decideHoldLease(hold, deviceMasterId, args.now)) {
    case "held":
      return { kind: "held", lease: { txhId, holdNo: shownNo, scope } };
    case "closed":
      return {
        kind: "lost",
        message: `Hold ${shownNo} was already closed while you were away. This ${noun} continues as a new one.`,
      };
    case "taken":
      return {
        kind: "lost",
        message: `Hold ${shownNo} is now open on another device. This ${noun} continues without it.`,
      };
    case "retake":
    default:
      try {
        await retake({ txhId, deviceId: deviceMasterId, scope });
        return { kind: "held", lease: { txhId, holdNo: shownNo, scope } };
      } catch (error) {
        return isLeaseRefusal(error)
          ? { kind: "lost", message: `${holdLockMessage(error, shownNo)} This ${noun} continues without it.` }
          : { kind: "unverified" };
      }
  }
}
