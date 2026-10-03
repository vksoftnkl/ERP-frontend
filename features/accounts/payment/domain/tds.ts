/**
 * TDS on a payment — the server's `computePaymentTds()` (payment-tds.ts), to
 * the paisa.
 *
 * A payment is where this company is the DEDUCTOR, and the server seeds the
 * TDS_PAYABLE line itself; a client figure that disagrees is a 409 naming both
 * ("TDS does not agree"). So the screen works it out exactly as the server
 * does and sends the same number, rather than leaving the operator to key one
 * that can only ever be refused. The line is never typed.
 *
 *     net  = max(Σ tdAmount − every DR line, 0)   what the party receives for
 *                                                 what it supplied (notes 62 B1:
 *                                                 the bank's charge, interest,
 *                                                 a round-up, a free DR ledger
 *                                                 all come off)
 *     base = round2(net / (1 − rate/100))         the gross the bills settle by
 *     tax  = base − net
 *
 * Deducted only when the base crosses a threshold — the single-payment limit,
 * or the year's running BASE (`tdsPaidThisYear` + base) past the annual one.
 * Both zero means "always".
 *
 * ── Exact, not floating ──────────────────────────────────────────────────
 * The server divides in `Prisma.Decimal` and rounds half-up. `9,900 / 0.99` in
 * a double is 10,000.000000000002 on one input and 9,999.999999999998 on the
 * next, and a paisa either way is a refused post. So the gross-up is done in
 * integer paise with BigInt and rounded half-up by hand.
 */
import { toPaise, toRupees } from "@/features/accounts/receipt/domain/money";
import type { PaymentPartyFacts } from "../payment.types";

export type PaymentTds = {
  /** The party is TDS-applicable and a rate is in force for its section. */
  applies: boolean;
  /** …and this payment crosses a threshold, so a line is seeded. */
  deducted: boolean;
  section: string;
  rate: number;
  /** Rupees. The gross when deducted; the net otherwise. */
  base: number;
  tax: number;
};

export const NO_TDS: PaymentTds = {
  applies: false,
  deducted: false,
  section: "",
  rate: 0,
  base: 0,
  tax: 0,
};

/** A rate as an integer number of millionths (1.5% → 15,000), exactly. */
function rateMillionths(rate: number): bigint {
  return BigInt(Math.round(rate * 10000));
}

/** `round_half_up(netPaise / (1 − rate/100))`, in paise, exactly. */
export function grossUpPaise(netPaise: number, rate: number): number {
  const million = BigInt(1_000_000);
  const denominator = million - rateMillionths(rate);
  if (denominator <= BigInt(0)) {
    return netPaise;
  }
  const numerator = BigInt(netPaise) * million;
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return Number(remainder * BigInt(2) >= denominator ? quotient + BigInt(1) : quotient);
}

/** Whether the party's facts let this screen work TDS out at all. */
export function tdsApplies(party: PaymentPartyFacts): boolean {
  return (
    party.loaded && party.isTdsApplicable && party.tdsSection.trim() !== "" && party.tdsRate !== null
  );
}

/**
 * The deduction on a payment that leaves `netRupees` with the party.
 *
 * `netRupees` is the caller's Σ tenders less every DR line; it is floored at
 * zero here, as the server floors it.
 */
export function computePaymentTds(party: PaymentPartyFacts, netRupees: number): PaymentTds {
  if (!tdsApplies(party)) {
    return NO_TDS;
  }
  const rate = party.tdsRate ?? 0;
  const net = Math.max(0, toPaise(netRupees));
  const base = rate > 0 ? grossUpPaise(net, rate) : net;
  const tax = base - net;

  const single = toPaise(party.tdsThresholdSingle);
  const annual = toPaise(party.tdsThresholdAnnual);
  const cumulative = toPaise(party.tdsPaidThisYear) + base;
  const crosses =
    base > 0 &&
    ((single <= 0 && annual <= 0) ||
      (single > 0 && base > single) ||
      (annual > 0 && cumulative > annual));

  const common = { applies: true, section: party.tdsSection, rate };
  if (!crosses || tax <= 0) {
    return { ...common, deducted: false, base: toRupees(net), tax: 0 };
  }
  return { ...common, deducted: true, base: toRupees(base), tax: toRupees(tax) };
}

/** The line's narration — the server's own wording, so the two read alike. */
export function tdsNarration(tds: PaymentTds): string {
  return `TDS ${tds.section} @ ${tds.rate}% on ${tds.base.toFixed(2)}`;
}
