/**
 * Dr/Cr, at the one place the three spellings meet.
 *
 *     acc_opening_balance.op_dr_cr   char(1)  'D'  / 'C'
 *     acc_bill_balance.abl_dr_cr     char(2)  'DR' / 'CR'
 *     both grids, on screen                   'Dr' / 'Cr'
 *
 * They are NOT unified. Two tables, two CHECK constraints; sending the other
 * table's spelling is a 400. Everything above this file speaks the shown form
 * and converts here, so there is exactly one place to get it wrong.
 */
import type { BillDrCrWire, OpeningDrCrWire, ShownSide } from "../opening-balance.types";

/** The shown side of a ledger opening as `op_dr_cr`. */
export function toLedgerWire(shown: ShownSide): OpeningDrCrWire | null {
  if (shown === "Dr") {
    return "D";
  }
  if (shown === "Cr") {
    return "C";
  }
  return null;
}

/** The shown side of an opening bill as `abl_dr_cr`. TWO characters. */
export function toBillWire(shown: ShownSide): BillDrCrWire | null {
  if (shown === "Dr") {
    return "DR";
  }
  if (shown === "Cr") {
    return "CR";
  }
  return null;
}

/**
 * Either wire spelling as it is shown.
 *
 * `null` maps to the EMPTY string, never to "Dr": a ledger with no opening has
 * no side, and painting one there invents a figure the server never wrote.
 */
export function fromWire(wire: OpeningDrCrWire | BillDrCrWire | null | undefined): ShownSide {
  const value = (wire ?? "").trim().toUpperCase();
  if (value === "D" || value === "DR") {
    return "Dr";
  }
  if (value === "C" || value === "CR") {
    return "Cr";
  }
  return "";
}

/**
 * The arithmetic sign of a side: debit positive.
 *
 * Amounts on both tables are constrained positive (`ck_op_amount >= 0`,
 * `ck_abl_amount > 0`) and the side lives in the flag, so this is the only way
 * a figure is ever signed — inside a sum, never in storage and never in an
 * input.
 */
export function sign(side: ShownSide | OpeningDrCrWire | BillDrCrWire | null | undefined): 1 | -1 {
  return fromWire(side as OpeningDrCrWire | null) === "Cr" ? -1 : 1;
}

/** The other side. Used by the Dr/Cr cell's two-value toggle. */
export function flipSide(side: ShownSide): ShownSide {
  return side === "Dr" ? "Cr" : "Dr";
}

export const SHOWN_SIDES: readonly ShownSide[] = ["Dr", "Cr"];
