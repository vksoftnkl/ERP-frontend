/**
 * The two wire shapes every report shares. Amounts are strings with two
 * decimals and stay strings; a balance is the magnitude and its side.
 */

export type Side = "DR" | "CR";

/** A balance: the magnitude and its side. `side` is null only on zero, if at all. */
export type Bal = { amount: string; side: Side | null };
