/**
 * Money on the till screens — every figure in INTEGER PAISE.
 *
 * The till routes send money as numbers and the configured grids as strings;
 * a cashier types it as text. All three come in through `toPaise`, all
 * arithmetic (a count, a difference, a total) is integer addition, and only
 * the edges convert back: `paiseToNumber` for a request body, `formatMoney` for
 * the screen. Nothing here multiplies a float by a float.
 *
 * Formatting is Indian (`1,23,456.50`), through the reports' string formatter,
 * so the till reads like every other screen.
 */
import { formatAmount } from "@/features/reports/shared/wire/money";

const DECIMAL = /^([+-]?)(\d*)(?:\.(\d*))?$/;

/**
 * A decimal string to paise, exactly: the third decimal rounds half away from
 * zero. `"1.005"` → 101, `"500"` → 50000, `"-2.5"` → -250. Null when the text
 * is not a number.
 */
function decimalToPaise(text: string): number | null {
  const match = DECIMAL.exec(text);
  if (!match) return null;
  const [, sign, whole = "", fraction = ""] = match;
  if (!whole && !fraction) return null;
  const rupees = whole ? Number.parseInt(whole, 10) : 0;
  const cents = Number.parseInt((fraction + "00").slice(0, 2), 10);
  const roundUp = fraction.length > 2 && fraction.charCodeAt(2) >= 53; // '5'
  const magnitude = rupees * 100 + cents + (roundUp ? 1 : 0);
  return sign === "-" && magnitude !== 0 ? -magnitude : magnitude;
}

/**
 * Anything the server or a field holds, as paise. Numbers go through their own
 * shortest decimal text (`String(1.005)` is `"1.005"`), so a float that looks
 * right on the wire rounds the way it reads. Null for null, blank or not a
 * number — the caller decides whether that means 0 or "not shown".
 */
export function toPaise(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    const text = String(value);
    if (/e/i.test(text)) return Math.round(value * 100);
    return decimalToPaise(text);
  }
  if (typeof value === "string") {
    const text = value.trim().replace(/,/g, "");
    return text ? decimalToPaise(text) : null;
  }
  return null;
}

/** `toPaise`, with "nothing" read as zero. */
export function paiseOf(value: unknown): number {
  return toPaise(value) ?? 0;
}

/** 123450 → `"1234.50"` — the wire's own shape, for formatting. */
export function paiseToAmount(paise: number): string {
  const negative = paise < 0;
  const magnitude = Math.abs(Math.trunc(paise));
  const whole = Math.floor(magnitude / 100);
  const cents = String(magnitude % 100).padStart(2, "0");
  return `${negative && magnitude !== 0 ? "-" : ""}${whole}.${cents}`;
}

/** Paise to the number a request body carries (two places, no float drift). */
export function paiseToNumber(paise: number): number {
  return Number(paiseToAmount(paise));
}

/** 12345650 → `"1,23,456.50"`; a negative keeps an ASCII minus. */
export function formatMoney(paise: number): string {
  return formatAmount(paiseToAmount(paise));
}

/** A server figure, or blank when it sent null (hidden, or not applicable). */
export function formatFigure(value: unknown): string {
  const paise = toPaise(value);
  return paise === null ? "" : formatMoney(paise);
}

/**
 * A signed figure the way the Qt till writes it: `−10.00` with a TRUE minus,
 * `+10.00`, and a bare `0.00` for nothing.
 */
export function formatSignedMoney(paise: number): string {
  if (paise === 0) return formatMoney(0);
  return `${paise < 0 ? "−" : "+"}${formatMoney(Math.abs(paise))}`;
}

/**
 * What a cashier may have typed into an amount box so far: digits, one point,
 * two decimals. Used to refuse a keystroke, not to parse.
 */
export function isAmountDraft(text: string): boolean {
  return /^\d{0,9}(\.\d{0,2})?$/.test(text);
}

/** A typed amount as paise; blank or unreadable is 0. */
export function amountInputPaise(text: string): number {
  const paise = toPaise(text);
  return paise !== null && paise > 0 ? paise : 0;
}

/** Paise back into an input's text: `""` for zero, `"2000"` / `"2000.50"` otherwise. */
export function paiseToInput(paise: number): string {
  if (!paise) return "";
  const amount = paiseToAmount(paise);
  return amount.endsWith(".00") ? amount.slice(0, -3) : amount;
}
