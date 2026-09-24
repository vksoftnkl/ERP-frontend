/**
 * Money, in integer paise.
 *
 * Every figure on this screen is a preview of one the server will recompute,
 * and the post is refused if the two disagree by a paisa. Doubles cannot
 * promise that: the Qt screen summed in `double` with a 0.005 tolerance, which
 * works until forty bills each leave half a paisa behind and the identity is
 * 0.02 out with nothing visibly wrong on the screen.
 *
 * So `domain/` sums in integer paise and converts only at its edges — `parse`
 * on the way in, the payload builders on the way out. Nothing outside
 * `domain/` needs these; the grids hold rupees, because that is what the
 * server sends and what the operator types.
 */

/** Rupees → paise, rounded half-up. Non-finite input is zero, never NaN. */
export function toPaise(rupees: number | null | undefined): number {
  const value = Number(rupees);
  if (!Number.isFinite(value)) {
    return 0;
  }
  // `Math.round` is half-up for positives, and every amount here is positive by
  // constraint (`ck_av_amount`, `ck_abl_amount`). The epsilon absorbs the
  // classic 1.005 × 100 = 100.49999999999999 case.
  return Math.round(value * 100 + (value >= 0 ? 1e-6 : -1e-6));
}

/** Paise → rupees, as a number with two decimals of meaning. */
export function toRupees(paise: number): number {
  return paise / 100;
}

/** A rupee figure rounded to the paise the server would store. */
export function roundMoney(rupees: number): number {
  return toRupees(toPaise(rupees));
}

export function sumPaise(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** Σ of a rupee-valued field, in paise. */
export function sumOf<T>(rows: readonly T[], pick: (row: T) => number): number {
  return rows.reduce((total, row) => total + toPaise(pick(row)), 0);
}

/**
 * Indian-format money for the screen. Zero renders BLANK, not `0.00`: forty
 * rows of `0.00` bury the three figures that matter.
 */
export function formatMoney(rupees: number | null | undefined): string {
  if (rupees === null || rupees === undefined || !Number.isFinite(Number(rupees))) {
    return "";
  }
  return Number(rupees).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** The same, but a zero is shown. For totals, where blank would read as broken. */
export function formatTotal(rupees: number | null | undefined): string {
  return formatMoney(Number(rupees) || 0);
}
