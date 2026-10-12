/**
 * `/export` → the workbook (plan §10): a Summary sheet and a Vouchers sheet.
 *
 * This is the ONE place an amount string becomes a number, and it happens at
 * the sheet boundary: a spreadsheet user wants to sum the column, and nothing
 * reads the number back into the app. Every Total row is the server's totals
 * block, never a sum of the rows. Balances are written as the magnitude with
 * Dr/Cr in a column of their own, never as a signed figure.
 */
import { displayDate } from "@/features/reports/shared/wire/dates";
import { isZeroAmount } from "@/features/reports/shared/wire/money";
import type { Cell, Sheet } from "@/features/reports/shared/export/xlsx-writer";
import { checkSentence, sortChecks } from "../wire/checks";
import type { Bal, ExportPayload, SummaryPayload, VoucherRow } from "../wire/types";
import { buildTiles } from "../view/tiles";

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

function text(v: string | null | undefined, bold = false): Cell {
  return { t: "s", v: v ?? "", style: bold ? "bold" : "text" };
}

/** The sanctioned parse: an amount string → a money cell, for the spreadsheet only. */
function money(amount: string, bold = false): Cell {
  return { t: "n", v: Number(amount), style: bold ? "moneyBold" : "money" };
}

function count(n: number | null, bold = false): Cell {
  return n === null ? null : { t: "n", v: n, style: bold ? "bold" : "text" };
}

/** A balance's side; blank for zero, and for no balance (a voucher-type filter sends none). */
function side(bal: Bal | null): Cell {
  if (!bal || isZeroAmount(bal.amount) || !bal.side) return null;
  return text(bal.side === "DR" ? "Dr" : "Cr");
}

function balance(bal: Bal | null, bold = false): Cell {
  return bal ? money(bal.amount, bold) : null;
}

/** ISO day → a real Excel date, so the column sorts and filters as dates. */
function date(iso: string): Cell {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return text(iso);
  const serial = (Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) - EXCEL_EPOCH) / 86_400_000;
  return { t: "n", v: serial, style: "date" };
}

function scopeLine(summary: SummaryPayload): string {
  const s = summary.scope;
  const when =
    s.fromDate === s.toDate
      ? displayDate(s.fromDate)
      : `${displayDate(s.fromDate)} → ${displayDate(s.toDate)} · ${s.days} days`;
  return [s.companyName, s.branchName, s.accYear, when].filter(Boolean).join(" · ");
}

export function summarySheet(summary: SummaryPayload, opts: { clearingAsBank: boolean }): Sheet {
  const rows: Cell[][] = [];
  rows.push([text("Account Day Summary", true)]);
  rows.push([text(scopeLine(summary))]);
  rows.push([]);

  // Tiles: a two-column block (heading, figure), the sub line beside it.
  for (const [i, tile] of buildTiles(summary.tiles, { countDrafts: true }).entries()) {
    const raw = summary.tiles[i];
    const figure = raw.amount ?? raw.closing?.amount ?? null;
    rows.push([text(tile.heading, true), figure !== null ? money(figure) : null, text(tile.sub)]);
  }
  rows.push([]);

  const bankWord = opts.clearingAsBank ? "Bank + clearing" : "Bank";
  rows.push([text("Voucher types", true)]);
  rows.push(
    ["Type", "Short", "Vouchers", "Drafts", "Cancelled pairs", "Lone halves", "Amount", "Cash in", "Cash out", `${bankWord} in`, `${bankWord} out`].map(
      (h) => text(h, true),
    ),
  );
  for (const t of summary.types) {
    rows.push([
      text(t.name),
      text(t.short),
      count(t.vouchers),
      count(t.drafts),
      count(t.cancelledPairs),
      count(t.loneHalves),
      money(t.amount),
      money(t.cashIn),
      money(t.cashOut),
      money(t.bankIn),
      money(t.bankOut),
    ]);
  }
  const tt = summary.typeTotals;
  rows.push([
    text("Total", true),
    null,
    count(tt.vouchers, true),
    count(tt.drafts, true),
    count(tt.cancelledPairs, true),
    count(tt.loneHalves, true),
    money(tt.amount, true),
    money(tt.cashIn, true),
    money(tt.cashOut, true),
    money(tt.bankIn, true),
    money(tt.bankOut, true),
  ]);
  rows.push([]);

  rows.push([text("Cash & bank position", true)]);
  rows.push(["Ledger", "Kind", "Opening", "Dr/Cr", "In", "Out", "Closing", "Dr/Cr"].map((h) => text(h, true)));
  for (const m of summary.moneyLedgers) {
    rows.push([
      text(m.ledgerName),
      text(m.kind),
      balance(m.opening),
      side(m.opening),
      money(m.in),
      money(m.out),
      balance(m.closing),
      side(m.closing),
    ]);
  }
  const all = summary.moneyTotals.ALL;
  rows.push([
    text("Total", true),
    null,
    balance(all.opening, true),
    side(all.opening),
    money(all.in, true),
    money(all.out, true),
    balance(all.closing, true),
    side(all.closing),
  ]);
  rows.push([]);

  rows.push([text("Group summary", true)]);
  rows.push(["Ledger group", "Nature", "Debit", "Credit", "Net", "Dr/Cr"].map((h) => text(h, true)));
  for (const g of summary.groups) {
    rows.push([text(g.groupName), text(g.nature ?? ""), money(g.debit), money(g.credit), money(g.net.amount), side(g.net)]);
  }
  const gt = summary.groupTotals;
  rows.push([
    text("Total", true),
    null,
    money(gt.debit, true),
    money(gt.credit, true),
    gt.net ? money(gt.net.amount, true) : null,
    gt.net ? side(gt.net) : null,
  ]);
  rows.push([]);

  rows.push([text("Checks", true)]);
  for (const c of sortChecks(summary.checks)) rows.push([text(c.level), text(checkSentence(c))]);

  return { name: "Summary", rows, widths: [30, 16, 40, 10, 14, 12, 14, 14, 14, 18, 18] };
}

export const VOUCHER_HEADINGS = [
  "Date",
  "Type",
  "Voucher no",
  "Party / particulars",
  "Narration",
  "Branch",
  "Amount",
  "Status",
  "By",
  "Leg ledger",
  "Leg Dr/Cr",
  "Leg amount",
  "Leg role",
];

function typeLabel(row: VoucherRow): string {
  const type = (row.short ?? row.name ?? "").toUpperCase();
  if (row.rowKind === "REVERSAL") return type ? `${type} · REVERSAL` : "REVERSAL";
  if (row.rowKind === "CANCELLED") return type ? `${type} · CANCELLED` : "CANCELLED";
  return type;
}

function voucherColumns(row: VoucherRow): Cell[] {
  return [
    date(row.date),
    text(typeLabel(row)),
    text(row.voucherNo),
    text(row.party ?? (row.asPerDetails ? "(as per details)" : row.particulars)),
    text(row.narration),
    text(row.branchName),
    money(row.amount),
    text(row.status),
    text(row.createdBy),
  ];
}

/** One row per leg when legs are present, the voucher's columns repeated. */
export function vouchersSheet(rows: readonly VoucherRow[], totals: ExportPayload["totals"]): Sheet {
  const out: Cell[][] = [VOUCHER_HEADINGS.map((h) => text(h, true))];
  for (const row of rows) {
    const voucher = voucherColumns(row);
    if (row.legs && row.legs.length) {
      for (const leg of row.legs) {
        out.push([...voucher, text(leg.ledgerName), text(leg.side === "DR" ? "Dr" : "Cr"), money(leg.amount), text(leg.role)]);
      }
    } else {
      out.push(voucher);
    }
  }
  if (totals) out.push([text("Total", true), null, null, null, null, null, money(totals.amount, true)]);
  return { name: "Vouchers", rows: out, widths: [12, 18, 14, 32, 32, 16, 14, 11, 12, 28, 9, 14, 16] };
}

export function toXlsx(data: ExportPayload, opts: { clearingAsBank: boolean }): { fileName: string; sheets: Sheet[] } {
  const { fromDate, toDate } = data.summary.scope;
  const fileName = fromDate === toDate ? `day-summary_${fromDate}.xlsx` : `day-summary_${fromDate}_${toDate}.xlsx`;
  return { fileName, sheets: [summarySheet(data.summary, opts), vouchersSheet(data.vouchers, data.totals)] };
}
