/**
 * Money on the approval screen, kept in the decimal-string domain.
 *
 * The grids send numerics as strings ("50.00", "10000.00"), the operator types
 * strings, and every comparison the screen makes — a probe a paisa above a
 * threshold, an amount against a grant's ceiling — is done on whole paise as a
 * `bigint`. Nothing here parses money into a float; `Number` appears only at
 * the wire boundary (`toWireNumber`), where the DTO asks for a number.
 */
import { formatAmount } from "@/features/reports/shared/wire/money";

const AMOUNT = /^(\d+)(?:\.(\d*))?$/;
const SCALE = 2;
const ONE = BigInt(10 ** SCALE);

/** Whole paise, or null for text that is not a non-negative amount. Extra places round half-up. */
export function toPaise(text: string): bigint | null {
  const match = AMOUNT.exec(String(text ?? "").replace(/,/g, "").trim());
  if (!match) return null;
  const decimals = match[2] ?? "";
  const kept = decimals.slice(0, SCALE).padEnd(SCALE, "0");
  let paise = BigInt(match[1]) * ONE + BigInt(kept);
  if (decimals.length > SCALE && Number(decimals[SCALE]) >= 5) paise += BigInt(1);
  return paise;
}

/** Paise back to `"1234.50"`. */
export function fromPaise(paise: bigint): string {
  const negative = paise < BigInt(0);
  const abs = negative ? -paise : paise;
  const whole = abs / ONE;
  const part = (abs % ONE).toString().padStart(SCALE, "0");
  return `${negative ? "-" : ""}${whole.toString()}.${part}`;
}

/** `"10000"` → `"10000.00"`; blank stays blank; junk comes back as it was. */
export function normalizeAmount(text: string): string {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return "";
  const paise = toPaise(trimmed);
  return paise === null ? trimmed : fromPaise(paise);
}

/** -1 / 0 / 1. Blank or junk counts as zero. */
export function compareAmount(left: string, right: string): number {
  const a = toPaise(left) ?? BigInt(0);
  const b = toPaise(right) ?? BigInt(0);
  return a < b ? -1 : a > b ? 1 : 0;
}

/** `amount` plus `paise` (the probe "a paisa above the threshold"). */
export function addPaise(amount: string, paise: number): string {
  return fromPaise((toPaise(amount) ?? BigInt(0)) + BigInt(paise));
}

/** Indian grouping, two places: `"10000"` → `"10,000.00"`. */
export function formatMoney(amount: string): string {
  return formatAmount(normalizeAmount(amount) || "0.00");
}

/** The DTO's number, from the exact decimal string. */
export function toWireNumber(amount: string): number {
  const normalized = normalizeAmount(amount);
  const value = Number(normalized || "0");
  return Number.isFinite(value) ? value : 0;
}

/** `"5.000"` → `"5"`, `"2.500"` → `"2.5"`: a percent as Qt's `%1` prints it. */
export function trimDecimal(text: string): string {
  const trimmed = String(text ?? "").trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return trimmed;
  return trimmed.includes(".") ? trimmed.replace(/0+$/, "").replace(/\.$/, "") : trimmed;
}

/** A whole number from text, rounding a fraction half-up; blank or junk is 0. */
export function toWhole(text: string): number {
  const paise = toPaise(text);
  if (paise === null) return 0;
  return Number((paise + ONE / BigInt(2)) / ONE);
}
