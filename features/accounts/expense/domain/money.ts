/**
 * Money on the expense voucher, in integer paise.
 *
 * The voucher posts only when the lines equal the tenders TO THE PAISA, and the
 * server decides that in Decimal. The Qt screen summed `double`s and compared
 * with a 0.005 tolerance; here every sum is an integer number of paise, so the
 * "balanced" the screen shows can never disagree with the server by rounding.
 *
 * What the operator TYPES stays text in the draft (`"1,000.5"`), read here;
 * what the server SENDS is a number (`1180`), read here too. The two meet only
 * as paise.
 */
import { formatAmount } from "@/features/reports/shared/wire/money";

/** The most a line or a tender may carry — the Qt spin box's 99,999,999.99. */
export const MAX_AMOUNT_PAISE = 9_999_999_999;

const TYPED = /^(\d*)(?:\.(\d{0,2}))?$/;

/**
 * Typed text → paise. Blank is 0; group separators and spaces are ignored.
 * `null` for anything that is not an amount of at most two decimals (a minus,
 * a letter, a third decimal) or is above the maximum — never a guess.
 */
export function parseAmountText(text: string): number | null {
  const cleaned = (text ?? "").replace(/[,\s]/g, "");
  if (cleaned === "" || cleaned === ".") {
    return 0;
  }
  const match = TYPED.exec(cleaned);
  if (!match) {
    return null;
  }
  const rupees = match[1] === "" ? 0 : Number.parseInt(match[1], 10);
  const decimals = (match[2] ?? "").padEnd(2, "0");
  const paise = rupees * 100 + Number.parseInt(decimals, 10);
  if (!Number.isSafeInteger(paise) || paise > MAX_AMOUNT_PAISE) {
    return null;
  }
  return paise;
}

/** Typed text → paise, an unreadable entry counting as 0 (the problem check names it). */
export function paiseOfText(text: string): number {
  return parseAmountText(text) ?? 0;
}

/** A server figure (a number, or a numeric string) → paise, rounded half-up. */
export function paiseOfNumber(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }
  // The epsilon absorbs 1.005 × 100 = 100.49999999999999.
  return Math.round(number * 100 + (number >= 0 ? 1e-6 : -1e-6));
}

/** Paise → the wire's decimal string: `100050` → `"1000.50"`. */
export function paiseToDecimal(paise: number): string {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(paise));
  const rupees = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, "0");
  return `${sign}${rupees}.${rest}`;
}

/** Paise → Indian-format money: `12345678` → `"1,23,456.78"`. Zero is `"0.00"`. */
export function formatPaise(paise: number): string {
  return formatAmount(paiseToDecimal(paise));
}

/** A server number → Indian-format money. */
export function formatMoney(value: unknown): string {
  return formatPaise(paiseOfNumber(value));
}

/**
 * What an amount box shows once the caret leaves it: the typed amount in the
 * house format (`"1000.5"` → `"1,000.50"`), blank for zero, and an unreadable
 * entry left exactly as typed so the operator sees what is wrong.
 */
export function tidyAmountText(text: string): string {
  const paise = parseAmountText(text);
  if (paise === null) {
    return text;
  }
  return paise === 0 ? "" : formatPaise(paise);
}

/** Σ in paise. */
export function sumPaise(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
