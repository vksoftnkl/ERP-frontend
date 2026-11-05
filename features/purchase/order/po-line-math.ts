/**
 * Purchase Order — the money of one line worked out on the client (Qt
 * `PurchaseLineMath`, src/modules/purchase/common/purchase_line_math.h; the
 * steps of the server's calcPurchase), so a typed Qty / Rate / Disc % / Sch %
 * shows its Tax and Amount at once. An ESTIMATE: the server's figure
 * (/purchase/orders/validate) follows and replaces it.
 *
 *   gross    = qty × rate                      (free qty is not charged)
 *   discAmt  = gross × disc% / 100
 *   schAmt   = (gross − discAmt) × sch% / 100
 *   taxable  = gross − discAmt − schAmt         (the GOODS value, the server's netGross)
 *   tax      = CGST + SGST, each taxable × gst% / 2 / 100 rounded on its own
 *              (inter-state: one IGST taxable × gst% / 100)
 *   total    = taxable + tax
 *
 * Every step rounded half-up to 2 places, as the server's r2(). The PO screen
 * adds a line's before-tax charge share to the goods value and taxes it with
 * `taxOn` (Qt bcd844a). Pure.
 */
import { num } from "@/features/purchase/shared/purchase.format";
import type { PoChargeLine, PoLine } from "./purchase-order.types";

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

export type PoLineIn = { qty: number; rate: number; discPct?: number; schPct?: number; gstPct?: number };
export type PoLineOut = { gross: number; discAmt: number; schAmt: number; taxable: number; tax: number; total: number };

/** Qt `calcLine` (the PO's inputs: percentages only). */
export function calcLine(input: PoLineIn, interState = false): PoLineOut {
  const gross = r2(input.qty * input.rate);
  const discPct = input.discPct ?? 0;
  const schPct = input.schPct ?? 0;
  const discAmt = discPct !== 0 ? r2((gross * discPct) / 100) : 0;
  const afterDisc = gross - discAmt;
  const schAmt = schPct !== 0 ? r2((afterDisc * schPct) / 100) : 0;
  const taxable = r2(afterDisc - schAmt);
  const tax = taxOn(taxable, input.gstPct ?? 0, interState);
  return { gross, discAmt, schAmt, taxable, tax, total: r2(taxable + tax) };
}

/** A line's typed figures as the math reads them. */
export function lineInOf(line: Pick<PoLine, "qty" | "rate" | "discPct" | "schPct" | "gstPct">): PoLineIn {
  return {
    qty: num(line.qty),
    rate: num(line.rate),
    discPct: num(line.discPct),
    schPct: num(line.schPct),
    gstPct: line.gstPct ?? 0,
  };
}

/** The line's goods value — qty × rate less disc % and sch % (the server's netGross; Qt `goodsValue`). */
export function goodsValue(line: Pick<PoLine, "qty" | "rate" | "discPct" | "schPct" | "gstPct">): number {
  return calcLine(lineInOf(line)).taxable;
}

/**
 * A charge's amount from its rate on the lines now (Qt `chargeRateAmount`):
 * FIXED = the rate, PERCENT = of the GOODS value (never the Taxable, which
 * carries the before-tax share — the estimate would feed on itself), QTY /
 * NET_QTY = × the ordered qty. null = the client can't tell (weight methods).
 */
export function chargeRateAmount(charge: Pick<PoChargeLine, "rate" | "method">, goods: number, qty: number): number | null {
  const rate = num(charge.rate);
  switch (charge.method.trim().toUpperCase()) {
    case "FIXED":
      return Math.abs(rate);
    case "PERCENT":
      return r2((goods * rate) / 100);
    case "QTY":
    case "NET_QTY":
      return r2(qty * rate);
    default:
      return null;
  }
}
