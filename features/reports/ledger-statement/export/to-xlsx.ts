/**
 * `/export` (+ `/monthly`) → the workbook (plan §11).
 *
 * This is the ONE place an amount string becomes a number, and it happens at
 * the sheet boundary: a spreadsheet user wants to sum the column, and nothing
 * reads the number back into the app. Balances are written as the magnitude
 * with Dr/Cr in a column of their own, never as a signed figure.
 *
 * The Opening, Total and Closing rows are the server's `header.period`
 * figures, as on screen. The Total row is never a sum of the rows.
 */
import { displayDate, monthLabel, previousDay } from "../wire/dates";
import { isZeroAmount } from "../wire/money";
import type { Bal, ExportPayload, MonthlyPayload, VoucherRow } from "../wire/types";
import type { Cell, Sheet } from "./xlsx-writer";

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

function text(v: string | null | undefined, bold = false): Cell {
  return { t: "s", v: v ?? "", style: bold ? "bold" : "text" };
}

/** An amount string → a money cell. Blank for zero when `blankZero`. */
function money(amount: string, { bold = false, blankZero = false } = {}): Cell {
  if (blankZero && isZeroAmount(amount)) return null;
  return { t: "n", v: Number(amount), style: bold ? "moneyBold" : "money" };
}

function side(bal: Bal): Cell {
  if (isZeroAmount(bal.amount) || !bal.side) return null;
  return text(bal.side === "DR" ? "Dr" : "Cr");
}

/** ISO day → a real Excel date, so the column sorts and filters as dates. */
function date(iso: string): Cell {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return text(iso);
  const serial = (Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) - EXCEL_EPOCH) / 86_400_000;
  return { t: "n", v: serial, style: "date" };
}

function typeLabel(row: VoucherRow): string {
  const type = (row.voucherTypeShort ?? row.voucherTypeName ?? "").toUpperCase();
  if (row.rowKind === "REVERSAL") return type ? `REVERSAL · ${type}` : "REVERSAL";
  if (row.rowKind === "CANCELLED") return type ? `${type} · CANCELLED` : "CANCELLED";
  return type;
}

export const VOUCHER_HEADINGS = [
  "Date",
  "Type",
  "Voucher",
  "Particulars",
  "Bill refs",
  "Narration",
  "Branch",
  "Debit",
  "Credit",
  "Balance",
  "Dr/Cr",
  "By",
] as const;

const DEBIT = VOUCHER_HEADINGS.indexOf("Debit");

function voucherRow(row: VoucherRow): Cell[] {
  return [
    date(row.date),
    text(typeLabel(row)),
    text(row.voucherNo),
    text(row.particulars ?? "(as per details)"),
    text(row.billRefs.length ? `agst ${row.billRefs.join(", ")}` : ""),
    text(row.narration),
    text(row.branchName),
    money(row.debit, { blankZero: true }),
    money(row.credit, { blankZero: true }),
    money(row.balance.amount),
    side(row.balance),
    text(row.createdBy),
  ];
}

/** A row that puts `cells` at the Debit column onward, with a label in Particulars. */
function footRow(label: string, dateCell: Cell, fromDebit: Cell[]): Cell[] {
  const row: Cell[] = new Array(VOUCHER_HEADINGS.length).fill(null);
  row[0] = dateCell;
  row[3] = text(label, true);
  fromDebit.forEach((cell, i) => {
    row[DEBIT + i] = cell;
  });
  return row;
}

export type ExportMeta = { branchLabel: string; companyName?: string | null };

function statementSheet(data: ExportPayload, meta: ExportMeta): Sheet {
  const { ledger, period } = data;
  const rows: Cell[][] = [
    [text("Ledger Statement", true)],
    [text("Ledger", true), text(ledger.name)],
    ...(meta.companyName ? [[text("Company", true), text(meta.companyName)]] : []),
    [text("Period", true), text(`${displayDate(period.fromDate)} to ${displayDate(period.toDate)}`)],
    [text("Branch", true), text(meta.branchLabel)],
    [],
    [text(`Opening at ${displayDate(period.fromDate)}`, true), money(period.opening.amount), side(period.opening)],
    [text(`Debits (${period.debit.vouchers} vouchers)`, true), money(period.debit.amount)],
    [text(`Credits (${period.credit.vouchers} vouchers)`, true), money(period.credit.amount)],
    [text(`Closing at ${displayDate(period.toDate)}`, true), money(period.closing.amount, { bold: true }), side(period.closing)],
    [],
    VOUCHER_HEADINGS.map((heading) => text(heading, true)),
    footRow(`Opening balance b/f`, date(previousDay(period.fromDate)), [
      null,
      null,
      money(period.opening.amount, { bold: true }),
      side(period.opening),
    ]),
    ...data.rows.map(voucherRow),
    footRow("Total for the period", null, [
      money(period.debit.amount, { bold: true }),
      money(period.credit.amount, { bold: true }),
    ]),
    footRow("Closing balance c/f", date(period.toDate), [
      null,
      null,
      money(period.closing.amount, { bold: true }),
      side(period.closing),
    ]),
  ];
  return { name: "Statement", rows, widths: [12, 18, 14, 34, 24, 34, 16, 14, 14, 16, 6, 14] };
}

function monthlySheet(data: MonthlyPayload): Sheet {
  const rows: Cell[][] = [
    ["Month", "Debit", "Credit", "Closing", "Dr/Cr"].map((heading) => text(heading, true)),
    [text("Opening", true), null, null, money(data.opening.amount, { bold: true }), side(data.opening)],
    ...data.months.map((m): Cell[] =>
      m.isFuture
        ? [text(monthLabel(m.month))]
        : [
            text(monthLabel(m.month)),
            money(m.debit, { blankZero: true }),
            money(m.credit, { blankZero: true }),
            money(m.closing.amount),
            side(m.closing),
          ],
    ),
    [text("Closing", true), null, null, money(data.closing.amount, { bold: true }), side(data.closing)],
  ];
  return { name: "Month-wise", rows, widths: [14, 16, 16, 16, 6] };
}

function fileSafe(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "ledger";
}

export function exportFileName(ledgerName: string, fromDate: string, toDate: string): string {
  return `Ledger_${fileSafe(ledgerName)}_${fromDate}_${toDate}.xlsx`;
}

export function toXlsx(
  data: ExportPayload,
  monthly: MonthlyPayload | null,
  meta: ExportMeta,
): { fileName: string; sheets: Sheet[] } {
  const sheets = [statementSheet(data, meta)];
  if (monthly) sheets.push(monthlySheet(monthly));
  return {
    fileName: exportFileName(data.ledger.name, data.period.fromDate, data.period.toDate),
    sheets,
  };
}
