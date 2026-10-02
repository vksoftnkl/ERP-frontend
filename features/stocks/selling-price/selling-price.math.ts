/**
 * The four numbers of one price level — the Qt entity's maths
 * (`change_selling_price_entity.h`), which is the server's
 * `selling-price-math.helper.ts` read from the other side:
 *
 *   markup — (price − cost) ÷ cost, on the tax-INCLUSIVE pair
 *   margin — (priceWot − costWot) ÷ priceWot, on the tax-EXCLUSIVE pair
 *
 * Both are 0 when the cost is unknown, never "100%". PRICE is what is sent;
 * the server recomputes the other two from it, so whatever the operator typed
 * must already be in the price.
 *
 * Pure, and plain IEEE doubles throughout so a figure here is the figure the
 * Qt screen shows for the same keystrokes.
 */

/** C++ `std::round`: half away from zero (JS `Math.round` rounds half up). */
export function roundHalfAway(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

export function round2(value: number): number {
  return roundHalfAway(value * 100) / 100;
}

/** price ÷ (1 + tax%). Guarded: a −100% tax would divide by zero. */
export function exclusiveOfTax(withTax: number, taxPerc: number): number {
  const divisor = 1 + taxPerc / 100;
  return divisor <= 0 ? withTax : withTax / divisor;
}

export function markupOf(price: number, cost: number): number {
  return cost > 0 ? ((price - cost) / cost) * 100 : 0;
}

export function marginOf(price: number, cost: number, taxPerc: number): number {
  const priceWot = exclusiveOfTax(price, taxPerc);
  const costWot = exclusiveOfTax(cost, taxPerc);
  return cost > 0 && priceWot > 0 ? ((priceWot - costWot) / priceWot) * 100 : 0;
}

/**
 * The item card's round-off: to the nearest multiple; 0 leaves it alone.
 * Applied only when a price is DERIVED (from markup, wot / base rate or
 * margin) — a price the operator typed is the price.
 */
export function applyRoundOff(price: number, roundOff: number): number {
  return roundOff > 0 ? roundHalfAway(price / roundOff) * roundOff : price;
}

/** A markup typed → the price (round-off applies). */
export function priceFromMarkup(cost: number, markupPerc: number, roundOff: number): number {
  return applyRoundOff(cost * (1 + markupPerc / 100), roundOff);
}

/**
 * A base rate / price wot typed → the net price: base × (1 + tax%), with the
 * item's round-off — a DERIVED price.
 */
export function priceFromWot(priceWot: number, taxPerc: number, roundOff: number): number {
  return applyRoundOff(priceWot * (1 + taxPerc / 100), roundOff);
}

/**
 * A margin typed → the price, on the tax-exclusive pair. Null for a margin of
 * 100% or more, which has no price.
 */
export function priceFromMargin(
  cost: number,
  taxPerc: number,
  marginPerc: number,
  roundOff: number,
): number | null {
  if (marginPerc >= 100) {
    return null;
  }
  const costWot = exclusiveOfTax(cost, taxPerc);
  return applyRoundOff((costWot / (1 - marginPerc / 100)) * (1 + taxPerc / 100), roundOff);
}

/** The violet card's four numbers for one price. */
export function levelNumbers(
  price: number,
  cost: number,
  taxPerc: number,
): { markup: number; wot: number; price: number; margin: number } {
  return {
    markup: markupOf(price, cost),
    wot: exclusiveOfTax(price, taxPerc),
    price,
    margin: marginOf(price, cost, taxPerc),
  };
}

/**
 * A raw figure the way the Qt cells hold one (and the server writes one): no
 * grouping, up to six places, trailing zeros gone — "50", never "50.00". The
 * bucket key a row is found by after a save is built from these.
 */
export function rawNum(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  return value.toFixed(6).replace(/\.?0+$/, "");
}

/** `raw()` of a JSON value: "" for null / absent. */
export function rawOf(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return rawNum(Number.isFinite(parsed) ? parsed : 0);
}

/** A number off the wire, whatever it arrived as; 0 when it is not one. */
export function toNum(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/** A nullable number off the wire: null stays null. */
export function toNullableNum(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return toNum(value);
}
