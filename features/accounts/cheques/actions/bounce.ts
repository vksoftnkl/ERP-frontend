/**
 * Bounce (single) → `POST /cheques/bounce`. The bank sent it back.
 *
 * The server writes one ChqBnc voucher with up to five legs, reverses every
 * settlement the cheque made, unwinds any advance it funded and raises a
 * `BNC/<no>` JOURNAL bill for the party charge. The client sends a date, a
 * reason and two numbers, and computes NONE of that.
 *
 * ── The field names are not the column names ─────────────────────────────
 * `reason`, `bankCharge`, `partyCharge` — NOT `bounceReason` /
 * `bounceCharges`, which the `apd_bounce_*` columns suggest. A wrong name is a
 * 400, and a caller that does not read the response leaves the cheque
 * DEPOSITED, which reads exactly like a product bug. Both charges are
 * REQUIRED: 0 is sent, never omitted.
 *
 * ── Two different numbers ────────────────────────────────────────────────
 *   bankCharge  — what the bank took off US. An expense (DR BANK_CHARGES).
 *   partyCharge — what WE charge the party. Income, and a bill they now owe.
 */
import { describe, formatAmount, formatDate } from "../domain/chequeRow";
import { first, oneRow, optional, parseAmount, pastDate, tooLong, type ActionSpec } from "./types";

export type BounceForm = {
  bounceDate: string;
  reason: string;
  /** What the bank actually wrote, behind a reason like "Other". */
  reasonText: string;
  bankCharge: string;
  partyCharge: string;
};

/**
 * The fallback pre-fill when `accounts.bounce_reasons` cannot be read. A
 * PRE-FILL, not a whitelist — banks return cheques for reasons no list
 * anticipates, and the server accepts any non-blank reason.
 */
export const DEFAULT_BOUNCE_REASONS: readonly string[] = [
  "Funds insufficient",
  "Payment stopped by drawer",
  "Signature differs",
  "Account closed",
  "Post-dated presented early",
  "Stale",
  "Other",
];

/** `accounts.bounce_reasons` is a JSON list stored as TEXT. */
export function parseBounceReasons(raw: string | null | undefined): string[] {
  if (!raw || !raw.trim()) {
    return [...DEFAULT_BOUNCE_REASONS];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const reasons = parsed
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter((entry) => entry.length > 0);
      if (reasons.length > 0) {
        return reasons;
      }
    }
  } catch {
    // Not JSON — fall through to the seeded list.
  }
  return [...DEFAULT_BOUNCE_REASONS];
}

function charge(label: string, value: string): string | null {
  if (!value.trim()) {
    return null;
  }
  const amount = parseAmount(value);
  if (Number.isNaN(amount)) {
    return `${label} is not a number.`;
  }
  return amount < 0 ? `${label} cannot be negative.` : null;
}

/** A blank charge is 0 — and 0 is SENT. */
function chargeValue(value: string): number {
  const amount = parseAmount(value);
  return Number.isNaN(amount) ? 0 : Math.round(amount * 100) / 100;
}

export const bounceSpec: ActionSpec<BounceForm> = {
  id: "bounce",
  endpoint: "/cheques/bounce",
  verb: () => "Bounce cheque",
  initial: (_rows, today) => ({
    bounceDate: today,
    reason: "",
    reasonText: "",
    bankCharge: "",
    partyCharge: "",
  }),
  build: (rows, form) => ({
    apdId: rows[0]?.apdId ?? "",
    apdAccYear: rows[0]?.accYear ?? "",
    apdCompanyId: rows[0]?.companyId ?? "",
    apdBranchId: rows[0]?.branchId ?? "",
    bounceDate: form.bounceDate,
    reason: form.reason.trim(),
    ...optional("reasonText", form.reasonText),
    bankCharge: chargeValue(form.bankCharge),
    partyCharge: chargeValue(form.partyCharge),
  }),
  validate: (rows, form, today) => {
    const row = rows[0];
    return first([
      oneRow(rows),
      pastDate("bounce date", form.bounceDate, today),
      row?.depositDate && form.bounceDate < row.depositDate
        ? `Bounce ${row.instrumentNo} on or after ${formatDate(row.depositDate)}, the day it was deposited.`
        : null,
      form.reason.trim() ? null : "Give the reason the bank returned it.",
      tooLong("reason", form.reason, 150),
      tooLong("bank's wording", form.reasonText, 500),
      charge("What the bank charged us", form.bankCharge),
      charge("What we charge the party", form.partyCharge),
    ]);
  },
  confirm: (rows, form) => {
    const row = rows[0];
    const bank = chargeValue(form.bankCharge);
    const party = chargeValue(form.partyCharge);
    const effects = [
      row?.postingMode === "ON_CLEARING"
        ? "nothing was settled when it was taken, so no bill reopens"
        : "the bills it settled reopen",
      bank > 0 ? `the bank's ${formatAmount(bank)} goes to bank charges` : null,
      party > 0 ? `the party is billed ${formatAmount(party)}` : null,
    ].filter(Boolean);
    return `${row ? describe(row) : "The cheque"} bounces on ${formatDate(form.bounceDate)}: ${effects.join(", ")}.`;
  },
};
