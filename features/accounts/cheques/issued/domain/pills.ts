/**
 * Operator words for an issued cheque's status and state, with the colour
 * keyed off the RAW value — the received side's pill rules
 * (`../../domain/bucket.ts`), in the issued screen's words.
 *
 *  - BOUNCED ("Returned unpaid") is red but NOT dimmed: it is the row that most
 *    needs action on the screen.
 *  - CANCELLED (stopped / void) and REPLACED are finished paper, shown quieter.
 *  - The grid's `state` splits HELD into OUTSTANDING and POST-DATED.
 */
import type { Pill } from "../../domain/bucket";
import type { IssuedState, IssuedStatus } from "../issued.types";

const STATUS_PILLS: Record<string, Pill> = {
  HELD: { label: "Not presented", tone: "amber", dimmed: false },
  CLEARED: { label: "Presented", tone: "green", dimmed: false },
  BOUNCED: { label: "Returned unpaid", tone: "red", dimmed: false },
  CANCELLED: { label: "Stopped / void", tone: "grey", dimmed: true },
  REPLACED: { label: "Replaced", tone: "slate", dimmed: true },
};

const STATE_PILLS: Record<string, Pill & { hint?: string }> = {
  OUTSTANDING: {
    label: "Outstanding",
    tone: "amber",
    dimmed: false,
    hint: "Its date has come — the party can present it any day",
  },
  "POST-DATED": {
    label: "Post-dated",
    tone: "blue",
    dimmed: false,
    hint: "Dated after today — it cannot be presented yet",
  },
};

/** An unknown status is shown AS IT ARRIVED, never mapped to a default word. */
export function issuedStatusPill(status: IssuedStatus): Pill {
  const raw = String(status ?? "").trim().toUpperCase();
  return STATUS_PILLS[raw] ?? { label: raw.replace(/_/g, " ") || "—", tone: "grey", dimmed: false };
}

export function issuedStatePill(state: IssuedState): Pill & { hint?: string } {
  const raw = String(state ?? "").trim().toUpperCase();
  return STATE_PILLS[raw] ?? issuedStatusPill(raw);
}

export function issuedStatusLabel(status: IssuedStatus | null | undefined): string {
  return issuedStatusPill(status ?? "").label;
}
