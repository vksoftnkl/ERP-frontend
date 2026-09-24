/**
 * A grid 109 row, read into something the screen can trust.
 *
 * Two things arrive in a shape that silently lies if read naively:
 *
 *  - **Money is a STRING** (`"1000.00"`, pg NUMERIC). Read as a number it is
 *    `NaN` or `0`, and a register that totals to nothing looks perfectly fine.
 *  - **Dates are ISO strings**, sometimes whole timestamps. They are cut to the
 *    ten characters of a date, so comparisons are plain string comparisons.
 *
 * And one thing must never be read off a cell: the KEY. `apd_id`,
 * `apd_acc_year`, `apd_company_id` and `apd_branch_id` are hidden columns of
 * the grid, and a screen that reads them off a visible cell breaks the moment
 * an operator hides one. They come from the row object, always.
 */
import type {
  ChequeApiRow,
  ChequeKeys,
  ChequeRow,
  DueBucket,
  PostingMode,
} from "./types";

const BUCKETS: readonly DueBucket[] = ["FUTURE", "DUE_TODAY", "OVERDUE", "STALE"];

function text(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

/** `"1000.00"`, `1000`, `null` → a number. Never `NaN`. */
export function parseMoney(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  const parsed = Number.parseFloat(text(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** An ISO date or timestamp → `yyyy-mm-dd`, or null. */
export function parseDate(value: unknown): string | null {
  const raw = text(value);
  if (!/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return null;
  }
  return raw.slice(0, 10);
}

function parseBucket(value: unknown): DueBucket | null {
  const raw = text(value).toUpperCase();
  return (BUCKETS as readonly string[]).includes(raw) ? (raw as DueBucket) : null;
}

function parsePostingMode(value: unknown): PostingMode {
  // ON_RECEIPT is `accounts.pdc_posting_mode`'s default, and the mode that
  // leaves the bills alone at clearing — the conservative reading of a blank.
  return text(value).toUpperCase() === "ON_CLEARING" ? "ON_CLEARING" : "ON_RECEIPT";
}

/** One row of grid 109, "MAIN LIST - RECEIVED CHEQUES", under its SQL's own names. */
export function fromGridRow(raw: Record<string, unknown>): ChequeRow {
  return {
    apdId: text(raw.apd_id),
    accYear: text(raw.apd_acc_year),
    companyId: text(raw.apd_company_id),
    branchId: text(raw.apd_branch_id),
    instrumentNo: text(raw.apd_instrument_no),
    instrumentType: text(raw.apd_instrument_type),
    instrumentDate: parseDate(raw.apd_instrument_date),
    amount: parseMoney(raw.apd_amount),
    bankName: text(raw.apd_bank_name),
    drawerName: text(raw.apd_drawer_name),
    partyName: text(raw.party_name),
    status: text(raw.apd_status).toUpperCase(),
    bucket: parseBucket(raw.due_bucket),
    postingMode: parsePostingMode(raw.apd_posting_mode),
    depositDate: parseDate(raw.apd_deposit_date),
    depositSlipNo: text(raw.apd_deposit_slip_no),
    depositBankName: text(raw.deposit_bank_name),
    presentCount: Math.trunc(parseMoney(raw.apd_present_count)),
    clearDate: parseDate(raw.apd_clear_date),
    bounceDate: parseDate(raw.apd_bounce_date),
    bounceReason: text(raw.apd_bounce_reason),
    bounceCharges: parseMoney(raw.apd_bounce_charges),
    receiptRefno: text(raw.receipt_refno),
    clearRefno: text(raw.clear_refno),
    bounceRefno: text(raw.bounce_refno),
    replacedByNo: text(raw.replaced_by_no),
    remarks: text(raw.apd_remarks),
  };
}

/** A row as `/cheques/*` returns it, in the register's shape. */
export function fromApiRow(row: ChequeApiRow): ChequeRow {
  return {
    apdId: row.apdId,
    accYear: row.apdAccYear,
    companyId: row.apdCompanyId,
    branchId: row.apdBranchId,
    instrumentNo: text(row.apdInstrumentNo),
    instrumentType: text(row.apdInstrumentType),
    instrumentDate: parseDate(row.apdInstrumentDate),
    amount: parseMoney(row.apdAmount),
    bankName: text(row.apdBankName),
    drawerName: text(row.apdDrawerName),
    partyName: text(row.partyName),
    status: text(row.apdStatus).toUpperCase(),
    bucket: parseBucket(row.dueBucket),
    postingMode: parsePostingMode(row.apdPostingMode),
    depositDate: parseDate(row.apdDepositDate),
    depositSlipNo: text(row.apdDepositSlipNo),
    depositBankName: text(row.bankLedgerName),
    presentCount: Math.trunc(parseMoney(row.apdPresentCount)),
    clearDate: parseDate(row.apdClearDate),
    bounceDate: parseDate(row.apdBounceDate),
    bounceReason: text(row.apdBounceReason),
    bounceCharges: parseMoney(row.apdBounceCharges),
    receiptRefno: "",
    clearRefno: "",
    bounceRefno: "",
    replacedByNo: "",
    remarks: text(row.apdRemarks),
  };
}

/** The four keys every route takes — the ROW's, never the session's. */
export function keysOf(row: ChequeRow): ChequeKeys {
  return {
    apdId: row.apdId,
    apdAccYear: row.accYear,
    apdCompanyId: row.companyId,
    apdBranchId: row.branchId,
  };
}

/** Indian grouping, two decimals, a zero shown as `0.00`. */
export function formatAmount(value: number): string {
  return (Number.isFinite(value) ? value : 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** `yyyy-mm-dd` → `dd-mm-yyyy`, the way a register is read by eye. */
export function formatDate(value: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "");
  return match ? `${match[3]}-${match[2]}-${match[1]}` : "";
}

/** `"55492 — Deepan — 1,000.00"`. Every confirmation names rows this way. */
export function describe(row: ChequeRow): string {
  return [row.instrumentNo || "(no number)", row.partyName || "(no party)", formatAmount(row.amount)].join(
    " — ",
  );
}
