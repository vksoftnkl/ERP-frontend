/**
 * How a figure reads on Loyalty Status — Qt `pts()` / `money()` / `showDate()`
 * in loyalty_status_entry.cpp, with the web's date rule (`dd/MM/yyyy`).
 *
 * Points are numbers on the wire: whole points in Indian grouping
 * (3,48,920); a fraction — a points rule with decimals — keeps two places.
 * Money is the server's two-decimal string, grouped as sent; the only
 * product the screen forms itself (closing × rate on the statement) goes
 * through `Decimal`, never a float.
 */
import { Decimal } from "@/domain/pricing/money";
import { isoToDisplayDate } from "@/lib/date-format";
import { formatAmount } from "@/features/reports/shared/wire/money";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `1234567` → `12,34,567`: the last three digits, then pairs. */
function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const head = digits.slice(0, -3);
  return `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${digits.slice(-3)}`;
}

/** A number off the wire, or 0 — Qt `NexJson::number`. */
export function num(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/** Text off the wire, or "" — Qt `NexJson::text`. */
export function txt(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : String(value);
}

/** Points: whole in Indian grouping, a fraction with two places. */
export function pts(value: unknown): string {
  const v = num(value);
  const negative = v < 0;
  const abs = Math.abs(v);
  let body: string;
  if (Number.isInteger(abs) || Math.abs(abs - Math.round(abs)) < 1e-9) {
    body = groupIndian(String(Math.round(abs)));
  } else {
    const [whole, decimals] = abs.toFixed(2).split(".");
    body = `${groupIndian(whole)}.${decimals}`;
  }
  return negative && body !== "0" ? `-${body}` : body;
}

/**
 * Money: the server's string grouped (`"87230.00"` → `87,230.00`). A number
 * (a figure the server sends as a number) gets two places. Null / blank →
 * `0.00`, as Qt's `money(num(…))`.
 */
export function money(value: unknown): string {
  if (typeof value === "string" && value.trim() !== "") return formatAmount(value.trim());
  if (typeof value === "number" && Number.isFinite(value)) return formatAmount(new Decimal(value).toFixed(2));
  return "0.00";
}

/** `closing × rate` as money, exactly. Blank when the rate is not a positive amount. */
export function pointsValue(points: number, rate: string | null | undefined): string {
  const r = (rate ?? "").trim();
  if (!r || !/^-?\d+(\.\d+)?$/.test(r)) return "";
  const rateDec = new Decimal(r);
  if (rateDec.lte(0)) return "";
  return formatAmount(new Decimal(points).times(rateDec).toFixed(2));
}

/** The API's ISO day as `dd/MM/yyyy`; blank when it is not one. */
export function showDate(iso: unknown): string {
  return isoToDisplayDate(txt(iso));
}

/** `2026-10-05` → `05/10` — Qt's short `dd-MM` in the house separator. */
export function dayMonth(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? `${match[3]}/${match[2]}` : "";
}

/** `2026-04` → `Apr`. */
export function monthShort(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  return match ? (MONTHS[Number(match[2]) - 1] ?? month) : month;
}

/** `2026-04` → `Apr 2026`. */
export function monthYear(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  return match ? `${MONTHS[Number(match[2]) - 1] ?? match[2]} ${match[1]}` : month;
}

/**
 * The server's `printedAs` line writes its dates `dd-MM-yyyy`; the web reads
 * every date `dd/MM/yyyy`, so they are re-spelled — nothing else is touched.
 */
export function respellDates(text: string): string {
  return text.replace(/\b(\d{2})-(\d{2})-(\d{4})\b/g, "$1/$2/$3");
}

/** Qt `LoyaltyBarChart::shortValue`: `1,250` → `1.3k`. */
export function shortValue(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value.toFixed(0);
}
