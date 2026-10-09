/**
 * Amounts, formatted from the STRING the server sent (plan §4.2).
 *
 * The client does no arithmetic on money, so it never needs to leave the
 * string domain. Nothing in this file calls `Number`, `parseFloat` or
 * `Intl.NumberFormat`, and `money.test.ts` checks that. That rules out the
 * whole float-and-locale class of bug: `176300.00000001`, and `2400,50` read
 * as `240050`.
 */
import type { Bal } from "./types";

const AMOUNT = /^(-?)(\d+)(?:\.(\d+))?$/;

/** True when the string is a well-formed amount (`176300.00`, `-5.5`, `0`). */
export function isAmountString(value: string): boolean {
  return AMOUNT.test(value);
}

/** True for `0`, `0.00`, `-0.00` and the like, decided on the digits alone. */
export function isZeroAmount(value: string): boolean {
  const match = AMOUNT.exec(value.trim());
  if (!match) return false;
  return /^0+$/.test(match[2]) && /^0*$/.test(match[3] ?? "");
}

/** `1234567` → `12,34,567`: the last three digits, then pairs. */
function groupIndian(digits: string): string {
  const trimmed = digits.replace(/^0+(?=\d)/, "");
  if (trimmed.length <= 3) return trimmed;
  const head = trimmed.slice(0, -3);
  const tail = trimmed.slice(-3);
  return `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${tail}`;
}

/**
 * `"176300.00"` → `"1,76,300.00"`. The decimals are kept byte-for-byte as sent.
 * A string that is not an amount is returned unchanged, so a surprise from the
 * server shows as itself instead of as a plausible wrong number.
 */
export function formatAmount(amount: string): string {
  const match = AMOUNT.exec(amount.trim());
  if (!match) return amount;
  const [, sign, integer, decimals] = match;
  const grouped = groupIndian(integer);
  const body = decimals === undefined ? grouped : `${grouped}.${decimals}`;
  return sign && !isZeroAmount(amount) ? `-${body}` : body;
}

/** A Debit / Credit cell: blank when the amount is zero. */
export function formatCell(amount: string): string {
  return isZeroAmount(amount) ? "" : formatAmount(amount);
}

/**
 * A balance: `1,76,300.00 Dr`. The side comes from `side`, never from a sign.
 * A zero shows as `0.00` with no side, whether the server sent `null` or `DR`.
 */
export function formatBal(bal: Bal): string {
  const amount = formatAmount(bal.amount);
  if (isZeroAmount(bal.amount) || bal.side === null) return amount;
  return `${amount} ${bal.side === "DR" ? "Dr" : "Cr"}`;
}

/** Two balances are the same figure: same digits, and the same side unless zero. */
export function sameBal(a: Bal, b: Bal): boolean {
  if (isZeroAmount(a.amount) && isZeroAmount(b.amount)) return true;
  return formatAmount(a.amount) === formatAmount(b.amount) && a.side === b.side;
}
