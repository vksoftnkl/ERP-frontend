/**
 * One opening line: its tracking rules, its arithmetic and its dates.
 *
 * Pure — the reducer, the payload builder, the validation and the grid all read
 * the same functions, so "which cells open", "what a line is worth" and "what is
 * a date" are each answered in one place.
 *
 * Ported from `opening_stock_entity.h` (tracks / trackedBy / the date bridge)
 * and `OpeningStockEntry::recalcRow()` / `recalcTotals()`.
 */
import { isRealDate } from "@/features/sales/quotation/quotation.utils";
import { DEFAULT_BUCKET, TRACK, type TrackFacet } from "./opening-stock.constants";
import type { OpeningStockLine, OpeningStockTotals } from "./opening-stock.types";

// ---------------------------------------------------------------------------
// Tracking signature
// ---------------------------------------------------------------------------

/**
 * Reads one facet out of a signature. An empty signature tracks nothing, which
 * is also `fn_stp_effective`'s answer when no policy row matches at all.
 */
export function tracks(signature: string | null | undefined, facet: TrackFacet): boolean {
  return (signature ?? "").includes(facet);
}

/** The "Tracked by" column: "batch + expiry", "MRP", "nothing". */
export function trackedBy(signature: string | null | undefined): string {
  const parts: string[] = [];
  if (tracks(signature, TRACK.Batch)) parts.push("batch");
  if (tracks(signature, TRACK.Expiry)) parts.push("expiry");
  if (tracks(signature, TRACK.Mrp)) parts.push("MRP");
  if (tracks(signature, TRACK.SalePrice)) parts.push("sale price");
  if (tracks(signature, TRACK.Serial)) parts.push("serial");
  if (tracks(signature, TRACK.Supplier)) parts.push("supplier");
  return parts.length === 0 ? "nothing" : parts.join(" + ");
}

/** A signature as stored on a row: blank becomes "N" — tracks nothing. */
export function normalizeSignature(signature: string | null | undefined): string {
  const trimmed = (signature ?? "").trim();
  return trimmed || TRACK.Nothing;
}

/**
 * The identity cells the ITEM decides — and which letter opens each. A column
 * not listed here is not an identity cell and is never greyed by the item.
 */
const IDENTITY_FACET: Partial<Record<keyof OpeningStockLine, TrackFacet>> = {
  batchNo: TRACK.Batch,
  mfgDate: TRACK.Expiry,
  expiryDate: TRACK.Expiry,
  mrp: TRACK.Mrp,
  salePrice: TRACK.SalePrice,
  serialNo: TRACK.Serial,
  supplierName: TRACK.Supplier,
};

/**
 * True when the field is an identity cell the row's item does not track — what
 * both refuses the editor and greys the cell (`isUntrackedIdentityCell`).
 */
export function isUntrackedIdentityField(
  line: Pick<OpeningStockLine, "trackSignature">,
  field: keyof OpeningStockLine,
): boolean {
  const facet = IDENTITY_FACET[field];
  return facet !== undefined && !tracks(line.trackSignature, facet);
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

let lineSequence = 0;

/** A fresh React key. Never sent. */
export function newLineKey(): string {
  lineSequence += 1;
  return `osl-${lineSequence}`;
}

export function blankLine(key: string = newLineKey()): OpeningStockLine {
  return {
    key,
    sviId: "",
    lineNo: 0,
    splitNo: 0,
    barcode: "",
    itemCode: "",
    itemName: "",
    unitName: "",
    qty: 0,
    freeQty: 0,
    batchNo: "",
    mfgDate: "",
    expiryDate: "",
    mrp: 0,
    salePrice: 0,
    serialNo: "",
    bucket: "",
    costPerUnit: 0,
    taxPerc: 0,
    costRateWot: 0,
    landedRate: 0,
    weightQty: 0,
    value: 0,
    valueWot: 0,
    remarks: "",
    itemId: "",
    uomId: "",
    baseUomId: "",
    toBaseFactor: 0,
    baseQty: 0,
    freeBaseQty: 0,
    godownId: "",
    godownName: "",
    lotId: "",
    supplierId: "",
    supplierName: "",
    decimalCount: 0,
    trackSignature: "",
    costRate: 0,
    problem: "",
  };
}

/** A row with no item is not a line — the trailing blank row, or one the operator emptied. */
export function hasItem(line: Pick<OpeningStockLine, "itemId">): boolean {
  return line.itemId.trim() !== "";
}

/**
 * The grid always ends in exactly one row with no item, the row the next item
 * is picked or scanned into. Picking into the last row is what grew the Qt grid
 * by one; keeping it as an invariant here means no action has to remember to.
 */
export function withTrailingBlank(lines: readonly OpeningStockLine[]): OpeningStockLine[] {
  const last = lines[lines.length - 1];
  if (last && !hasItem(last)) {
    return [...lines];
  }
  return [...lines, blankLine()];
}

/** The quantity editors' precision — the item's own, else three places. */
export function qtyDecimals(line: Pick<OpeningStockLine, "decimalCount">): number {
  return line.decimalCount > 0 ? line.decimalCount : 3;
}

/** Bucket for a freshly picked line — an opening lands SALEABLE unless told otherwise. */
export function defaultBucket(): string {
  return DEFAULT_BUCKET;
}

// ---------------------------------------------------------------------------
// Line maths — `recalcRow()`
// ---------------------------------------------------------------------------

/**
 * Every figure here is one the SERVER will also compute (`svi_value` and
 * `svi_value_wot` are GENERATED). The screen computes them anyway, so a cost
 * keyed per BOX instead of per piece shows as a twelve-fold value before it is
 * posted.
 *
 *   baseQty     = qty     × toBaseFactor   (the server does NOT multiply)
 *   freeBaseQty = freeQty × toBaseFactor
 *   costRate    = costPerUnit ÷ toBaseFactor   — the per-BASE-unit wire rate
 *   costRateWot = costRate ÷ (1 + tax%), ONLY when it is 0 — a typed one stands
 *   value       = (baseQty + freeBaseQty) × costRate
 *   valueWot    = (baseQty + freeBaseQty) × costRateWot
 *
 * A row with no item is returned untouched.
 */
export function recalcLine(line: OpeningStockLine): OpeningStockLine {
  if (!hasItem(line)) {
    return line;
  }
  const factor = line.toBaseFactor > 0 ? line.toBaseFactor : 1;
  const baseQty = line.qty * factor;
  const freeBaseQty = line.freeQty * factor;
  const costRate = line.costPerUnit / factor;

  // Derived only when blank: a screen that overwrote a typed figure would make
  // a mixed levy (GST + a per-unit cess) impossible to express.
  let costRateWot = line.costRateWot;
  if (costRateWot <= 0 && costRate > 0) {
    costRateWot = line.taxPerc > 0 ? costRate / (1 + line.taxPerc / 100) : costRate;
  }

  const units = baseQty + freeBaseQty;
  return {
    ...line,
    baseQty,
    freeBaseQty,
    costRate,
    costRateWot,
    value: units * costRate,
    valueWot: units * costRateWot,
  };
}

/** The document totals — `recalcTotals()`. */
export function computeTotals(lines: readonly OpeningStockLine[]): OpeningStockTotals {
  let count = 0;
  let qty = 0;
  let value = 0;
  let valueWot = 0;
  for (const line of lines) {
    if (!hasItem(line)) {
      continue;
    }
    // svh_line_count counts LINES, not rows: a split of 1 starts a line, the
    // same rule the payload numbers them by.
    if (Math.max(1, Math.trunc(line.splitNo)) === 1) {
      count += 1;
    }
    qty += line.baseQty + line.freeBaseQty;
    value += line.value;
    valueWot += line.valueWot;
  }
  return { lines: count, qty, value, valueWot };
}

/**
 * The line number each row will be SAVED under, by row key. A split of 1 opens
 * a new line; a higher split belongs to the line above it. Rows with no item
 * have none.
 */
export function lineNumbersOf(lines: readonly OpeningStockLine[]): Map<string, number> {
  const numbers = new Map<string, number>();
  let lineNo = 0;
  for (const line of lines) {
    if (!hasItem(line)) {
      continue;
    }
    if (Math.max(1, Math.trunc(line.splitNo)) === 1) {
      lineNo += 1;
    }
    numbers.set(line.key, Math.max(lineNo, 1));
  }
  return numbers;
}

// ---------------------------------------------------------------------------
// Grid numbers
// ---------------------------------------------------------------------------

/**
 * A committed numeric cell, the way `QDoubleValidator(0, 999999999, decimals)`
 * would have let it through: blank is 0, a non-number or a negative is REFUSED
 * (`null` — the cell keeps what it had), and the figure is held to the column's
 * decimals.
 */
export function parseGridNumber(raw: string, decimals: number): number | null {
  const text = raw.trim().replace(/,/g, "");
  if (text === "" || text === ".") {
    return 0;
  }
  if (!/^\d*\.?\d*$/.test(text)) {
    return null;
  }
  const parsed = Number.parseFloat(text);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 999_999_999) {
    return null;
  }
  const factor = 10 ** Math.max(0, decimals);
  return Math.round(parsed * factor) / factor;
}

/** Display precision for a rate: as many places as it carries, between 2 and 6. */
export function ratePrecision(value: number): number {
  if (!Number.isFinite(value) || value === 0) {
    return 2;
  }
  const text = (Math.round(value * 1e6) / 1e6).toString();
  const dot = text.indexOf(".");
  const places = dot < 0 ? 0 : text.length - dot - 1;
  return Math.min(6, Math.max(2, places));
}

// ---------------------------------------------------------------------------
// Dates — what is SHOWN is not what goes on the WIRE
// ---------------------------------------------------------------------------

const GRID_DATE = /^(\d{2})-(\d{2})-(\d{4})$/;
const ISO_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Cell text → ISO for the payload. Empty for anything that is not a real date,
 * so a half-typed "31-03-20" is dropped rather than sent — the validation
 * refuses it by name before that can happen (`isUnparsableDate`).
 */
export function dateToWire(shown: string | null | undefined): string {
  const text = (shown ?? "").trim();
  if (!text) {
    return "";
  }
  const grid = GRID_DATE.exec(text);
  if (grid) {
    const iso = `${grid[3]}-${grid[2]}-${grid[1]}`;
    return isRealDate(iso) ? iso : "";
  }
  // Already wire-shaped (a full timestamp included — only its date half matters).
  const iso = ISO_PREFIX.exec(text);
  if (iso) {
    const candidate = `${iso[1]}-${iso[2]}-${iso[3]}`;
    return isRealDate(candidate) ? candidate : "";
  }
  return "";
}

/** ISO (or a timestamp) → the cell's dd-mm-yyyy. Text that is not a date is shown as it came. */
export function dateFromWire(iso: string | null | undefined): string {
  const text = (iso ?? "").trim();
  if (!text) {
    return "";
  }
  const match = ISO_PREFIX.exec(text);
  if (!match) {
    return text;
  }
  const candidate = `${match[1]}-${match[2]}-${match[3]}`;
  return isRealDate(candidate) ? `${match[3]}-${match[2]}-${match[1]}` : text;
}

/** Neither blank nor a real date — a typo the operator has to be told about. */
export function isUnparsableDate(shown: string | null | undefined): boolean {
  return (shown ?? "").trim() !== "" && dateToWire(shown) === "";
}

/**
 * What a committed date cell holds. NexDateEdit's mask turned "31032027" into
 * "31-03-2027" as it was typed; the web cell has no mask, so the same tolerance
 * is applied on commit — any real date in dd mm yyyy order, with `-`, `/`, `.`
 * or no separator, is written back as dd-mm-yyyy. Anything else is kept as
 * typed, for the validation to name.
 */
export function normalizeGridDate(raw: string): string {
  const text = raw.trim();
  if (!text) {
    return "";
  }
  const digits = text.replace(/[^0-9]/g, "");
  const separated = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(text);
  let day: string | null = null;
  let month: string | null = null;
  let year: string | null = null;
  if (separated) {
    day = separated[1].padStart(2, "0");
    month = separated[2].padStart(2, "0");
    year = separated[3];
  } else if (/^\d{8}$/.test(digits) && digits.length === text.length) {
    day = digits.slice(0, 2);
    month = digits.slice(2, 4);
    year = digits.slice(4);
  }
  if (day && month && year && isRealDate(`${year}-${month}-${day}`)) {
    return `${day}-${month}-${year}`;
  }
  return text;
}
