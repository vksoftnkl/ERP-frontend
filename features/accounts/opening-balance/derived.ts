/**
 * Everything this screen computes. Pure, no React, no API.
 *
 * **Money is summed in paise.** Two independent reasons:
 *
 *  - Floating point. `0.1 + 0.2 !== 0.3`, and a trial balance is a comparison
 *    of two sums for exact equality. Qt compared with an epsilon of 0.005
 *    because its figures had been through a grid AS TEXT and could not be
 *    trusted to the paisa. The draft here holds numbers that never went near a
 *    formatter, so integer paise let the comparison be exact instead.
 *  - Nothing is ever parsed back out of display text. `Intl.NumberFormat`
 *    renders `2,400.50`, and in a comma-decimal locale `2400,50` parses as
 *    240050 — the same defect the Qt `cellNumber()` helper existed to dodge.
 *    The draft is the model; the formatters are one-way.
 */
import type { BillRow, LedgerRow, ShownSide, TrialBalance } from "./opening-balance.types";
import { sign } from "./wire/side";

/** A rupee figure as whole paise. The only rounding in the screen. */
export function toPaise(amount: number): number {
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

/** Paise back to rupees, for the wire and for display. */
export function toRupees(paise: number): number {
  return Math.round(paise) / 100;
}

export type Totals = {
  debitPaise: number;
  creditPaise: number;
  /** debit − credit, SIGNED — the same convention the server's `difference` uses. */
  differencePaise: number;
  debit: number;
  credit: number;
  difference: number;
  isBalanced: boolean;
};

/**
 * The screen's own trial balance over the loaded set.
 *
 * A bill-wise row counts at the figure shown on it, which the reducer keeps
 * mirrored to the net of its bills (§7.2) — so a breakup being typed moves
 * these totals live, exactly as it will move the server's once saved.
 */
export function totals(rows: readonly LedgerRow[]): Totals {
  let debitPaise = 0;
  let creditPaise = 0;
  for (const row of rows) {
    if (!row.ledId || row.drCr === "") {
      continue;
    }
    const paise = toPaise(row.amount);
    if (paise === 0) {
      continue;
    }
    if (row.drCr === "Dr") {
      debitPaise += paise;
    } else {
      creditPaise += paise;
    }
  }
  const differencePaise = debitPaise - creditPaise;
  return {
    debitPaise,
    creditPaise,
    differencePaise,
    debit: toRupees(debitPaise),
    credit: toRupees(creditPaise),
    difference: toRupees(differencePaise),
    isBalanced: differencePaise === 0,
  };
}

export type PartyNet = { amount: number; side: ShownSide };

/**
 * What a bill-by-bill party opens at: the NET of its opening bills.
 *
 * 5,000 DR against 3,000 CR opens the party at 2,000 Dr, not 8,000 — verified
 * live. The blank trailing row carries no amount and falls out on its own.
 * No bills at all is `{ 0, "" }`: a party with no breakup opens at zero and has
 * no side, which is not the same as opening at zero on the debit side.
 */
export function partyNet(bills: readonly BillRow[]): PartyNet {
  let netPaise = 0;
  let counted = 0;
  for (const bill of bills) {
    const paise = toPaise(bill.amount);
    if (paise <= 0) {
      continue;
    }
    netPaise += sign(bill.drCr) * paise;
    counted += 1;
  }
  if (counted === 0) {
    return { amount: 0, side: "" };
  }
  if (netPaise === 0) {
    return { amount: 0, side: "" };
  }
  return { amount: toRupees(Math.abs(netPaise)), side: netPaise > 0 ? "Dr" : "Cr" };
}

/** Bills that are real rows rather than the trailing blank one. */
export function keyedBills(bills: readonly BillRow[]): BillRow[] {
  return bills.filter((bill) => !isBlankBill(bill));
}

/**
 * The trailing blank bill: never saved, never validated, never counted. A row
 * the server sent is never blank, however empty it looks, because it has an
 * `ablId`.
 */
export function isBlankBill(bill: BillRow): boolean {
  return (
    bill.ablId === null &&
    bill.docRefno.trim() === "" &&
    toPaise(bill.amount) === 0 &&
    bill.narration.trim() === ""
  );
}

/** The trailing blank ledger row: furniture until a ledger is picked into it. */
export function isBlankLedgerRow(row: LedgerRow): boolean {
  return row.ledId === "";
}

export type Agreement =
  | { kind: "agrees" }
  | { kind: "unsaved"; serverDebit: number; serverCredit: number }
  /** Nothing is dirty and the two still disagree. That is a bug, not rounding. */
  | { kind: "disagrees"; serverDebit: number; serverCredit: number };

/**
 * Whether the strip in the footer and the server's last word are the same
 * figure.
 *
 * When the screen is dirty a difference is expected — the screen is ahead. When
 * it is NOT dirty a difference cannot be explained away, and the band says so
 * loudly rather than averaging the two.
 */
export function agreement(
  own: Totals,
  server: TrialBalance,
  dirty: boolean,
): Agreement {
  const matches =
    own.debitPaise === toPaise(server.totalDebit) &&
    own.creditPaise === toPaise(server.totalCredit);
  if (matches) {
    return { kind: "agrees" };
  }
  return {
    kind: dirty ? "unsaved" : "disagrees",
    serverDebit: server.totalDebit,
    serverCredit: server.totalCredit,
  };
}

const MONEY = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Display only. Nothing ever reads a number back out of this. */
export function formatMoney(amount: number): string {
  return MONEY.format(Number.isFinite(amount) ? amount : 0);
}

/** `"4,17,000.00 Dr"`, or just the figure when there is no side. */
export function formatSigned(amount: number, side: ShownSide): string {
  return side ? `${formatMoney(amount)} ${side}` : formatMoney(amount);
}

/** An empty trial balance, for the render before the first answer lands. */
export const EMPTY_TRIAL_BALANCE: TrialBalance = {
  totalDebit: 0,
  totalCredit: 0,
  difference: 0,
  isBalanced: true,
  unmappedCount: 0,
  differenceLedgerId: null,
  differenceLedgerName: null,
};
