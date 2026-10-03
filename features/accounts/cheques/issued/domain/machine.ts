/**
 * What may be done to one of OUR cheques, by where it stands.
 *
 *     HELD ─ presented ─▶ CLEARED                 (no voucher: posted when written)
 *      ├──── returned ──▶ BOUNCED   ─┐            (a ChqBnc takes its line back out)
 *      ├──── stop ──────▶ CANCELLED ─┤
 *      ├──── void ──────▶ CANCELLED ─┤
 *      └──── replace ───▶ REPLACED   └─ replace ─▶ REPLACED (+ a new HELD leaf
 *                                                   on a new Payment Voucher)
 *
 * The SERVER owns this rule and answers 409 with a sentence naming the cheque;
 * the client greys what is guaranteed to fail, nothing more.
 *
 * One refinement the status alone cannot make: a BOUNCED or CANCELLED cheque
 * can be replaced only if a reversal voucher took its line back out. A leaf
 * cancelled by the PAYMENT's own cancel or amend has none — the payment itself
 * was undone — and the server refuses it ("nothing to pay again"). That is
 * known only from `/get`, so Replace waits for the detail on those rows.
 *
 * There is no bulk verb on this side: every move is one cheque's story.
 */
import type { IssuedChequePayload, IssuedStatus } from "../issued.types";

export const ISSUED_VERBS = [
  "presented",
  "returned",
  "stop",
  "void",
  "replace",
  "history",
  "openVoucher",
] as const;
export type IssuedVerb = (typeof ISSUED_VERBS)[number];

/** The verbs that write — each a POST to `/issued-cheques/<verb>`. */
export type IssuedWritingVerb = Exclude<IssuedVerb, "history" | "openVoucher">;
export const ISSUED_WRITING_VERBS: readonly IssuedWritingVerb[] = [
  "presented",
  "returned",
  "stop",
  "void",
  "replace",
];

const BY_STATUS: Record<string, readonly IssuedVerb[]> = {
  HELD: ["presented", "returned", "stop", "void", "replace", "history"],
  BOUNCED: ["replace", "history"],
  CANCELLED: ["replace", "history"],
  CLEARED: ["history"],
  REPLACED: ["history"],
};

/** What one status allows. An unknown status allows History only. */
export function issuedAllowed(status: IssuedStatus): readonly IssuedVerb[] {
  return BY_STATUS[String(status).trim().toUpperCase()] ?? ["history"];
}

export type ReplaceReadiness = "ready" | "waiting" | "noReversal";

/**
 * Whether Replace can go for this row, given its detail (if loaded).
 * A HELD cheque is stopped first by the replace itself, so it is always ready.
 */
export function replaceReadiness(
  status: IssuedStatus,
  detail: Pick<IssuedChequePayload, "apdId" | "reversalVoucherId"> | null,
): ReplaceReadiness {
  const raw = String(status).trim().toUpperCase();
  if (raw === "HELD") {
    return "ready";
  }
  if (!detail) {
    return "waiting";
  }
  return detail.reversalVoucherId ? "ready" : "noReversal";
}

/** The verbs the row allows once the detail has had its say. */
export function issuedAllowedFor(
  status: IssuedStatus,
  detail: Pick<IssuedChequePayload, "apdId" | "reversalVoucherId"> | null,
): IssuedVerb[] {
  const allowed = issuedAllowed(status).filter(
    (verb) => verb !== "replace" || replaceReadiness(status, detail) === "ready",
  );
  return allowed;
}

/** Why a row offers nothing but a look — or null when it offers more. */
export function issuedWhyOnlyLooking(
  status: IssuedStatus,
  detail: Pick<IssuedChequePayload, "apdId" | "reversalVoucherId"> | null,
): string | null {
  const raw = String(status ?? "").trim().toUpperCase();
  switch (raw) {
    case "":
      return "no status on this row — the register did not send one";
    case "CLEARED":
      return "presented and paid — nothing further happens to it";
    case "REPLACED":
      return "replaced by another leaf, which carries it now";
    case "BOUNCED":
    case "CANCELLED": {
      const readiness = replaceReadiness(raw, detail);
      if (readiness === "noReversal") {
        return "cancelled with its payment — nothing was reversed, so there is nothing to pay again";
      }
      return readiness === "waiting" ? "reading whether it can be replaced…" : null;
    }
    default:
      return issuedAllowed(raw).length === 1
        ? `${raw} — this screen does not act on it; its history can still be read`
        : null;
  }
}

/**
 * Stop and void both land on CANCELLED; the reason's prefix is the only thing
 * that tells them apart.
 */
export function cancelKind(cancelReason: string | null | undefined): "stopped" | "voided" | "replaced" | null {
  const raw = (cancelReason ?? "").trim().toUpperCase();
  if (raw.startsWith("STOPPED:")) {
    return "stopped";
  }
  if (raw.startsWith("VOIDED:")) {
    return "voided";
  }
  if (raw.startsWith("REPLACED:")) {
    return "replaced";
  }
  return null;
}
