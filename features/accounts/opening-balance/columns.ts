/**
 * The two grids' columns: what each one MEANS here, joined to what `ui_tables`
 * 30 and 31 say about order, heading, width and visibility.
 *
 * The layout's `ui_tbl_clm_column_focus` is read and carried through, but on
 * these grids it decides only where the keyboard walk LANDS when it enters a
 * row, not where Enter stops — see `components/grid-focus.ts` for why.
 *
 * **This screen sets no widths of its own.** That was a firm rule on the desktop
 * build — a re-seed of the layout fought the operator's saved percentages — and
 * it holds here for the same reason: the layout is theirs, the meaning is ours.
 * A column the layout hides is simply not rendered; a column it renames still
 * finds its meaning, because the join falls back to `ui_tbl_clm_no`.
 *
 * Both tables store the desktop client's Qt fraction in
 * `ui_tbl_clm_column_width` and carry no `ui_tbl_clm_px`, so the width unit is
 * `qtPercent`. Writing a browser pixel count into the fraction would resize the
 * Qt screen, so nothing here writes a width at all.
 */
import {
  type ColumnWidthUnit,
  type ResolvedColumn,
} from "@/features/sales/quotation/quotation.utils";
import type { UiTableColumnRow } from "@/features/sales/quotation/quotation.types";

/** How a cell is drawn, and whether it takes a keystroke. */
export type OpeningCellKind =
  | "text"
  | "money"
  | "side"
  | "chip"
  | "count"
  | "lookup"
  | "date"
  | "int"
  | "flag";

export type ColumnAlign = "left" | "right" | "center";

export type OpeningColumnMeaning<TKey extends string> = {
  /** The normalised `ui_tbl_clm_name` this meaning answers to. */
  key: TKey;
  /** The heading used when the layout carries no name of its own. */
  token: string;
  kind: OpeningCellKind;
  align: ColumnAlign;
  /** Other names the same column has been configured under. */
  aliases?: string[];
};

/** Both layouts store the Qt fraction, never pixels. */
export const OPENING_COLUMN_WIDTH_UNIT: ColumnWidthUnit = "qtPercent";

// ---------------------------------------------------------------------------
// ui table 30 — "OPENING BALANCE - LEDGERS"
// ---------------------------------------------------------------------------

export type LedgerColumnKey =
  | "ledger"
  | "group"
  | "nature"
  | "billwise"
  | "priorclosing"
  | "side"
  | "opening"
  | "drcr"
  | "source"
  | "stale"
  | "bills"
  | "remarks";

/**
 * The twelve columns this screen draws, in the layout's own `ui_tbl_clm_no`
 * order.
 *
 * The three the desktop layout also carries — `OpId`, `LedgerId`, `IsBillWise` —
 * are NOT here. They were a Qt artefact: a `QTableWidgetItem` delegate had no
 * way to read a row's id or a boolean flag except out of a hidden cell. A React
 * row carries them as fields, so a hidden column would be a column that renders
 * nothing and can be un-hidden into an empty strip.
 */
export const LEDGER_COLUMN_MEANINGS: OpeningColumnMeaning<LedgerColumnKey>[] = [
  { key: "ledger", token: "Ledger", kind: "lookup", align: "left" },
  { key: "group", token: "Group", kind: "text", align: "left" },
  { key: "nature", token: "Nature", kind: "text", align: "left" },
  { key: "billwise", token: "Bill-wise", kind: "chip", align: "center" },
  { key: "priorclosing", token: "Prior closing", kind: "money", align: "right" },
  { key: "side", token: "Side", kind: "text", align: "center" },
  { key: "opening", token: "Opening", kind: "money", align: "right" },
  { key: "drcr", token: "Dr/Cr", kind: "side", align: "center" },
  { key: "source", token: "Source", kind: "chip", align: "center" },
  { key: "stale", token: "Stale", kind: "chip", align: "center" },
  { key: "bills", token: "Bills", kind: "count", align: "right" },
  { key: "remarks", token: "Remarks", kind: "text", align: "left" },
];

/**
 * `ui_tbl_clm_no` per column, the rename escape hatch: a deployment that renames
 * "Prior closing" in UI Table Master changes the only thing a name join has to
 * go on, and the column would vanish from the grid. Matched by number
 * afterwards it still finds its meaning, and then paints the new name.
 */
export const LEDGER_COLUMN_NUMBERS: Record<LedgerColumnKey, number> = {
  ledger: 0,
  group: 1,
  nature: 2,
  billwise: 3,
  priorclosing: 4,
  side: 5,
  opening: 6,
  drcr: 7,
  source: 8,
  stale: 9,
  bills: 10,
  remarks: 11,
};

// ---------------------------------------------------------------------------
// ui table 31 — "OPENING BALANCE - BILLS"
// ---------------------------------------------------------------------------

export type BillColumnKey =
  | "invoiceno"
  | "invoicedate"
  | "duedate"
  | "creditdays"
  | "grace"
  | "drcr"
  | "amount"
  | "narration"
  | "allocated"
  | "pending"
  | "status";

export const BILL_COLUMN_MEANINGS: OpeningColumnMeaning<BillColumnKey>[] = [
  { key: "invoiceno", token: "Invoice no", kind: "text", align: "left" },
  { key: "invoicedate", token: "Invoice date", kind: "date", align: "center" },
  { key: "duedate", token: "Due date", kind: "date", align: "center" },
  { key: "creditdays", token: "Credit days", kind: "int", align: "right" },
  { key: "grace", token: "Grace", kind: "int", align: "right" },
  { key: "drcr", token: "Dr/Cr", kind: "side", align: "center" },
  { key: "amount", token: "Amount", kind: "money", align: "right" },
  { key: "narration", token: "Narration", kind: "text", align: "left" },
  { key: "allocated", token: "Allocated", kind: "money", align: "right" },
  { key: "pending", token: "Pending", kind: "money", align: "right" },
  { key: "status", token: "Status", kind: "chip", align: "center" },
];

export const BILL_COLUMN_NUMBERS: Record<BillColumnKey, number> = {
  invoiceno: 0,
  invoicedate: 1,
  duedate: 2,
  creditdays: 3,
  grace: 4,
  drcr: 5,
  amount: 6,
  narration: 7,
  allocated: 8,
  pending: 9,
  status: 10,
};

/**
 * The bill columns a RECEIPTED bill refuses.
 *
 * The route's own description says a receipted bill accepts "date, credit-day
 * and narration changes", and the Qt delegate left Invoice date editable on the
 * strength of it. The service disagrees: alongside amount, side and reference it
 * compares `ablDocDate` and refuses a change to it with the same message. So the
 * invoice DATE is frozen too, and only the due date, the two day counts and the
 * narration move.
 *
 * Grace days were the other open question, and the same code answers it: the
 * frozen-bill update writes `ablGraceDays`, so it stays editable.
 */
export const BILL_FROZEN_COLUMNS: ReadonlySet<BillColumnKey> = new Set<BillColumnKey>([
  "invoiceno",
  "invoicedate",
  "drcr",
  "amount",
]);

/** Columns that are display-only for every bill: GENERATED or server-derived. */
export const BILL_READONLY_COLUMNS: ReadonlySet<BillColumnKey> = new Set<BillColumnKey>([
  "allocated",
  "pending",
  "status",
]);

// ---------------------------------------------------------------------------
// The join
// ---------------------------------------------------------------------------

export type ResolvedOpeningColumn<TKey extends string> = ResolvedColumn<
  OpeningColumnMeaning<TKey>
>;

const PX_PER_CONFIG_UNIT = 11;
const MIN_COLUMN_PX = 34;
const DEFAULT_COLUMN_PX = 90;

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function widthPxOf(row: UiTableColumnRow): number {
  const px = (row.uiTblClmPx ?? "").trim().match(/^(\d+(?:\.\d+)?)(px)?$/i);
  if (px) {
    const value = Number(px[1]);
    if (Number.isFinite(value) && value > 0) {
      return Math.max(MIN_COLUMN_PX, Math.round(value));
    }
  }
  const configured = row.uiTblClmColumnWidth;
  if (typeof configured !== "number" || !Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_COLUMN_PX;
  }
  // `ui_tbl_clm_column_width` is NOT a percent. Used as a CSS `%` against
  // `table-layout: fixed` it feeds back into its own container; the Qt fraction
  // has to become pixels first.
  return Math.max(MIN_COLUMN_PX, Math.round(configured * PX_PER_CONFIG_UNIT));
}

/**
 * Layout rows joined to meanings, in `ui_tbl_clm_column_position` order with
 * `ui_tbl_clm_no` as the tie-break — live data can carry a duplicate position,
 * and without a second key the order between those two columns would be
 * non-deterministic.
 *
 * A configured row with no meaning here is dropped (it would render an empty
 * column). A meaning with no configured row is dropped too: the deployment owns
 * which columns it shows. If the layout could not be fetched at all, every
 * meaning is rendered in declaration order — a fallback, never a default.
 */
export function resolveOpeningColumns<TKey extends string>(
  rows: UiTableColumnRow[] | undefined,
  meanings: OpeningColumnMeaning<TKey>[],
  columnNumbers: Record<TKey, number>,
): ResolvedOpeningColumn<TKey>[] {
  if (!rows || rows.length === 0) {
    return meanings.map((meaning, index) => ({
      ...meaning,
      header: meaning.token,
      widthPx: DEFAULT_COLUMN_PX,
      visible: true,
      focus: false,
      necessity: false,
      position: index,
      columnNumber: index,
      columnId: null,
    }));
  }

  const byKey = new Map<string, OpeningColumnMeaning<TKey>>();
  for (const meaning of meanings) {
    byKey.set(normalize(meaning.token), meaning);
    byKey.set(meaning.key, meaning);
  }
  for (const meaning of meanings) {
    for (const alias of meaning.aliases ?? []) {
      const key = normalize(alias);
      if (key && !byKey.has(key)) {
        byKey.set(key, meaning);
      }
    }
  }
  const byNumber = new Map<number, OpeningColumnMeaning<TKey>>();
  for (const [key, columnNo] of Object.entries(columnNumbers) as [TKey, number][]) {
    const meaning = meanings.find((candidate) => candidate.key === key);
    if (meaning) {
      byNumber.set(columnNo, meaning);
    }
  }

  const resolved: ResolvedOpeningColumn<TKey>[] = [];
  const taken = new Set<string>();
  for (const row of rows) {
    const rawName = row.uiTblClmName ?? "";
    const columnNumber = Number.parseInt(row.uiTblClmNo ?? "0", 10) || 0;
    // Name first, number second. A numbering that differs from the shipped map
    // would mislabel every column at once, where a name join simply drops the
    // ones it cannot place.
    const meaning = byKey.get(normalize(rawName)) ?? byNumber.get(columnNumber);
    if (!meaning || taken.has(meaning.key)) {
      continue;
    }
    taken.add(meaning.key);
    resolved.push({
      ...meaning,
      // Whatever the layout calls it: the heading is UI Table Master's to set.
      header: rawName || meaning.token,
      widthPx: widthPxOf(row),
      visible: row.uiTblClmColumnVisibility !== false,
      focus: row.uiTblClmColumnFocus === true,
      necessity: row.uiTblClmColumnNecessity === true,
      position: row.uiTblClmColumnPosition ?? 0,
      columnNumber,
      columnId: row.uiTblClmId ?? null,
    });
  }
  return resolved.sort(
    (left, right) => left.position - right.position || left.columnNumber - right.columnNumber,
  );
}

export function resolveLedgerColumns(
  rows: UiTableColumnRow[] | undefined,
): ResolvedOpeningColumn<LedgerColumnKey>[] {
  return resolveOpeningColumns(rows, LEDGER_COLUMN_MEANINGS, LEDGER_COLUMN_NUMBERS);
}

export function resolveBillColumns(
  rows: UiTableColumnRow[] | undefined,
): ResolvedOpeningColumn<BillColumnKey>[] {
  return resolveOpeningColumns(rows, BILL_COLUMN_MEANINGS, BILL_COLUMN_NUMBERS);
}
