/**
 * Money on this screen, in integer PAISE.
 *
 * The settlement routes send amounts as JSON numbers already rounded to two
 * places (`num()` in the service); the configured grids send PostgreSQL
 * NUMERIC as strings ("1236.72"). Both are brought to paise here, once, and
 * every sum the screen shows (fee + GST, the voucher's Dr / Cr totals, what the
 * import dialog reads off a sample) is integer arithmetic on those — never a
 * float added to a float. Display goes through the reports' Indian formatter.
 */
import { formatAmount } from "@/features/reports/shared/wire/money";

const DECIMAL = /^([+-]?)(\d*)(?:\.(\d*))?$/;

/** `"1,236.72"`, `1236.72`, `"-450"` → paise; anything that is not an amount → null. */
export function toPaise(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    const sign = value < 0 ? -1 : 1;
    // The server rounds to two places before it sends; this only removes the
    // binary noise (1236.72 * 100 = 123671.99999999999).
    return sign * Math.round(Math.abs(value) * 100);
  }
  if (typeof value !== "string") return null;
  const token = value.trim().replace(/,/g, "");
  const match = DECIMAL.exec(token);
  if (!match || (match[2] === "" && (match[3] ?? "") === "")) return null;
  const [, sign, integer, decimals = ""] = match;
  const whole = Number.parseInt(integer || "0", 10);
  const cents = Number.parseInt(decimals.padEnd(2, "0").slice(0, 2), 10);
  // Half away from zero on the third place, as the server's ROUND_HALF_UP.
  const roundUp = decimals.length > 2 && Number.parseInt(decimals[2], 10) >= 5 ? 1 : 0;
  const magnitude = whole * 100 + cents + roundUp;
  return sign === "-" && magnitude !== 0 ? -magnitude : magnitude;
}

/** As `toPaise`, with 0 for a blank / missing amount. */
export function paiseOf(value: unknown): number {
  return toPaise(value) ?? 0;
}

/** `123672` → `"1,236.72"`; `-45000` → `"-450.00"`. */
export function formatPaise(paise: number): string {
  const magnitude = Math.abs(Math.trunc(paise));
  const rupees = Math.floor(magnitude / 100);
  const cents = String(magnitude % 100).padStart(2, "0");
  const body = formatAmount(`${rupees}.${cents}`);
  return paise < 0 && magnitude !== 0 ? `-${body}` : body;
}

/** A wire amount as the screen shows it; blank when there is no amount at all. */
export function formatMoney(value: unknown): string {
  const paise = toPaise(value);
  return paise === null ? "" : formatPaise(paise);
}

export function sumPaise(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/**
 * A line the provider paid at another amount than our row (Qt: |amountDiff| >
 * 0.004 — the server sends the difference rounded to paise, so any non-zero
 * paise is the same test).
 */
export function isPartialDiff(diffPaise: number): boolean {
  return diffPaise !== 0;
}
