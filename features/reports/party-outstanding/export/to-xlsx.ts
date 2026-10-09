/**
 * `/export` → the workbook (plan §13).
 *
 * This is the ONE place an amount string becomes a number, and it happens at
 * the sheet boundary: a spreadsheet user wants to sum the column, and nothing
 * reads the number back into the app. Balances are written as the magnitude
 * with Dr/Cr in a column of its own, never as a signed figure.
 *
 * Sheet 1 starts with `printedAs` (the applied filters as one sentence, from
 * the server). The bucket columns come from the response's labels, and the
 * totals row is the response's totals, never a sum of the rows.
 */
import type { Cell, Sheet } from "@/features/reports/shared/export/xlsx-writer";
import { isZeroAmount } from "@/features/reports/shared/wire/money";
import { onAccountSideOf, owedSideOf } from "../view/cells";
import type {
  Bal,
  BillsExportPayload,
  BillWiseRow,
  OutstandingSide,
  PartiesExportPayload,
  PartyRow,
  Side,
} from "../wire/types";

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

function text(v: string | null | undefined, bold = false): Cell {
  return { t: "s", v: v ?? "", style: bold ? "bold" : "text" };
}

/** An amount string → a money cell. Blank for zero when `blankZero`. */
function money(amount: string, { bold = false, blankZero = false } = {}): Cell {
  if (blankZero && isZeroAmount(amount)) return null;
  return { t: "n", v: Number(amount), style: bold ? "moneyBold" : "money" };
}

function count(value: number | null, { blankZero = false } = {}): Cell {
  if (value === null || (blankZero && value === 0)) return null;
  return { t: "n", v: value, style: "text" };
}

function sideWord(side: Side | null): Cell {
  return side ? text(side === "DR" ? "Dr" : "Cr") : null;
}

function balSide(bal: Bal): Cell {
  return isZeroAmount(bal.amount) ? null : sideWord(bal.side);
}

/** ISO day → a real Excel date, so the column sorts and filters as dates. */
function date(iso: string | null): Cell {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return text(iso);
  const serial = (Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) - EXCEL_EPOCH) / 86_400_000;
  return { t: "n", v: serial, style: "date" };
}

/* ------------------------------------------------------------- parties */

export function partyHeadings(labels: readonly string[]): string[] {
  return [
    "Party",
    "Area",
    "Phone",
    "Cr days",
    "Bills",
    "Pending bills",
    "On-acct Cr",
    "Net outstanding",
    "Dr/Cr",
    ...labels,
    "Overdue",
    "Oldest (days)",
    "PDC in hand",
    "Flags",
  ];
}

function partyLine(row: PartyRow): Cell[] {
  return [
    text(row.name),
    text(row.area),
    text(row.phone),
    count(row.creditDays),
    count(row.bills, { blankZero: true }),
    money(row.owed, { blankZero: true }),
    money(row.onAccount, { blankZero: true }),
    money(row.net.amount),
    balSide(row.net),
    ...row.buckets.map((amount) => money(amount, { blankZero: true })),
    money(row.overdue, { blankZero: true }),
    count(row.oldestDays),
    money(row.pdcInHand, { blankZero: true }),
    text(row.flags.join(", ").replace(/_/g, " ")),
  ];
}

function partiesSheet(data: PartiesExportPayload): Sheet {
  const t = data.totals;
  const parties = data.totalRows;
  return {
    name: "Party-wise",
    rows: [
      [text(data.printedAs, true)],
      ...(data.companyName ? [[text(data.companyName)]] : []),
      [],
      partyHeadings(data.bucketLabels).map((heading) => text(heading, true)),
      ...data.rows.map(partyLine),
      [
        text(`Total · ${parties} ${parties === 1 ? "party" : "parties"}`, true),
        null,
        null,
        null,
        count(t.bills),
        money(t.owed, { bold: true }),
        money(t.onAccount, { bold: true }),
        money(t.net.amount, { bold: true }),
        balSide(t.net),
        ...t.buckets.map((amount) => money(amount, { bold: true })),
        money(t.overdue, { bold: true }),
        null,
        money(t.pdcInHand, { bold: true }),
        null,
      ],
    ],
    widths: [32, 14, 14, 8, 7, 14, 13, 15, 6, ...data.bucketLabels.map(() => 13), 14, 9, 13, 22],
  };
}

/* --------------------------------------------------------------- bills */

export const BILL_HEADINGS = [
  "Party",
  "Area",
  "Date",
  "Type",
  "Bill no",
  "Branch",
  "Due",
  "Bill amt",
  "Adjusted",
  "Pending",
  "Dr/Cr",
  "Age (days)",
  "Overdue (days)",
  "Remarks",
] as const;

function billLine(row: BillWiseRow, side: OutstandingSide): Cell[] {
  const pendingSide = row.side === "ON_ACCOUNT" ? onAccountSideOf(side) : owedSideOf(side);
  return [
    text(row.partyName),
    text(row.area),
    date(row.docDate),
    text(row.billType.replace(/_/g, " ")),
    text(row.docRefno),
    text(row.branchName),
    row.side === "ON_ACCOUNT" ? null : date(row.dueDate ?? row.dueEff),
    money(row.billAmount),
    money(row.adjusted, { blankZero: true }),
    money(row.pending),
    sideWord(pendingSide),
    count(row.ageDays),
    count(row.overdueDays !== null && row.overdueDays > 0 ? row.overdueDays : null),
    text([row.remarks ?? "", row.tenderDerived ? "paid at counter" : ""].filter(Boolean).join(" · ")),
  ];
}

function billsSheet(data: BillsExportPayload): Sheet {
  const t = data.totals;
  return {
    name: "Bill-wise",
    rows: [
      [text(data.printedAs, true)],
      ...(data.companyName ? [[text(data.companyName)]] : []),
      [],
      BILL_HEADINGS.map((heading) => text(heading, true)),
      ...data.rows.map((row) => billLine(row, data.side)),
      [
        text(`Total · ${data.totalRows} ${data.totalRows === 1 ? "bill" : "bills"}`, true),
        null,
        null,
        null,
        null,
        null,
        null,
        money(t.billAmount, { bold: true }),
        money(t.adjusted, { bold: true }),
        money(t.net.amount, { bold: true }),
        balSide(t.net),
        null,
        null,
        null,
      ],
    ],
    widths: [30, 14, 12, 12, 14, 14, 12, 14, 13, 15, 6, 10, 13, 32],
  };
}

export function exportFileName(side: OutstandingSide, asOn: string): string {
  return `Outstanding_${side === "PAYABLE" ? "P" : "R"}_${asOn}.xlsx`;
}

export function toXlsx(data: PartiesExportPayload | BillsExportPayload): { fileName: string; sheets: Sheet[] } {
  return {
    fileName: exportFileName(data.side, data.asOn),
    sheets: [data.shape === "PARTIES" ? partiesSheet(data) : billsSheet(data)],
  };
}
