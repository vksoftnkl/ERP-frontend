/**
 * Decimal helpers for the pricing engine.
 *
 * Postgres stores money as `numeric(15,2)`; JS numbers are doubles. Every
 * intermediate step inside the engine runs through `decimal.js-light` and only
 * crosses back to `number` where a value is *stored* — a grid cell, a payload
 * field, a total. Rounding happens where the Qt client rounds:
 *
 *   | value                                 | dp | why                                      |
 *   |---------------------------------------|----|------------------------------------------|
 *   | currency cells                        |  2 | matches the Qt `NexTable` Currency cell  |
 *   | `rateBeforeTax`, `netPriceBeforeTax`  | 12 | divisors, not amounts — Qt keeps these   |
 *   |                                       |    | as `Number`, not `Currency`              |
 *   | `marginPerc`, `mrpSavingsPerc`,       |  2 | persisted, so the cell, the print and    |
 *   | per-line `savingsPerc`                |    | the stored column must agree             |
 */
import DecimalBase from "decimal.js-light";
/**
 * A private constructor so the engine's precision/rounding cannot be disturbed
 * by another consumer of the shared `decimal.js-light` global (recharts pulls
 * the same package in).
 */
export const Decimal = DecimalBase.clone({
  precision: 34,
  rounding: DecimalBase.ROUND_HALF_UP,
  toExpNeg: -30,
  toExpPos: 30,
});
export type Dec = InstanceType<typeof Decimal>;
/** Decimal places for a stored currency amount. */
export const MONEY_DP = 2;
/**
 * Decimal places for a rate that is used as a *divisor* downstream. Rounding
 * these to 2 dp is what makes a bill fail to reconcile with its own lines.
 */
export const RATE_DP = 12;
/** Decimal places for a persisted percentage. */
export const PERC_DP = 2;
export const ZERO: Dec = new Decimal(0);
/**
 * Coerce anything the API or a grid cell can hand us into a Decimal. Blank,
 * null and unparseable input is 0 — a quotation line with an empty rate cell is
 * an ordinary state, not an error.
 */
export function dec(value: unknown): Dec {
  if (value instanceof Decimal) {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? new Decimal(value) : ZERO;
  }
  if (typeof value === "bigint") {
    return new Decimal(value.toString());
  }
  if (typeof value === "string") {
    const trimmed = value.trim().replace(/,/g, "");
    if (!trimmed) {
      return ZERO;
    }
    try {
      // Throws `[DecimalError] Invalid argument` on anything unparseable, and
      // on Infinity / NaN — all of which mean "empty cell" here.
      return new Decimal(trimmed);
    } catch {
      return ZERO;
    }
  }
  return ZERO;
}
function toDp(value: Dec, dp: number): number {
  const rounded = value.toDecimalPlaces(dp, Decimal.ROUND_HALF_UP).toNumber();
  // -0 round-trips through JSON as -0 and prints as "-0.00"; normalise it away.
  return rounded === 0 ? 0 : rounded;
}
/** Round to a stored currency amount. */
export function money(value: Dec | number): number {
  return toDp(dec(value), MONEY_DP);
}
/** Round to a stored rate (12 dp — safe to divide by). */
export function rate(value: Dec | number): number {
  return toDp(dec(value), RATE_DP);
}
/** Round to a stored percentage. */
export function perc(value: Dec | number): number {
  return toDp(dec(value), PERC_DP);
}
/** `numerator / denominator`, or 0 when the denominator is 0. */
export function safeDiv(numerator: Dec, denominator: Dec): Dec {
  return denominator.isZero() ? ZERO : numerator.div(denominator);
}
/** `part / whole * 100`, or 0 when `whole` is 0. */
export function percentOf(part: Dec, whole: Dec): Dec {
  return safeDiv(part, whole).times(100);
}
export function sum(values: Dec[]): Dec {
  return values.reduce<Dec>((acc, value) => acc.plus(value), ZERO);
}
/**
 * Move an amount onto a rounding step, the way the Qt client rounds a bill:
 * `floor((amount + step/2) / step) * step`. A step of 0 (or less) means no
 * rounding at all.
 */
export function roundToStep(amount: Dec, step: number): Dec {
  const stepDec = dec(step);
  if (stepDec.lte(0)) {
    return amount;
  }
  return amount
    .plus(stepDec.div(2))
    .div(stepDec)
    .toDecimalPlaces(0, Decimal.ROUND_FLOOR)
    .times(stepDec);
}