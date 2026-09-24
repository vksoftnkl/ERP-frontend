/**
 * Operator words for the two coded columns, with the colour still keyed off
 * the RAW value.
 *
 * Two defaults of the shared badge palette were wrong here and are overridden
 * on purpose:
 *
 *  - BOUNCED fell into the palette's "danger" bucket, which DIMS the row and
 *    STRIKES it through. That is the row that most needs action on the whole
 *    screen: red, yes; dead, no.
 *  - DEPOSITED and REPLACED were in no bucket at all and got an arbitrary
 *    hashed colour.
 */
import type { ChequeStatus, DueBucket } from "./types";

export type Tone = "amber" | "blue" | "red" | "green" | "grey" | "slate";

export type Pill = {
  label: string;
  tone: Tone;
  /** Finished paper: shown quieter. Never set for BOUNCED. */
  dimmed: boolean;
};

const STATUS_PILLS: Record<string, Pill> = {
  HELD: { label: "In hand", tone: "amber", dimmed: false },
  DEPOSITED: { label: "With bank", tone: "blue", dimmed: false },
  BOUNCED: { label: "Bounced", tone: "red", dimmed: false },
  CLEARED: { label: "Cleared", tone: "green", dimmed: false },
  RETURNED: { label: "Returned", tone: "grey", dimmed: true },
  CANCELLED: { label: "Cancelled", tone: "grey", dimmed: true },
  REPLACED: { label: "Replaced", tone: "grey", dimmed: false },
};

/** An unknown status is shown AS IT ARRIVED, never mapped to a default word. */
export function statusPill(status: ChequeStatus): Pill {
  const raw = String(status ?? "").trim().toUpperCase();
  return STATUS_PILLS[raw] ?? { label: raw.replace(/_/g, " ") || "—", tone: "grey", dimmed: false };
}

const BUCKET_PILLS: Record<DueBucket, Pill & { hint: string }> = {
  FUTURE: {
    label: "Post-dated",
    tone: "slate",
    dimmed: false,
    hint: "The date on the cheque has not arrived — banking it now brings it back",
  },
  DUE_TODAY: { label: "Due today", tone: "amber", dimmed: false, hint: "It can be banked today" },
  OVERDUE: {
    label: "Matured",
    tone: "green",
    dimmed: false,
    hint: "Its date has passed and it is not yet banked",
  },
  STALE: {
    label: "Stale",
    tone: "red",
    dimmed: false,
    hint: "More than three months old — a bank will refuse it; the party has to re-issue",
  },
};

export function bucketPill(bucket: DueBucket | null): (Pill & { hint: string }) | null {
  return bucket ? BUCKET_PILLS[bucket] : null;
}
