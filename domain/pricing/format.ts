/**
 * Display formatting for the pricing screens — the port of
 * `NexNumberFormat::formatCurrency`.
 *
 * Indian 3-2 digit grouping (12,34,567.89), a fixed number of decimals, and
 * zero-suppression: a 0 renders as an empty cell unless the caller asks for it,
 * because an item grid full of "0.00" is unreadable.
 */
const GROUPING = /\B(?=(\d{2})+(?!\d))/g;
/** Group the integer part the Indian way: last three digits, then pairs. */
function groupIndian(digits: string): string {
  if (digits.length <= 3) {
    return digits;
  }
  const head = digits.slice(0, digits.length - 3);
  const tail = digits.slice(digits.length - 3);
  return `${head.replace(GROUPING, ",")},${tail}`;
}
export function formatCurrency(value: number | string | null | undefined, precision = 2, showZero = false): string {
  const numeric = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(numeric)) {
    return showZero ? (0).toFixed(precision) : "";
  }
  if (numeric === 0 && !showZero) {
    return "";
  }
  const negative = numeric < 0;
  const fixed = Math.abs(numeric).toFixed(precision);
  const [integerPart, decimalPart] = fixed.split(".");
  const grouped = groupIndian(integerPart);
  const body = decimalPart ? `${grouped}.${decimalPart}` : grouped;
  return negative ? `-${body}` : body;
}
/** A quantity: same grouping, but zero-suppressed at a caller-chosen precision. */
export function formatQty(value: number | string | null | undefined, precision = 3): string {
  return formatCurrency(value, precision, false);
}
/** A percentage, always shown (a 0% discount is meaningful in a discount cell). */
export function formatPerc(value: number | string | null | undefined, precision = 2): string {
  return formatCurrency(value, precision, true);
}