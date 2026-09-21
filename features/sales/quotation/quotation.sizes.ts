/**
 * Multi-size entry — one item keyed in several sizes. Pure: no React, no Redux,
 * no API.
 *
 * Shared by Quotation Entry and Sale Bill, which is why every function here is
 * generic over the line type: `SaleBillDraftLine` is the quotation's `DraftLine`
 * plus the bill's own columns, and the two differ in exactly one thing this
 * module cares about — what identity a brand-new row has to shed. Each screen
 * answers that by handing in its own line-copier (see `applySizeEntry`), so the
 * rules below are stated once and cannot drift between the screens.
 *
 * One item quoted in four sizes is four `sale_quotation_item` rows, not one row
 * with a list — the line table has a single `sqi_size` and the unique index
 * `ux_sqi_quote_line` is on `(sqi_quote_id, sqi_line_no)` (plus `sqi_acc_year`
 * since the partitioning migration), NOT on the item. So nothing has to change
 * server-side: the sizes are already allowed to be separate lines, and this
 * module is only about keying them in one pass instead of four.
 *
 * What a "size" is on this screen is worth stating, because it is not a master:
 * `sqi_size` is varchar(50) free text holding the dimensions the operator keyed
 * (`"45*2*2*6"` = length ft × width in × thickness in × pieces), and
 * `cubicFeetFromSize` turns them into the CFT that becomes the line's Bill Qty.
 * There is no size master anywhere in the schema to drive a dropdown from, so a
 * size row is keyed through the same four boxes the grid's Size cell uses.
 *
 * Two rules the row-replace below is built around:
 *
 *  - **An existing row is carried across, not rebuilt.** A row that was already
 *    on the quotation keeps its own object — and with it its `sqiId`, so the
 *    next save UPDATEs that line instead of inserting a duplicate, and its own
 *    discount / batch / godown values, so re-opening the dialog and pressing
 *    Save is a no-op. Only genuinely new rows are cut from the template.
 *  - **Nothing is recalculated here.** `recalcDocument(draft)` derives every
 *    total from the lines on each render, and the slice wrapper marks the draft
 *    dirty for any action it handles, so replacing the rows IS the whole edit.
 */
import type { DraftLine } from "./quotation.types";

/**
 * The shape this module needs off a draft line. Both screens' line types satisfy
 * it — `SaleBillDraftLine` by extending `DraftLine` — and naming it here keeps
 * the generics honest about what is actually read.
 */
export type SizeGroupLine = Pick<
  DraftLine,
  "key" | "itemId" | "itemSize" | "itemName" | "itemCode" | "unitName" | "billQty" | "rate" | "lineGroupKey"
>;
import {
  SIZE_FACTOR_COUNT,
  cubicFeetFromSize,
  joinSizeFactors,
  nextRowKey,
  splitSizeFactors,
} from "./quotation.utils";

/**
 * The keyed part of a dialog row — everything the operator types, and nothing
 * about which line it came from. Split out so the readers and the validator
 * below stay non-generic: they answer questions about the keystrokes, which are
 * the same on every screen.
 */
export type SizeEntryValues = {
  /** Identity inside the dialog only — never the draft line's `key`. */
  key: string;
  /** The four dimension boxes, exactly as keyed. */
  factors: string[];
  /** Raw keyed text, so a half-typed `"1."` survives a re-render. */
  qty: string;
  rate: string;
  /**
   * `false` while Qty is following the size's CFT.
   *
   * It goes `true` when the operator keys a quantity — a plank cut short is why
   * Bill Qty is editable on the grid too — and back to `false` on the next edit
   * to the dimensions, because keying a size re-derives the quantity there as
   * well and the dialog must not disagree with the cell it stands in for.
   */
  qtyTouched: boolean;
};

/** One row of the Size Entry dialog. Local to the dialog until Save. */
export type SizeEntryRow<T extends SizeGroupLine = DraftLine> = SizeEntryValues & {
  /**
   * The draft line this row was opened from, or `null` for a row the operator
   * added in the dialog. This is what lets Save preserve the row's server id and
   * everything else the dialog does not show.
   */
  source: T | null;
};

/** Per-row validation messages, keyed by the cell they belong under. */
export type SizeRowErrors = {
  size?: string;
  qty?: string;
  rate?: string;
};

export type SizeEntryValidation = {
  /** `true` when Save may proceed. */
  ok: boolean;
  /** Dialog-level message — an empty grid has no cell to hang an error on. */
  formError: string | null;
  /** Row key → the cells that failed. Rows that passed are absent. */
  rows: Record<string, SizeRowErrors>;
};

/** A contiguous run of lines that are one item quoted in several sizes. */
export type SizeGroup<T extends SizeGroupLine = DraftLine> = {
  /** Index of the first line of the run. */
  start: number;
  /** Index of the last line of the run, inclusive. */
  end: number;
  lines: T[];
};

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

/**
 * Which size group a line belongs to, or `null` for a line that is not part of
 * one.
 *
 * `lineGroupKey` is the stamp this module puts on every row it writes, so the
 * run test below is one string comparison. It is deliberately NOT persisted —
 * the server has no column for it — so a quotation loaded back from
 * `GET /quotations/get` falls through to the second rule: a line that names an
 * item AND carries a size groups by its item id. That is what makes "re-open a
 * saved multi-size item" work without a migration.
 *
 * A line with no size is its own group even when the item repeats. Two rows of
 * the same item keyed as two batches, or copied with Alt+R, are not sizes of one
 * line and must not be swallowed into a dialog that would rewrite them.
 */
export function sizeGroupKeyOf(line: SizeGroupLine): string | null {
  if (!line.itemId) {
    return null;
  }
  if (line.lineGroupKey) {
    return line.lineGroupKey;
  }
  return (line.itemSize ?? "").trim() ? line.itemId : null;
}

/**
 * The run of lines the dialog opens on, given the row that was double-clicked.
 *
 * `null` when the row names no item — there is nothing to size yet, and the
 * trailing blank row must not open a dialog. A row that names an item but is in
 * no group is a group of one, which is the normal way a second size gets added
 * to a line that was keyed as a single.
 */
export function findSizeGroup<T extends SizeGroupLine>(
  lines: T[],
  rowKey: string,
): SizeGroup<T> | null {
  const index = lines.findIndex((line) => line.key === rowKey);
  if (index < 0 || !lines[index].itemId) {
    return null;
  }
  const groupKey = sizeGroupKeyOf(lines[index]);
  if (!groupKey) {
    return { start: index, end: index, lines: [lines[index]] };
  }
  let start = index;
  while (start > 0 && sizeGroupKeyOf(lines[start - 1]) === groupKey) {
    start -= 1;
  }
  let end = index;
  while (end < lines.length - 1 && sizeGroupKeyOf(lines[end + 1]) === groupKey) {
    end += 1;
  }
  return { start, end, lines: lines.slice(start, end + 1) };
}

// ---------------------------------------------------------------------------
// Dialog rows
// ---------------------------------------------------------------------------

/** A number out of a keyed cell. Blank and junk both read as 0, never NaN. */
function numberOf(raw: string): number {
  const parsed = Number((raw ?? "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * What a row's Qty is, in full: the keyed quantity once the operator has touched
 * it, otherwise the CFT the size works out to. This is the one figure the rest
 * of the dialog (Amount, the totals, the save) reads — never `row.qty` directly.
 */
export function sizeRowQty(row: SizeEntryValues): number {
  if (row.qtyTouched) {
    return numberOf(row.qty);
  }
  return cubicFeetFromSize(joinSizeFactors(row.factors)) ?? 0;
}

export function sizeRowRate(row: SizeEntryValues): number {
  return numberOf(row.rate);
}

export function sizeRowAmount(row: SizeEntryValues): number {
  // Two decimals, the precision the grid's currency cells carry. Rounded through
  // a string so float dust never reaches the footer total.
  return Number((sizeRowQty(row) * sizeRowRate(row)).toFixed(2));
}

export function sizeEntryTotals(rows: SizeEntryValues[]): { qty: number; amount: number } {
  const qty = rows.reduce((total, row) => total + sizeRowQty(row), 0);
  const amount = rows.reduce((total, row) => total + sizeRowAmount(row), 0);
  return { qty: Number(qty.toFixed(3)), amount: Number(amount.toFixed(2)) };
}

/** The size string a row would be saved as. */
export function sizeRowText(row: SizeEntryValues): string {
  return joinSizeFactors(row.factors);
}

/**
 * A row to key the next size into — a copy of the row above it, or a blank one
 * when there is nothing above.
 *
 * Sizes on one item are keyed as variations of each other: the same board in
 * five lengths, the same length in three thicknesses. Starting a new row blank
 * makes the operator re-key the three boxes that did not change, so the previous
 * row's dimensions are carried in and the cursor lands on the first box with its
 * value selected — typing replaces it, Enter walks to the box that actually
 * differs. Two rows left identical are allowed — the same piece twice is a real
 * entry, not a slip.
 *
 * The copy is of the KEYSTROKES only: `source` stays `null`, so a copied row is
 * still a brand-new line and sheds its identity through the screen's own copier
 * (see `applySizeEntry`). Qty follows the copied size rather than the previous
 * row's keyed quantity — a quantity cut short belongs to the row it was cut on.
 */
export function createSizeEntryRow<T extends SizeGroupLine>(
  baseRate: number,
  previous?: SizeEntryValues | null,
): SizeEntryRow<T> {
  const factors = previous
    ? [...previous.factors]
    : Array.from({ length: SIZE_FACTOR_COUNT }, () => "");
  const cft = cubicFeetFromSize(joinSizeFactors(factors));
  return {
    key: nextRowKey("size"),
    factors,
    qty: cft === null ? "" : String(cft),
    rate: previous ? previous.rate : baseRate ? String(baseRate) : "",
    qtyTouched: false,
    source: null,
  };
}

/**
 * The dialog's opening rows, one per line of the group.
 *
 * `qtyTouched` is what the line's Bill Qty says it is, and the distinction
 * matters on the most ordinary path there is:
 *
 *  - a line that **already has a quantity** opens with it keyed. That figure is
 *    what was quoted, and re-deriving it from the size would silently overwrite
 *    a quantity the operator had cut short — the case the grid's own Size cell
 *    leaves alone;
 *  - a line with **no quantity yet** — an item just picked, which is when this
 *    dialog is most often opened — has nothing to protect, so it follows its
 *    size like a row added here. Otherwise keying the dimensions leaves Qty
 *    blank and the dialog blocks its own save on a row it just filled in.
 *
 * Opening is the only moment this protects a stored quantity. Once the operator
 * edits that row's dimensions it follows them again, exactly as it would if they
 * had keyed the size in the grid instead.
 */
export function openSizeEntry<T extends SizeGroupLine>(group: SizeGroup<T>): SizeEntryRow<T>[] {
  return group.lines.map((line) => ({
    key: nextRowKey("size"),
    factors: splitSizeFactors(line.itemSize),
    qty: line.billQty ? String(line.billQty) : "",
    rate: line.rate ? String(line.rate) : "",
    qtyTouched: line.billQty > 0,
    source: line,
  }));
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Every rule the spec blocks Save on, reported per cell so the dialog can paint
 * the offending box rather than a banner the operator has to match up by eye.
 *
 * Repeating the same size on several rows is allowed: the operator may well be
 * entering the same piece twice, so it is not an error.
 */
export function validateSizeEntry(rows: SizeEntryValues[]): SizeEntryValidation {
  const result: Record<string, SizeRowErrors> = {};
  if (rows.length === 0) {
    return { ok: false, formError: "Add at least one size.", rows: result };
  }

  for (const row of rows) {
    const errors: SizeRowErrors = {};
    if (!sizeRowText(row)) {
      errors.size = "Size is required.";
    }

    if (sizeRowQty(row) <= 0) {
      // A row still following its size has no Qty of its own to be wrong — what
      // is wrong is a size that works out to nothing, so say that instead.
      errors.qty = row.qtyTouched
        ? "Qty must be more than 0."
        : "That size works out to no quantity.";
    }
    if (sizeRowRate(row) < 0) {
      errors.rate = "Rate cannot be negative.";
    }
    if (errors.size || errors.qty || errors.rate) {
      result[row.key] = errors;
    }
  }

  return { ok: Object.keys(result).length === 0, formError: null, rows: result };
}

// ---------------------------------------------------------------------------
// The row replace
// ---------------------------------------------------------------------------

/**
 * Replace a size group with the dialog's rows — the whole of Save, as one pure
 * function over the lines array.
 *
 * The rows land at the group's own index, consecutively, and every line outside
 * the group is untouched (same objects, so nothing else in the grid re-renders).
 *
 * What each emitted row carries:
 *
 *  - a row that came from the document keeps **itself** — its `key` (so grid
 *    focus survives the save), its server id (so the next save updates that line
 *    rather than inserting a second one) and every column the dialog does not
 *    show: discounts, scheme, batch, godown, salesman, the tax block;
 *  - a row the operator added in the dialog is cut from the **template** — the
 *    group's first line — so it inherits exactly those same columns, which is
 *    what "copied from the original row" means here.
 *
 * `duplicateLine` is how a screen says what a brand-new row must NOT inherit,
 * and it is deliberately the screen's own Alt+R copier rather than a list of
 * field names: the two answers must be the same one. On a quotation that is the
 * row key and the ids owned outside the draft; a bill sheds `sbiId` and its
 * whole `srcDoc*` trail as well, because three size rows inheriting one order
 * line's trail would make that line look billed three times.
 *
 * Note what this does NOT do: it never renumbers, never touches the line number
 * (the payload builder numbers the populated lines on the way out) and never
 * reprices. The engine derives from the fields set here on the next render.
 */
export function applySizeEntry<T extends SizeGroupLine>(
  lines: T[],
  anchorKey: string,
  rows: SizeEntryRow<T>[],
  duplicateLine: (template: T) => T,
): T[] {
  const group = findSizeGroup(lines, anchorKey);
  if (!group || rows.length === 0) {
    return lines;
  }
  const template = group.lines[0];
  // The dialog may hand back the same source line twice if a caller duplicated
  // a row object instead of adding a blank one; the second claim would emit two
  // lines sharing a key AND a server id. First claim wins, the rest are new rows.
  const claimed = new Set<string>();

  const replacement = rows.map((row) => {
    const source =
      row.source && !claimed.has(row.source.key) && row.source.itemId === template.itemId
        ? row.source
        : null;
    if (source) {
      claimed.add(source.key);
    }
    return {
      ...(source ?? duplicateLine(template)),
      // Rows the dialog writes are stamped, so the next double-click groups them
      // without having to fall back to "same item and both have a size".
      lineGroupKey: template.itemId,
      itemSize: sizeRowText(row) || null,
      billQty: sizeRowQty(row),
      rate: sizeRowRate(row),
    };
  });

  return [...lines.slice(0, group.start), ...replacement, ...lines.slice(group.end + 1)];
}
