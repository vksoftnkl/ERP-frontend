/**
 * The three component rates, mirrored client-side.
 *
 * `tax_cgst_perc` / `tax_sgst_perc` / `tax_igst_perc` are GENERATED ALWAYS
 * columns — the database computes them and rejects them on write. This exists so
 * the operator sees 18 become 9 + 9 as the rate is typed, before any save; the
 * stored value is authoritative on reload.
 *
 * The arithmetic mirrors the generation expressions exactly:
 *
 *     tax_cgst_perc  (tax_rate_perc / 2)::numeric(7,3)
 *     tax_sgst_perc  (tax_rate_perc / 2)::numeric(7,3)
 *     tax_igst_perc  tax_rate_perc
 *
 * so the mirror and the reloaded row agree instead of differing in the third
 * decimal. 0.25% is a real statutory slab and halves to 0.125 exactly, which is
 * why the scale is 3 and not 2.
 */

/** `numeric(7,3)` — Postgres rounds half away from zero, which `toFixed` does not. */
const SPLIT_SCALE = 3;

function toNumericScale3(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = 10 ** SPLIT_SCALE;
  const scaled = value * factor;
  // Math.round breaks ties toward +Infinity, so -0.0005 would round to -0.000
  // where Postgres gives -0.001. Rates are never negative today; mirroring the
  // rule anyway costs one sign check and removes a latent disagreement.
  const rounded = Math.sign(scaled) * Math.round(Math.abs(scaled));
  return rounded / factor;
}

export type TaxRateSplits = {
  cgst: number;
  sgst: number;
  igst: number;
};

export function deriveTaxRateSplits(ratePerc: number): TaxRateSplits {
  const half = toNumericScale3(ratePerc / 2);
  return {
    cgst: half,
    sgst: half,
    igst: toNumericScale3(ratePerc),
  };
}

/** Parses what the rate input holds — "" and junk both mean 0, not NaN. */
export function parseRatePerc(raw: string | number | null | undefined): number {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : 0;
  }
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) {
    return 0;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * The three mirrors as the form holds them (strings), keyed by field name.
 *
 * Trailing zeros are dropped so 18 shows "9" rather than "9.000" — the figure is
 * read, never re-parsed into the payload.
 */
export function deriveTaxRateSplitValues(
  ratePercRaw: string | number | null | undefined,
): Record<string, string> {
  const { cgst, sgst, igst } = deriveTaxRateSplits(parseRatePerc(ratePercRaw));
  return {
    tax_cgst_perc: String(cgst),
    tax_sgst_perc: String(sgst),
    tax_igst_perc: String(igst),
  };
}
