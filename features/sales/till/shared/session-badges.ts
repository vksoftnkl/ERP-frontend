/**
 * The session pills, one palette for every session grid — Till Sessions
 * (grid 144) and Business Day's sessions (grid 150) — so a value reads the
 * same everywhere (Qt c77f3f1 `TxnDocTypes::tillSessionBadges`).
 *
 * Three badge columns: `status_text` (the session), `treatment` (what its cash
 * gap became) and `cash_receipt` (notes 114: the hand-over waiting for a
 * supervisor's Approve Cash). Each treatment has its own hue so a gap's fate
 * reads at a glance; a closed session is the normal end, not a dimmed row.
 *
 * The buckets are Qt's `TxnBadgePalette::Bucket`; each screen maps them onto
 * its own pill classes.
 */

export type SessionBadgeBucket = "success" | "progress" | "neutral" | "warning" | "danger" | "locked";

/** The grid columns drawn as pills, by their SQL alias. */
export const SESSION_BADGE_COLUMNS = ["status_text", "treatment", "cash_receipt"] as const;

export type SessionBadgeColumn = (typeof SESSION_BADGE_COLUMNS)[number];

const BUCKETS: Record<string, SessionBadgeBucket> = {
  // status_text
  CLOSED: "success",
  OPEN: "progress",
  SUSPENDED: "neutral",
  COUNTING: "warning",
  "PENDING APPROVAL": "warning",
  VOIDED: "danger",
  // treatment
  "WITHIN TOL.": "success", // nothing to decide
  PENDING: "warning", // an undecided gap
  EXPENSE: "progress", // Cash Short & Excess
  SUSPENSE: "locked", // parked, a journal later
  RECOVER: "danger", // from the cashier
  RETENDERED: "neutral",
  // cash_receipt (notes 114)
  "TO APPROVE": "warning",
  APPROVED: "success",
  DIFFERENCE: "danger",
};

/** A pill's bucket by its text (case and `_` / space insensitive); null = not one of ours. */
export function sessionBadgeBucket(value: string | null | undefined): SessionBadgeBucket | null {
  const word = (value ?? "").trim().toUpperCase().replace(/_/g, " ");
  if (!word) return null;
  if (BUCKETS[word]) return BUCKETS[word];
  // WITHIN_TOLERANCE, WITHIN TOLERANCE …: the grid abbreviates, the API does not.
  if (word.startsWith("WITHIN")) return "success";
  return null;
}

export function isSessionBadgeColumn(field: string): field is SessionBadgeColumn {
  return (SESSION_BADGE_COLUMNS as readonly string[]).includes(field);
}
