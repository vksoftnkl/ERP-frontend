/**
 * Money on the Business Day screen, kept in whole paise (`bigint`).
 *
 * The grids answer pg NUMERIC as a STRING ("93930.00"), and the screen adds
 * them up — the expected cash of every closed session, the variance, the net
 * sales. Adding those as JS numbers is the float class of bug this house rules
 * out, so a figure is parsed straight from its digits into paise, summed as a
 * bigint, and only ever turned back into text for the screen.
 *
 * Nothing here calls `Number` or `parseFloat` on an amount.
 */
import { formatAmount } from "@/features/reports/shared/wire/money";

/** Two decimals: the till's own columns are numeric(…, 2). */
const SCALE = 2;
const AMOUNT = /^([+-]?)(\d*)(?:\.(\d*))?$/;
/** U+2212, the minus the Qt screen prints before a short. */
export const MINUS = "−";

/**
 * `"93930.00"` → `9393000n`; `"-1250.5"` → `-125050n`; `500` → `50000n`.
 * A third decimal rounds half away from zero. `null`, `""` and anything that is
 * not an amount read as `null` — the caller decides whether that is a zero.
 */
export function toPaise(value: unknown): bigint | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return value * BigInt(10 ** SCALE);
  let text: string;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    // A JSON number from a grid is already a decimal literal; `toFixed` would
    // round through binary first, so the digits are taken as JS prints them.
    text = String(value);
    if (/e/i.test(text)) return null;
  } else if (typeof value === "string") {
    text = value.trim().replace(/,/g, "");
  } else {
    return null;
  }
  const match = AMOUNT.exec(text);
  if (!match) return null;
  const [, sign, integerDigits, decimals = ""] = match;
  if (!integerDigits && !decimals) return null;
  const kept = (decimals + "0".repeat(SCALE)).slice(0, SCALE);
  let paise = BigInt(integerDigits || "0") * BigInt(10 ** SCALE) + BigInt(kept || "0");
  const next = decimals.charAt(SCALE);
  if (next && next >= "5") paise += BigInt(1);
  return sign === "-" ? -paise : paise;
}

/** As `toPaise`, a missing figure counting as zero (a column of a summed list). */
export function paiseOrZero(value: unknown): bigint {
  return toPaise(value) ?? BigInt(0);
}

/** `9393000n` → `"93930.00"` — the plain decimal string, sign and all. */
export function paiseToDecimal(paise: bigint): string {
  const negative = paise < BigInt(0);
  const magnitude = negative ? -paise : paise;
  const unit = BigInt(10 ** SCALE);
  const integer = (magnitude / unit).toString();
  const fraction = (magnitude % unit).toString().padStart(SCALE, "0");
  return `${negative ? "-" : ""}${integer}.${fraction}`;
}

/** `17630000n` → `"1,76,300.00"`; a short keeps a plain hyphen-minus. */
export function formatMoney(paise: bigint): string {
  return formatAmount(paiseToDecimal(paise));
}

/**
 * The Qt `signedMoney`: `−580.00` for a short, `+75.00` for an excess, a bare
 * `0.00` for neither — the sign is the point of a variance figure.
 */
export function formatSignedMoney(paise: bigint): string {
  if (paise === BigInt(0)) return formatMoney(paise);
  const magnitude = formatMoney(paise < BigInt(0) ? -paise : paise);
  return `${paise < BigInt(0) ? MINUS : "+"}${magnitude}`;
}

/** `-1`, `0` or `1`. */
export function signOf(paise: bigint): -1 | 0 | 1 {
  if (paise < BigInt(0)) return -1;
  return paise > BigInt(0) ? 1 : 0;
}

/** A whole count from a grid cell (`count(*)` answers as a string). Not money. */
export function toCount(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? Math.trunc(value) : 0;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && /^\s*-?\d+\s*$/.test(value)) return Number.parseInt(value, 10);
  return 0;
}
