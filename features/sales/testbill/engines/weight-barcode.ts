/**
 * Sale Bill Entry — weight / price barcode labels (§9.2). Pure.
 *
 * `sales.weight_barcode` is a JSON setting: `{prefix, itemLen, valueLen,
 * valueKind: WEIGHT|PRICE, divisor}`. Numbers may arrive as strings, a
 * divisor ≤ 0 reads as 1, and the format is ENABLED only when prefix, itemLen
 * and valueLen are all set.
 *
 * A scan that matches the format is split into the item code (which goes to
 * the barcode lookup) and a VALUE that must wait: it lands only after the price
 * lookup has filled the line — WEIGHT into the quantity, PRICE into the rate —
 * because applied earlier the lookup would overwrite it.
 */
import type { PendingScanValue, WeightBarcodeConfig } from "@/features/sales/testbill/types";

function toInt(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").trim());
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

/** The setting's text, or `null` when the label format is not enabled. */
export function parseWeightBarcodeConfig(text: string | null | undefined): WeightBarcodeConfig | null {
  if (!text || !text.trim()) {
    return null;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const prefix = String(record.prefix ?? "").trim();
  const itemLen = toInt(record.itemLen);
  const valueLen = toInt(record.valueLen);
  if (!prefix || itemLen <= 0 || valueLen <= 0) {
    return null;
  }
  const kind = String(record.valueKind ?? "WEIGHT").trim().toUpperCase();
  const divisor = Number(record.divisor);
  return {
    prefix,
    itemLen,
    valueLen,
    valueKind: kind === "PRICE" ? "PRICE" : "WEIGHT",
    divisor: Number.isFinite(divisor) && divisor > 0 ? divisor : 1,
  };
}

export type DecodedWeightBarcode = {
  itemCode: string;
  pending: PendingScanValue;
};

/**
 * Split a scan by the label format, or `null` when it is not a weight label
 * (an ordinary barcode, sent to the lookup as it is).
 *
 * The scan must start with the prefix, be all digits, and be exactly
 * `prefix + itemLen + valueLen` long — or one more, for an EAN-13 check digit,
 * which is NOT verified.
 */
export function decodeWeightBarcode(
  scan: string,
  config: WeightBarcodeConfig | null,
): DecodedWeightBarcode | null {
  if (!config) {
    return null;
  }
  const code = scan.trim();
  if (!code.startsWith(config.prefix) || !/^\d+$/.test(code)) {
    return null;
  }
  const expected = config.prefix.length + config.itemLen + config.valueLen;
  if (code.length !== expected && code.length !== expected + 1) {
    return null;
  }
  const itemCode = code.slice(config.prefix.length, config.prefix.length + config.itemLen);
  const valueText = code.slice(config.prefix.length + config.itemLen, expected);
  const value = Number(valueText) / config.divisor;
  if (!Number.isFinite(value)) {
    return null;
  }
  return { itemCode, pending: { kind: config.valueKind, value } };
}
