/**
 * What may be done to a cheque, by where it stands.
 *
 *     HELD ─ deposit ─▶ DEPOSITED ─ clear  ─▶ CLEARED
 *      │                    └────── bounce ─▶ BOUNCED ─ re-present ─▶ DEPOSITED
 *      │                                         └──── replace ─────▶ REPLACED
 *      ├─ return / cancel ─▶ RETURNED | CANCELLED
 *      └─ replace ─────────▶ REPLACED
 *
 * The SERVER owns this rule: every route re-checks it and answers 409 with a
 * sentence naming the cheque. The client greys what the map forbids only
 * because offering a button that is guaranteed to fail is worse than not
 * offering it.
 *
 * What this map deliberately does NOT know (plan §5.2): a replacement cheque
 * is HELD with no tender row, and `/return` and `/replace` refuse it. The map
 * offers both anyway. Guessing which HELD rows are replacements would build a
 * bug into the client that outlives the server fix — the call goes, and the
 * server's sentence is shown.
 */
import type { ChequeStatus } from "./types";

export const CHEQUE_VERBS = [
  "deposit",
  "clear",
  "bounce",
  "represent",
  "replace",
  "return",
  "printSlip",
  "history",
] as const;
export type ChequeVerb = (typeof CHEQUE_VERBS)[number];

/** The verbs that WRITE — gated by `canEdit`. */
export const WRITING_VERBS: readonly ChequeVerb[] = [
  "deposit",
  "clear",
  "bounce",
  "represent",
  "replace",
  "return",
];

/**
 * The only verb that takes more than one cheque. A deposit slip is a piece of
 * paper listing several; every other verb is one cheque's story.
 */
export const BULK_VERBS: readonly ChequeVerb[] = ["deposit"];

const BY_STATUS: Record<string, readonly ChequeVerb[]> = {
  HELD: ["deposit", "replace", "return", "history"],
  DEPOSITED: ["clear", "bounce", "printSlip", "history"],
  BOUNCED: ["represent", "replace", "printSlip", "history"],
  // Reprinting a cleared cheque's slip is routine — the bank asks for it.
  CLEARED: ["printSlip", "history"],
  RETURNED: ["history"],
  CANCELLED: ["history"],
  REPLACED: ["history"],
};

/**
 * What one status allows. A status this map has never heard of — one a later
 * migration adds — allows History only: safe, not permissive.
 */
export function allowedActions(status: ChequeStatus): readonly ChequeVerb[] {
  return BY_STATUS[String(status).trim().toUpperCase()] ?? ["history"];
}

/**
 * The verbs EVERY status in the set allows — the intersection.
 *
 * Two deposited cheques and one held share nothing but History, and that is
 * correct: a bulk deposit that silently skipped the deposited ones would leave
 * the operator believing all three went to the bank. An empty set allows
 * nothing at all, History included.
 */
export function allowedForAll(statuses: readonly ChequeStatus[]): ChequeVerb[] {
  if (statuses.length === 0) {
    return [];
  }
  const [first, ...rest] = statuses;
  return allowedActions(first).filter((verb) =>
    rest.every((status) => allowedActions(status).includes(verb)),
  );
}

/**
 * What the TARGET SET allows: the intersection, then the multiplicity rule.
 * More than one cheque keeps only the bulk verbs — History of three cheques
 * at once means nothing, and neither does bouncing three.
 */
export function allowedForTargets(statuses: readonly ChequeStatus[]): ChequeVerb[] {
  const shared = allowedForAll(statuses);
  return statuses.length > 1 ? shared.filter((verb) => BULK_VERBS.includes(verb)) : shared;
}

/**
 * Why a finished cheque offers nothing but a look — or null when it offers
 * more than that.
 */
export function whyOnlyLooking(status: ChequeStatus): string | null {
  switch (String(status).trim().toUpperCase()) {
    case "CANCELLED":
      return "cancelled with its receipt — nothing further happens to it";
    case "RETURNED":
      return "returned to the party — nothing further happens to it";
    case "REPLACED":
      return "replaced by another cheque, which carries it now";
    case "CLEARED":
      return "cleared and settled — only its slip can be reprinted";
    default: {
      const allowed = allowedActions(status);
      return allowed.length === 1 && allowed[0] === "history"
        ? `${String(status).trim() || "an unknown status"} — this screen does not act on it; its history can still be read`
        : null;
    }
  }
}

export const MIXED_TICK_SENTENCE =
  "these are in different states and share no action — tick rows that are all at the same stage";

export type BarPermissions = {
  canEdit: boolean;
  canPrint: boolean;
  /** Still loading: rendered read-only, but not reported as a refusal. */
  loading: boolean;
};

export type BarLine = {
  text: string;
  /** `reason` is amber — the bar is (partly) dead and this says why. */
  tone: "info" | "reason";
};

/**
 * The one line under the action bar: a description of what is selected, or
 * the reason nothing can be done to it. Seven greyed buttons are not a
 * message.
 *
 * Precedence, loudest first:
 *   1. permissions — `/user-administration/create` REPLACES a user's menu
 *      array, so a save made to grant one menu can silently revoke this one;
 *      without the line, the only way to find out was to read `user_menus`;
 *   2. a finished cheque (`whyOnlyLooking`);
 *   3. a mixed tick that shares no verb.
 */
export function explainBar(
  statuses: readonly ChequeStatus[],
  permissions: BarPermissions,
  description: string,
): BarLine {
  if (statuses.length === 0) {
    return { text: description || "Nothing selected.", tone: "info" };
  }
  const allowed = allowedForTargets(statuses);
  if (!permissions.loading) {
    const wantsWrite = allowed.some((verb) => WRITING_VERBS.includes(verb));
    if (!permissions.canEdit && (wantsWrite || !permissions.canPrint)) {
      return { text: "read-only — your login may not act on cheques", tone: "reason" };
    }
    if (!permissions.canPrint && allowed.includes("printSlip") && !wantsWrite) {
      return { text: "read-only — your login may not print", tone: "reason" };
    }
  }
  if (statuses.length === 1) {
    const why = whyOnlyLooking(statuses[0]);
    if (why) {
      return { text: `${description ? `${description}: ` : ""}${why}`, tone: "reason" };
    }
  }
  if (statuses.length > 1 && allowed.length === 0) {
    return { text: MIXED_TICK_SENTENCE, tone: "reason" };
  }
  return { text: description, tone: "info" };
}
