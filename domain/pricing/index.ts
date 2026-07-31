/**
 * The pricing engine's public surface.
 *
 * Nothing in `domain/pricing` imports React or the API layer: it is a pure
 * function of a document draft, unit tested against the Qt client's numbers, and
 * meant to be reused by sales invoice / purchase.
 */
export * from "./types";
export { recalcDocument, reconcile } from "./document";
export { distribute, type DistributeOptions } from "./charges";
export {
  applyGstAndCess,
  applyLineDiscounts,
  baseRateOf,
  netBillableQty,
  priceRowGoods,
  roundGoodsPricing,
  type GoodsPricing,
  type LineDiscounts,
  type TaxBlock,
} from "./lines";
export { defaultPolicy, emptyChargeRow, emptyLine } from "./factories";
export { formatCurrency, formatPerc, formatQty } from "./format";
export {
  Decimal,
  MONEY_DP,
  PERC_DP,
  RATE_DP,
  dec,
  money,
  perc,
  percentOf,
  rate,
  roundToStep,
  safeDiv,
  sum,
  type Dec,
} from "./money";