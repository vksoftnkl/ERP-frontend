/**
 * Quotation / sales pricing engine — types.
 *
 * This module (and everything else in `domain/pricing`) is framework agnostic:
 * no React import, no API import, no session read. It is a pure function of its
 * arguments so it can be unit tested against the Qt client's numbers and reused
 * by sales invoice / purchase later — which is exactly what the Qt code did by
 * sharing `ChargeGridController`.
 */
/** How a charge amount is computed. Mirrors the server's `ChargeMethod` enum. */
export type ChargeMethod = "FIXED" | "QTY" | "NET_QTY" | "KG" | "QTL" | "TON" | "PERCENT";
/** Distribution basis for a FIXED lump sum. Mirrors the server's `ChargeApplyOn`. */
export type ChargeApplyOn = "FLAT" | "QTY" | "VALUE" | "WEIGHT";
/** Sign of a charge. Mirrors the server's `ChargeType`. */
export type ChargeType = "ADD" | "DEDUCT";
/** Well-known charge roles. Mirrors the server's `ChargeRole`. */
export type ChargeRole =
  | "FREIGHT"
  | "LOADING"
  | "UNLOADING"
  | "CASH_DISC"
  | "OTHERS"
  | "NONE";
/**
 * One item row, engine-visible fields only. Anything the engine does not read
 * (names, ids of masters, batch info, remarks, the per-line cash-discount that
 * is persisted but priced as a charge row) lives on the draft line, not here.
 */
export type Line = {
  itemId: string;
  // quantities
  caseQty: number;
  billQty: number;
  lengthQty: number;
  toBaseFactor: number;
  // rate + line nature
  rate: number;
  /**
   * Per line, NOT per document: `policy.discountAlterBaseRate` chooses the
   * pricing order for the whole voucher, but whether tax has to be extracted
   * out of the keyed rate is the line's own property. A mixed document is
   * normal.
   */
  isInclusiveTax: boolean;
  isFree: boolean;
  // discounts — one of three per group (percent / per-qty / keyed amount)
  discPerc: number;
  discPerQty: number;
  discAmt: number;
  splDiscPerc: number;
  splDiscPerQty: number;
  splDiscAmt: number;
  schPerc: number;
  schPerQty: number;
  schAmt: number;
  /** Bill-scheme discount is percent-only. */
  billSchDiscPerc: number;
  // tax block
  gstPerc: number;
  cgstPerc: number;
  sgstPerc: number;
  igstPerc: number;
  cessPerc: number;
  /** Cess charged per unit of net quantity (the `CessUom` column). */
  cessPerUnit: number;
  // reference prices
  mrp: number;
  minPrice: number;
  actualPrice: number;
  costPrice: number;
  costBeforeTax: number;
  // per-unit statistics and charge sources
  weight: number;
  loyaltyPv: number;
  freightPerQty: number;
  loadingPerQty: number;
  /** Does this line carry freight at all (from the item price lookup). */
  hasFreight: boolean;
};
/**
 * Everything the engine derives. Never stored on the draft — this is the whole
 * reason the React port is smaller than the Qt one: in Qt the derived values
 * live in grid cells and have to be written back, here they are recomputed.
 *
 * Note that `discAmt` / `splDiscAmt` / `schAmt` shadow the keyed inputs of the
 * same name with the *computed* amounts: that is what the grid displays, and
 * what the Qt client wrote back into those cells.
 */
export type PricedLine = Line & {
  netQty: number;
  rateBeforeTax: number;
  grossAmt: number;
  netGross: number;
  discAmt: number;
  splDiscAmt: number;
  schAmt: number;
  billSchDiscAmt: number;
  freightAmt: number;
  loadingAmt: number;
  chrgBeforeTax: number;
  chrgAfterTax: number;
  taxableAmt: number;
  cgstAmt: number;
  sgstAmt: number;
  igstAmt: number;
  gstAmt: number;
  cessAmt: number;
  total: number;
  netPrice: number;
  netPriceBeforeTax: number;
  savingsPerc: number;
  profit: number;
  profitBeforeTax: number;
  rateDiff: number;
};
/**
 * Snapshot of the company settings the document was created under. Copied out
 * of the session exactly twice (mount of a new quotation, and Clear) and read
 * from the document on load — never from the session again. An operator can
 * change the company setting between two quotations and a document has to keep
 * pricing the way it was created.
 */
export type VoucherPolicy = {
  /** e.g. `MANUAL` | `ITEM_BASIS` | `AUTO`. `MANUAL` disables the role override. */
  freightCalcType: string;
  loadingCalcType: string;
  /** true = discount the keyed (tax-inclusive) money first, then extract tax. */
  discountAlterBaseRate: boolean;
  /** Bill rounding step. No backend column yet — see the plan's §13.4. */
  roundOffStep: number;
};
/** One row of the additional-charges grid, engine-visible fields only. */
export type ChargeRow = {
  /** Stable client-side row key (not the server id). */
  key: string;
  chgId: string;
  role: ChargeRole;
  method: ChargeMethod;
  type: ChargeType;
  applyOn: ChargeApplyOn;
  beforeTax: boolean;
  taxApl: boolean;
  /** Rate, percentage or lump sum depending on `method`. */
  rate: number;
  /**
   * Operator-keyed total for the row. `rate === 0 && amount !== 0` means the
   * charge was priced by total: spread `amount` by `applyOn` instead of
   * recomputing from the method.
   */
  amount: number;
  taxPerc: number;
  cgstPerc: number;
  sgstPerc: number;
  igstPerc: number;
};
/** What the engine measures each line by when distributing a charge. */
export type LineBasis = {
  /** Post-discount, pre-tax goods value of the line. */
  netGross: number;
  billQty: number;
  netQty: number;
  /** Total line weight (per-unit weight × bill quantity). */
  weight: number;
  /**
   * Whether this line may carry a share of a charge. `false` for the blank
   * trailing row the entry grids always keep waiting: it names no item, so a
   * lump-sum charge spread by FLAT would otherwise hand it an equal share and
   * the priced rows above it would change the moment it appeared. Omitted means
   * chargeable — a caller that does not have blank rows need not say so.
   */
  chargeable?: boolean;
};
/** The share of every charge row that landed on one line. */
export type LineChargeShare = {
  beforeTax: number;
  afterTax: number;
};

/** A charge row with the amounts and tax block the engine computed for it. */
export type PricedChargeRow = ChargeRow & {
  /** Signed total of the row (negative for DEDUCT). */
  amountValue: number;
  /** Per-line shares of `amountValue`, in line order. */
  shares: number[];
  /** Zeroed unless `taxApl && !beforeTax` — including the percentages. */
  taxPercApplied: number;
  cgstPercApplied: number;
  sgstPercApplied: number;
  igstPercApplied: number;
  cgstAmt: number;
  sgstAmt: number;
  igstAmt: number;
  taxAmt: number;
  /** Charges never carry cess. Always 0; present so the row shape is total. */
  cessAmt: number;
  netAmt: number;
};
/** What `distribute` hands back. */
export type ChargeDistribution = {
  lines: LineChargeShare[];
  rows: PricedChargeRow[];
  /**
   * Taxable base contributed by after-tax *taxable* charge rows only. Before-tax
   * rows move the lines' own taxable base instead and are not counted here.
   */
  chargeTaxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  /** Always 0 — charges never carry cess. Kept for symmetry with the lines. */
  cess: number;
  /** Σ of after-tax shares that carry no own tax (used by the §3.5 invariant). */
  afterTaxNonTaxable: number;
};
/** Per-line role overrides: pre-computed shares that bypass the row's method. */
export type ChargeRoleOverrides = Partial<Record<ChargeRole, number[]>>;
/** Document-level switches the engine needs that are not part of the policy. */
export type DocumentFlags = {
  /** Place of supply resolves to the company's own state. */
  isLocalSale: boolean;
  hasFreight: boolean;
  hasLoad: boolean;
  hasUnload: boolean;
};
export type DocumentTotals = {
  // per-line sums
  grossAmt: number;
  /** Σ post-discount pre-tax goods value. */
  netGross: number;
  itemDisc: number;
  splDisc: number;
  schDisc: number;
  billSchDisc: number;
  lineTaxable: number;
  lineCgst: number;
  lineSgst: number;
  lineIgst: number;
  lineCess: number;
  lineTax: number;
  lineTotal: number;
  totQty: number;
  totWeight: number;
  totItems: number;
  totalCost: number;
  totalProfit: number;
  totalProfitBeforeTax: number;
  totalLoyaltyPv: number;
  totalRateDiff: number;
  freeSchemeAmount: number;
  // charge totals by role — what the header columns persist
  freightAmt: number;
  loadAmt: number;
  unloadAmt: number;
  cashDiscAmt: number;
  /** Every charge row that is not one of the four named roles. */
  otherAmt: number;
  // document level
  chargeTaxable: number;
  chargeOwnTax: number;
  /**
   * Σ after-tax charge shares that carry no tax of their own. Only used by the
   * reconciliation in `document.ts` — see `reconcile`.
   */
  afterTaxNonTaxable: number;
  docTaxable: number;
  docCgst: number;
  docSgst: number;
  docIgst: number;
  docCess: number;
  docTax: number;
  /** Σ line total − free-scheme amount + the charge rows' own tax. */
  amount: number;
  roundOff: number;
  /** `amount` moved onto the round-off step. What the customer pays. */
  bill: number;
  // the two stat labels — they measure different things, see `document.ts`
  savingAmt: number;
  savingPerc: number;
  marginAmt: number;
  marginPerc: number;
};
export type DocumentPricing = {
  lines: PricedLine[];
  charges: PricedChargeRow[];
  totals: DocumentTotals;
};