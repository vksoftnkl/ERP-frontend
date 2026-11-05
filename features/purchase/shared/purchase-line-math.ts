/**
 * One purchase line's money worked out on the client — Qt `PurchaseLineMath`
 * (src/modules/purchase/common/purchase_line_math.h, NexERP dd59c2c), the steps
 * of the server's calcPurchase — so a typed figure shows its Taxable / Tax /
 * Total at once. An ESTIMATE: the server's answer follows and replaces it.
 *
 *   gross    = qty × rate                      (free qty is not charged)
 *   discAmt  = gross × disc% / 100             (no disc %: the amount typed)
 *   schAmt   = (gross − discAmt) × sch% / 100  (scheme comes off the discounted value; no sch %: the amount typed)
 *   taxable  = gross − discAmt − schAmt − extra (an extra discount amount)
 *   tax      = CGST + SGST, each taxable × gst% / 2 / 100 rounded on its own
 *              (inter-state: one IGST taxable × gst% / 100)
 *   total    = taxable + tax
 *
 * Every step half-up to 2 places, as the server's r2(). Opt-in: Purchase Entry
 * uses it (dd59c2c P11, with the discount amounts and the extra disc); the PO
 * keeps its own copy (order/po-line-math.ts, percentages only). Pure.
 */

/** Half-up to 2 places, symmetric around 0 (Qt `PurchaseLineMath::r2`). */
export function r2(value: number): number {
  const a = Math.floor(Math.abs(value) * 100 + 0.5 + 1e-7) / 100;
  return value < 0 ? -a : a;
}

/** GST on a taxable value: CGST + SGST each rounded on its own; inter-state one IGST (Qt `taxOn`). */
export function taxOn(taxable: number, gstPct: number, interState = false): number {
  if (gstPct === 0 || taxable === 0) {
    return 0;
  }
  return interState ? r2((taxable * gstPct) / 100) : 2 * r2((taxable * gstPct) / 2 / 100);
}

export type PurchaseLineIn = {
  qty: number;
  rate: number;
  discPct?: number;
  schPct?: number;
  gstPct?: number;
  /** Used when `discPct` is 0 (the invoice's Disc column). */
  discAmt?: number;
  /** Used when `schPct` is 0 (the invoice's Sch column). */
  schAmt?: number;
  /** Always taken off (the invoice's Extra disc, an amount). */
  extraAmt?: number;
};

export type PurchaseLineOut = { gross: number; discAmt: number; schAmt: number; taxable: number; tax: number; total: number };

/** Qt `calcLine`. */
export function calcPurchaseLine(input: PurchaseLineIn, interState = false): PurchaseLineOut {
  const gross = r2(input.qty * input.rate);
  const discPct = input.discPct ?? 0;
  const schPct = input.schPct ?? 0;
  const discAmt = discPct !== 0 ? r2((gross * discPct) / 100) : r2(input.discAmt ?? 0);
  const afterDisc = gross - discAmt;
  const schAmt = schPct !== 0 ? r2((afterDisc * schPct) / 100) : r2(input.schAmt ?? 0);
  const taxable = r2(afterDisc - schAmt - (input.extraAmt ?? 0));
  const tax = taxOn(taxable, input.gstPct ?? 0, interState);
  return { gross, discAmt, schAmt, taxable, tax, total: r2(taxable + tax) };
}
