/**
 * The tender surcharge — what a UPI or card master charges the CUSTOMER for
 * paying that way (user, 2026-10-12; Qt 6f15977).
 *
 * ── The figure typed is what goes to the BILLS ───────────────────────────
 * The customer pays the surcharge ON TOP: 200 keyed on a 1% UPI collects
 * 202.00, the bills get 200 and SURCHARGE_RECOVERED gets 2.00 — the same as
 * on the sale bill. So a row holds two figures — `forBills` (what the
 * operator typed, client only) and `amount` (the gross, what `tdAmount`
 * carries) — and `surchargeAmt` is the difference.
 *
 * ── Exactly as the server computes it ────────────────────────────────────
 * `receipt-lines.ts` (notes 107 / 127 §4; Qt 425fa80): a percentage is INSIDE
 * the tender amount, `round2(amount × perc / (100 + perc))` — 202 at 1% is
 * 2.00 of surcharge, not 202 × 1% = 2.02 — else the master's flat amount;
 * rounded half-up to paise on an exact decimal. The server then refuses a
 * SURCHARGE_RECOVERED line that disagrees with its own sum, so this module
 * rounds in integer paise rather than in doubles — `Math.round(x * 100)` is
 * a paisa out on exactly the figures that end in a half.
 *
 * Not to be confused with `tdMdrAmt`: the MDR is what the ACQUIRER keeps, a
 * split of the bank leg that the customer never sees.
 */
import type { TenderMasterRow } from "@/features/sales/sale-order/sale-order.types";
import type { TenderRow } from "../receipt.types";
import { toPaise, toRupees } from "./money";

/** What one tender master charges. Null = it charges nothing. */
export type SurchargeTerms = {
  /**
   * Percent ON TOP of what the bills get — `perc / (100 + perc)` of the
   * gross. Wins over `flat` when above zero.
   */
  perc: number;
  /** A flat figure per instrument, used only when there is no percentage. */
  flat: number;
  /** `tnd_edit_surcharge`: the server takes the client's figure only then. */
  editable: boolean;
};

/** The row fields this module owns. */
export type SurchargeFields = Pick<
  TenderRow,
  "amount" | "forBills" | "surchargeAmt" | "sendSurcharge"
>;

/** Half a paisa — the tolerance Qt's `grossFor` searches to. */
const HALF_PAISA = 0.005;

type SurchargeMaster = Pick<
  TenderMasterRow,
  "tndSurchargePerc" | "tndSurchargeAmount" | "tndEditSurcharge"
>;

/** The master's terms, or null for a tender that charges nothing. */
export function surchargeTermsOf(master: SurchargeMaster | null | undefined): SurchargeTerms | null {
  if (!master) {
    return null;
  }
  // Coerced: a NUMERIC column can arrive as a string from a route that does
  // not convert it, and `"1" > 0` is a comparison that happens to work only
  // until somebody adds to it.
  const perc = Number(master.tndSurchargePerc) || 0;
  const flat = Number(master.tndSurchargeAmount) || 0;
  if (perc <= 0 && flat <= 0) {
    return null;
  }
  return { perc, flat, editable: master.tndEditSurcharge === true };
}

/**
 * `a / b` rounded half-up, both non-negative integers — exact where a double
 * division followed by `Math.round` is not.
 */
function divideHalfUp(numerator: number, denominator: number): number {
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

/**
 * The surcharge the server books on a tender of `amount` (the GROSS): the
 * share `perc / (100 + perc)` of it.
 *
 * Nothing on a zero or negative amount. The percentage is held in thousandths
 * (`tnd_surcharge_perc` is numeric(_, 3)) so `paise × perc` and `100 + perc`
 * stay integers.
 */
export function surchargeOn(terms: SurchargeTerms | null, amount: number): number {
  if (!terms || !(amount > 0)) {
    return 0;
  }
  if (terms.perc > 0) {
    const paise = toPaise(amount);
    const percMilli = Math.round(terms.perc * 1000);
    return toRupees(divideHalfUp(paise * percMilli, 100 * 1000 + percMilli));
  }
  return toRupees(toPaise(terms.flat));
}

/**
 * The amount to collect so that, after the server's surcharge, `forBills` is
 * left for the bills: 200 at 1% → 202.00 (surcharge 2.00), as on the bill.
 *
 * A percentage is charged on top of what the bills get, so the gross is
 * `forBills × (100 + p) / 100` — and because the surcharge is rounded to
 * paise, the paisa either side of that guess may be the one that leaves
 * exactly `forBills`. Qt searches 0, −0.01, +0.01, −0.02, +0.02 in that
 * order; so does this, so the two clients pick the same paisa when two would
 * do.
 */
export function grossFor(terms: SurchargeTerms | null, forBills: number): number {
  if (!(forBills > 0) || !terms) {
    return forBills;
  }
  if (terms.perc <= 0) {
    return toRupees(toPaise(forBills) + toPaise(terms.flat));
  }
  const guessPaise = toPaise((forBills * (100 + terms.perc)) / 100);
  for (const step of [0, -1, 1, -2, 2]) {
    const gross = toRupees(guessPaise + step);
    if (Math.abs(gross - surchargeOn(terms, gross) - forBills) < HALF_PAISA) {
      return gross;
    }
  }
  return toRupees(guessPaise);
}

/**
 * What the operator typed on a row — or, when nothing was typed yet, what the
 * row carries. Qt: `if (t.forBills <= kEpsilon) t.forBills = t.amount`.
 */
export function typedAmountOf(row: Pick<TenderRow, "amount" | "forBills">): number {
  const forBills = row.forBills ?? 0;
  return forBills > 0 ? forBills : row.amount;
}

/**
 * A row's four money fields after the operator typed `typed` into its Amount,
 * or after it moved onto a tender charging `terms` (`typed` omitted: the
 * figure for the bills stays what it was).
 *
 * `sendSurcharge` is set only when the master lets the figure be edited —
 * otherwise the server computes the same number itself and ignores ours.
 */
export function applySurcharge<T extends SurchargeFields>(
  row: T,
  terms: SurchargeTerms | null,
  typed?: number,
): T {
  const forBills = typed !== undefined ? typed : typedAmountOf(row);
  if (!terms) {
    return { ...row, amount: forBills, forBills, surchargeAmt: 0, sendSurcharge: false };
  }
  const amount = grossFor(terms, forBills);
  return {
    ...row,
    amount,
    forBills,
    surchargeAmt: surchargeOn(terms, amount),
    sendSurcharge: terms.editable,
  };
}

/** Σ of what the operator typed — what goes to the bills, before any surcharge. */
export function forBillsTotal(
  tenders: ReadonlyArray<Pick<TenderRow, "amount" | "forBills">>,
): number {
  return toRupees(tenders.reduce((total, tender) => total + toPaise(typedAmountOf(tender)), 0));
}

/** Σ surcharge over the instruments — the SURCHARGE_RECOVERED line's figure. */
export function surchargeTotal(tenders: ReadonlyArray<Pick<TenderRow, "surchargeAmt">>): number {
  return toRupees(
    tenders.reduce((total, tender) => total + toPaise(tender.surchargeAmt ?? 0), 0),
  );
}
