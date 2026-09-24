/**
 * The two grids' columns: what each one MEANS here, joined to what `ui_tables`
 * 32 and 33 say about order, heading, width, visibility and focus.
 *
 * **This screen sets no widths of its own.** Both layouts are the Qt client's
 * Desktop rows and store its fractional width in `ui_tbl_clm_column_width`, so
 * the unit is `qtPercent` and writing a browser pixel count into it would
 * resize the desktop screen. A column the layout hides is simply not rendered;
 * a column it renames still finds its meaning, because the join falls back to
 * `ui_tbl_clm_no`.
 *
 * ── The hidden columns are not here ──────────────────────────────────────
 * Table 32 carries BillId, BillAccYear, PpdSuggested, DrCr and TcsAmount, and
 * table 33 carries Kind, TenderId, TenderTypeId, TenderLedger, ChequeJson,
 * LedgerId and IsSeeded. They were a Qt artefact: a `QTableWidgetItem`
 * delegate had no way to read a row's id or a flag except out of a hidden
 * cell. A React row carries them as fields, so a meaning for them would be a
 * column that renders nothing and can be un-hidden into an empty strip.
 *
 * ── Adding a column later needs the layout re-registered ─────────────────
 * `fixed.ui_table_columns` is keyed by column NUMBER, so inserting a column
 * mid-grid applies every stored width and heading to the column next to it.
 * The POST to `/ui-table-masters/create` must reuse each `uiTblClmId`, and
 * `uiTblClmNo` is a STRING.
 */
import type { UiTableColumnRow } from "@/features/sales/quotation/quotation.types";
import type { ColumnWidthUnit, ResolvedColumn } from "@/features/sales/quotation/quotation.utils";

export type ReceiptCellKind =
  | "text"
  | "money"
  | "date"
  | "int"
  | "chip"
  | "flag"
  | "picker"
  | "serial";

export type ColumnAlign = "left" | "right" | "center";

export type ReceiptColumnMeaning<TKey extends string> = {
  key: TKey;
  /** The heading used when the layout carries no name of its own. */
  token: string;
  kind: ReceiptCellKind;
  align: ColumnAlign;
  aliases?: string[];
};

/** Both layouts store the Qt fraction, never pixels. */
export const RECEIPT_COLUMN_WIDTH_UNIT: ColumnWidthUnit = "qtPercent";

// ---------------------------------------------------------------------------
// ui table 32 — "RECEIPT - BILLS"
// ---------------------------------------------------------------------------

export type BillColumnKey =
  | "docDate"
  | "docRefno"
  | "usrRefno"
  | "billType"
  | "dueDate"
  | "daysOverdue"
  | "billAmount"
  | "paid"
  | "pendingAmount"
  | "pdcHeld"
  | "tcsPending"
  | "receive"
  | "discount"
  | "writeOff"
  | "roundOff"
  | "after"
  | "billProfit"
  | "netProfit"
  | "note";

export const BILL_COLUMN_MEANINGS: ReceiptColumnMeaning<BillColumnKey>[] = [
  { key: "docDate", token: "Date", kind: "date", align: "center" },
  { key: "docRefno", token: "Ref", kind: "text", align: "left" },
  // OUR number is `docRefno`; this is THEIRS, and it is what a customer's
  // remittance advice quotes. Matching on ours means reading it off their
  // paperwork, which is the thing they did not send.
  { key: "usrRefno", token: "Their ref", kind: "text", align: "left" },
  { key: "billType", token: "Type", kind: "chip", align: "center" },
  { key: "dueDate", token: "Due", kind: "date", align: "center" },
  { key: "daysOverdue", token: "Days", kind: "int", align: "right" },
  { key: "billAmount", token: "Bill amount", kind: "money", align: "right" },
  { key: "paid", token: "Paid", kind: "money", align: "right" },
  { key: "pendingAmount", token: "Pending / Held", kind: "money", align: "right" },
  { key: "pdcHeld", token: "PDC held", kind: "money", align: "right" },
  { key: "tcsPending", token: "TCS due", kind: "money", align: "right" },
  { key: "receive", token: "Receive / Apply", kind: "money", align: "right" },
  { key: "discount", token: "Disc", kind: "money", align: "right" },
  { key: "writeOff", token: "W/off", kind: "money", align: "right" },
  { key: "roundOff", token: "R/off", kind: "money", align: "right" },
  { key: "after", token: "After", kind: "money", align: "right" },
  { key: "billProfit", token: "Profit", kind: "money", align: "right" },
  { key: "netProfit", token: "Net profit", kind: "money", align: "right" },
  { key: "note", token: "Note", kind: "text", align: "left" },
];

/** `ui_tbl_clm_no` per column — the rename escape hatch. */
export const BILL_COLUMN_NUMBERS: Record<BillColumnKey, number> = {
  docDate: 0,
  docRefno: 1,
  usrRefno: 2,
  billType: 3,
  dueDate: 4,
  daysOverdue: 5,
  billAmount: 6,
  paid: 7,
  pendingAmount: 8,
  pdcHeld: 9,
  tcsPending: 10,
  receive: 11,
  discount: 12,
  writeOff: 13,
  roundOff: 14,
  after: 15,
  billProfit: 16,
  netProfit: 17,
  note: 18,
};

/**
 * The cells a DR row opens. A CREDIT row opens only `receive` — where the
 * heading reads "Apply" — because a settlement discount cannot be given on a
 * credit note.
 */
export const BILL_EDITABLE_COLUMNS: ReadonlySet<BillColumnKey> = new Set<BillColumnKey>([
  "receive",
  "discount",
  "writeOff",
  "roundOff",
  "note",
]);

// ---------------------------------------------------------------------------
// ui table 33 — "RECEIPT - TENDERS"
// ---------------------------------------------------------------------------

export type TenderColumnKey =
  | "rowNo"
  | "type"
  | "amount"
  | "refNote"
  | "instrDate"
  | "bankName"
  | "mdr"
  | "drCr"
  | "settlesBill"
  | "against"
  | "pdcVoucher";

export const TENDER_COLUMN_MEANINGS: ReceiptColumnMeaning<TenderColumnKey>[] = [
  { key: "rowNo", token: "#", kind: "serial", align: "right" },
  { key: "type", token: "Type", kind: "picker", align: "left" },
  { key: "amount", token: "Amount", kind: "money", align: "right" },
  { key: "refNote", token: "Ref / narration", kind: "text", align: "left" },
  { key: "instrDate", token: "Instr. date", kind: "date", align: "center" },
  { key: "bankName", token: "Bank / drawer", kind: "picker", align: "left" },
  { key: "mdr", token: "MDR", kind: "money", align: "right" },
  { key: "drCr", token: "Dr/Cr", kind: "flag", align: "center" },
  { key: "settlesBill", token: "Settles bill", kind: "flag", align: "center" },
  { key: "against", token: "Against", kind: "picker", align: "left" },
  { key: "pdcVoucher", token: "PDC / voucher", kind: "chip", align: "center" },
];

export const TENDER_COLUMN_NUMBERS: Record<TenderColumnKey, number> = {
  rowNo: 0,
  type: 1,
  amount: 2,
  refNote: 3,
  instrDate: 4,
  bankName: 5,
  mdr: 6,
  drCr: 7,
  settlesBill: 8,
  against: 9,
  pdcVoucher: 10,
};

// ---------------------------------------------------------------------------
// The join
// ---------------------------------------------------------------------------

export type ResolvedReceiptColumn<TKey extends string> = ResolvedColumn<
  ReceiptColumnMeaning<TKey>
>;

const PX_PER_CONFIG_UNIT = 11;
const MIN_COLUMN_PX = 34;
const DEFAULT_COLUMN_PX = 90;

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function widthPxOf(row: UiTableColumnRow): number {
  const dragged = (row.uiTblClmPx ?? "").trim().match(/^(\d+(?:\.\d+)?)(px)?$/i);
  if (dragged) {
    const value = Number(dragged[1]);
    if (Number.isFinite(value) && value > 0) {
      return Math.max(MIN_COLUMN_PX, Math.round(value));
    }
  }
  const configured = row.uiTblClmColumnWidth;
  if (typeof configured !== "number" || !Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_COLUMN_PX;
  }
  // `ui_tbl_clm_column_width` is NOT a percent. Used as a CSS `%` against
  // `table-layout: fixed` it feeds back into its own container — the stored
  // fraction has to become pixels first.
  return Math.max(MIN_COLUMN_PX, Math.round(configured * PX_PER_CONFIG_UNIT));
}

/**
 * Layout rows joined to meanings, in `ui_tbl_clm_column_position` order with
 * `ui_tbl_clm_no` as the tie-break — live data can carry a duplicate position,
 * and without a second key the order between those two columns would be
 * non-deterministic.
 *
 * Name first, number second: a numbering that differed from the shipped map
 * would mislabel every column at once, where a name join simply drops the ones
 * it cannot place. With no layout at all, every meaning is rendered in
 * declaration order — a fallback, never a default.
 */
export function resolveReceiptColumns<TKey extends string>(
  rows: UiTableColumnRow[] | undefined,
  meanings: ReceiptColumnMeaning<TKey>[],
  columnNumbers: Record<TKey, number>,
): ResolvedReceiptColumn<TKey>[] {
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

  const byName = new Map<string, ReceiptColumnMeaning<TKey>>();
  for (const meaning of meanings) {
    byName.set(normalize(meaning.token), meaning);
    byName.set(meaning.key.toLowerCase(), meaning);
  }
  for (const meaning of meanings) {
    for (const alias of meaning.aliases ?? []) {
      const key = normalize(alias);
      if (key && !byName.has(key)) {
        byName.set(key, meaning);
      }
    }
  }
  const byNumber = new Map<number, ReceiptColumnMeaning<TKey>>();
  for (const [key, columnNo] of Object.entries(columnNumbers) as [TKey, number][]) {
    const meaning = meanings.find((candidate) => candidate.key === key);
    if (meaning) {
      byNumber.set(columnNo, meaning);
    }
  }

  const resolved: ResolvedReceiptColumn<TKey>[] = [];
  const taken = new Set<string>();
  for (const row of rows) {
    const rawName = row.uiTblClmName ?? "";
    const columnNumber = Number.parseInt(row.uiTblClmNo ?? "0", 10) || 0;
    const meaning = byName.get(normalize(rawName)) ?? byNumber.get(columnNumber);
    if (!meaning || taken.has(meaning.key)) {
      continue;
    }
    taken.add(meaning.key);
    resolved.push({
      ...meaning,
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

export function resolveBillColumns(
  rows: UiTableColumnRow[] | undefined,
): ResolvedReceiptColumn<BillColumnKey>[] {
  return resolveReceiptColumns(rows, BILL_COLUMN_MEANINGS, BILL_COLUMN_NUMBERS);
}

export function resolveTenderColumns(
  rows: UiTableColumnRow[] | undefined,
): ResolvedReceiptColumn<TenderColumnKey>[] {
  return resolveReceiptColumns(rows, TENDER_COLUMN_MEANINGS, TENDER_COLUMN_NUMBERS);
}
