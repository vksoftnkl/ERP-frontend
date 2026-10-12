/**
 * Every cell's text, decided here and nowhere else, so the mockup can be
 * asserted to the character in node (`cells.test.ts`; there is no jsdom).
 *
 * Every figure printed is a string the server sent, formatted from the
 * string: a row's own, or a totals block's. No function here adds, subtracts
 * or compares two amounts (plan §15). Counts are printed as sent too.
 */
import { displayDate } from "@/features/reports/shared/wire/dates";
import { formatAmount, formatBal, formatCell, isZeroAmount } from "@/features/reports/shared/wire/money";
import { checkSentence } from "../wire/checks";
import type {
  Bal,
  BusinessDayStatus,
  DailyRow,
  DailyTotals,
  GroupLedgerRow,
  GroupRow,
  GroupTotals,
  MoneyKind,
  MoneyRow,
  MoneyTotal,
  Side,
  SummaryPayload,
  TypeRow,
  TypeTotals,
  VoucherRow,
} from "../wire/types";

export type Tone = "sales" | "receipt" | "payment" | "contra" | "journal" | "note" | "purchase" | "stock" | "neutral";

/** Presentation only: nothing in this feature BEHAVES differently by nature. Unknown → neutral. */
const NATURE_TONE: Record<string, Tone> = {
  SALES: "sales",
  RECEIPT: "receipt",
  PAYMENT: "payment",
  CONTRA: "contra",
  JOURNAL: "journal",
  CREDIT_NOTE: "note",
  DEBIT_NOTE: "note",
  PURCHASE: "purchase",
  STOCK_JOURNAL: "stock",
};

export function natureTone(nature: string | null): Tone {
  return (nature && NATURE_TONE[nature]) || "neutral";
}

/** A count for a cell or a sentence. Grouped Indian-style; a count is not money. */
export function countText(n: number): string {
  return n.toLocaleString("en-IN");
}

function countCell(n: number): string {
  return n === 0 ? "" : countText(n);
}

export function plural(n: number, one: string, many: string): string {
  return `${countText(n)} ${n === 1 ? one : many}`;
}

/**
 * A balance on its NATURAL side shows bare; the other side says so. Cash and
 * bank sit on Dr, so `48,250.00` is Dr and `1,200.00 Cr` is an overdraft.
 * The side is the server's, never a sign.
 */
export function formatNatural(bal: Bal, natural: Side = "DR"): string {
  if (isZeroAmount(bal.amount) || bal.side === null || bal.side === natural) return formatAmount(bal.amount);
  return formatBal(bal);
}

/** Under a voucher-type filter the server sends no balances: "a balance has no voucher type". */
export const NO_BALANCE = "—";
export const NO_BALANCE_TIP = "No balance under a voucher-type filter: a balance has no voucher type. Pick All voucher types.";

/** A money balance, or the dash when the server sent none. */
export function balanceText(bal: Bal | null): string {
  return bal ? formatNatural(bal) : NO_BALANCE;
}

/** `+21,600.00` / `−2,400.00` from a net's side (Dr = +, Cr = −), the one place a sign appears (§7.1). */
export function signedNet(net: Bal): string {
  if (isZeroAmount(net.amount) || net.side === null) return formatAmount(net.amount);
  return `${net.side === "DR" ? "+" : "−"}${formatAmount(net.amount)}`;
}

/* ------------------------------------------------------------- type grid */

export type Chip = { text: string; title: string; tone: Tone };

export function typeChip(row: Pick<TypeRow, "name" | "short" | "nature">): Chip {
  return { text: row.name.toUpperCase(), title: `${row.short} · ${row.nature}`, tone: natureTone(row.nature) };
}

export const LONE_HALF_TIP = "a cancel whose other half is outside this range";

function cancelledText(pairs: number, lone: number | null): { text: string; title: string | null } {
  const parts = [pairs ? plural(pairs, "pair", "pairs") : "", lone ? `+${plural(lone, "half", "halves")}` : ""];
  return { text: parts.filter(Boolean).join(" "), title: lone ? LONE_HALF_TIP : null };
}

export type TypeCells = {
  chip: Chip;
  vouchers: string;
  drafts: string;
  cancelled: { text: string; title: string | null };
  amount: string;
  cashIn: string;
  cashOut: string;
  bankIn: string;
  bankOut: string;
};

/** A type row: blank for zero (the mockup). */
export function typeCells(row: TypeRow): TypeCells {
  return {
    chip: typeChip(row),
    vouchers: countCell(row.vouchers),
    drafts: countCell(row.drafts),
    cancelled: cancelledText(row.cancelledPairs, row.loneHalves),
    amount: formatCell(row.amount),
    cashIn: formatCell(row.cashIn),
    cashOut: formatCell(row.cashOut),
    bankIn: formatCell(row.bankIn),
    bankOut: formatCell(row.bankOut),
  };
}

/** The Total row: `typeTotals`, never a sum of the rows. Amounts always printed. */
export function typeTotalCells(t: TypeTotals): Omit<TypeCells, "chip"> {
  return {
    vouchers: countText(t.vouchers),
    drafts: countCell(t.drafts),
    cancelled: cancelledText(t.cancelledPairs, t.loneHalves),
    amount: formatAmount(t.amount),
    cashIn: formatAmount(t.cashIn),
    cashOut: formatAmount(t.cashOut),
    bankIn: formatAmount(t.bankIn),
    bankOut: formatAmount(t.bankOut),
  };
}

export function bankHeadings(clearingAsBank: boolean): { in: string; out: string } {
  return clearingAsBank ? { in: "Bank + clearing in", out: "Bank + clearing out" } : { in: "Bank in", out: "Bank out" };
}

/* ------------------------------------------------------------ money grid */

const KIND_ORDER: Record<MoneyKind, number> = { CASH: 0, BANK: 1, CLEARING: 2 };

/** Grouped CASH → BANK → CLEARING, the server's order within a kind (§7.3). A sort, not a sum. */
export function groupMoneyRows(rows: readonly MoneyRow[]): MoneyRow[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => KIND_ORDER[a.row.kind] - KIND_ORDER[b.row.kind] || a.index - b.index)
    .map(({ row }) => row);
}

export const OPENING_NOTE_TIP: Record<string, string> = {
  COMPANY_LEVEL_ONLY: "this ledger's opening is held at company level; pick All branches to include it",
};

export type MoneyCells = {
  ledger: string;
  kind: string | null;
  opening: string;
  openingNote: string | null;
  in: string;
  out: string;
  closing: string;
};

export function moneyCells(row: MoneyRow): MoneyCells {
  return {
    ledger: row.ledgerName,
    kind: row.kind === "CASH" ? null : row.kind.toLowerCase(),
    opening: balanceText(row.opening),
    // An unknown note still gets its ⓘ, with its code as the text.
    openingNote: row.openingNote ? (OPENING_NOTE_TIP[row.openingNote] ?? row.openingNote) : null,
    in: formatAmount(row.in),
    out: formatAmount(row.out),
    closing: balanceText(row.closing),
  };
}

export function moneyTotalCells(total: MoneyTotal): Omit<MoneyCells, "ledger" | "kind" | "openingNote"> {
  return {
    opening: balanceText(total.opening),
    in: formatAmount(total.in),
    out: formatAmount(total.out),
    closing: balanceText(total.closing),
  };
}

/**
 * The tie-out note under the money grid (§7.3). Its lines quote
 * `moneyTotals`; its colour and verdict are the AMOUNT_TIES check's. The
 * client does not compare the two grids: with Clearing-as-bank on, the bank
 * and clearing lines are printed one under the other, never added.
 */
export function tieOut(
  summary: Pick<SummaryPayload, "moneyTotals" | "checks">,
  clearingAsBank: boolean,
): { tone: "ok" | "bad" | "unknown"; heading: string; lines: string[] } {
  const { CASH, BANK, CLEARING } = summary.moneyTotals;
  const line = (label: string, t: MoneyTotal | undefined) =>
    t ? `${label}  in ${formatAmount(t.in)} · out ${formatAmount(t.out)}` : null;
  const lines = [
    line("Cash", CASH),
    line("Bank", BANK),
    clearingAsBank ? line("+ clearing", CLEARING) : null,
  ].filter((l): l is string => l !== null);
  const ties = summary.checks.find((c) => c.code === "AMOUNT_TIES");
  if (!ties) return { tone: "unknown", heading: "tie-out not checked by the server", lines };
  if (ties.level === "OK" && ties.facts.moneyChecked === false) {
    return { tone: "unknown", heading: "money ledgers not cross-checked under a voucher-type filter", lines };
  }
  if (ties.level === "OK") return { tone: "ok", heading: "✓  ties to the type grid", lines };
  return { tone: "bad", heading: `✕  ${checkSentence(ties)}`, lines };
}

/* ------------------------------------------------------------ group grid */

export type NetCell = { text: string; side: Side | null };

export function netCell(net: Bal): NetCell {
  return { text: formatBal(net), side: isZeroAmount(net.amount) ? null : net.side };
}

export type GroupCells = { name: string; nature: string; debit: string; credit: string; net: NetCell };

export function groupCells(row: GroupRow): GroupCells {
  return {
    name: row.groupName,
    nature: row.nature ?? "—",
    debit: formatCell(row.debit),
    credit: formatCell(row.credit),
    net: netCell(row.net),
  };
}

/**
 * `groupTotals`. The server sends no net in the backend example, so the Net
 * total is its own when sent, else "0.00" exactly when the BALANCED check is
 * OK (§7.4), else blank: the client never subtracts Cr from Dr.
 */
export function groupTotalCells(totals: GroupTotals, balancedOk: boolean): Omit<GroupCells, "name" | "nature"> {
  return {
    debit: formatAmount(totals.debit),
    credit: formatAmount(totals.credit),
    net: totals.net ? netCell(totals.net) : { text: balancedOk ? "0.00" : "", side: null },
  };
}

export function groupLedgerCells(row: GroupLedgerRow): GroupCells {
  return {
    name: row.ledgerName,
    nature: row.groupName ?? "—",
    debit: formatCell(row.debit),
    credit: formatCell(row.credit),
    net: netCell(row.net),
  };
}

/* ------------------------------------------------------------- day-wise */

export const DAY_STATUS_TEXT: Record<BusinessDayStatus, string> = {
  OPEN: "Open",
  CLOSING: "Closing",
  CLOSED: "Closed",
  NONE: "No till day",
  MIXED: "Mixed",
};

export type DailyCells = {
  date: string;
  vouchers: string;
  drafts: string;
  cancelled: string;
  amount: string;
  cashIn: string;
  cashOut: string;
  cashClosing: string;
  bankIn: string;
  bankOut: string;
  bankClosing: string;
  day: { text: string; status: BusinessDayStatus } | null;
};

export function dailyCells(row: DailyRow): DailyCells {
  return {
    date: displayDate(row.date),
    vouchers: countCell(row.vouchers),
    drafts: countCell(row.drafts),
    cancelled: row.cancelledPairs ? plural(row.cancelledPairs, "pair", "pairs") : "",
    amount: formatCell(row.amount),
    cashIn: formatCell(row.cashIn),
    cashOut: formatCell(row.cashOut),
    cashClosing: balanceText(row.cashClosing),
    bankIn: formatCell(row.bankIn),
    bankOut: formatCell(row.bankOut),
    bankClosing: balanceText(row.bankClosing),
    day: row.businessDay ? { text: DAY_STATUS_TEXT[row.businessDay], status: row.businessDay } : null,
  };
}

export function dailyTotalCells(t: DailyTotals): Omit<DailyCells, "date" | "cashClosing" | "bankClosing" | "day"> {
  return {
    vouchers: countText(t.vouchers),
    drafts: countCell(t.drafts),
    cancelled: t.cancelledPairs ? plural(t.cancelledPairs, "pair", "pairs") : "",
    amount: formatAmount(t.amount),
    cashIn: formatAmount(t.cashIn),
    cashOut: formatAmount(t.cashOut),
    bankIn: formatAmount(t.bankIn),
    bankOut: formatAmount(t.bankOut),
  };
}

/* -------------------------------------------------------------- vouchers */

export type VoucherCells = {
  date: string;
  chip: Chip & { variant: "normal" | "cancelled" | "reversal" };
  voucherNo: string;
  party: { text: string; muted: boolean };
  narration: string;
  amount: string;
  branch: string;
  by: string;
};

export function voucherChip(row: Pick<VoucherRow, "short" | "name" | "nature" | "rowKind">): VoucherCells["chip"] {
  const type = (row.short ?? row.name ?? "?").toUpperCase();
  const title = row.name ?? row.short ?? "";
  if (row.rowKind === "CANCELLED") {
    return { text: `${type} · CANCELLED`, title: `${title} · cancelled`, tone: "neutral", variant: "cancelled" };
  }
  if (row.rowKind === "REVERSAL") {
    return { text: type, title: `${title} · reversal (the mirror of a cancel)`, tone: "payment", variant: "reversal" };
  }
  return { text: type, title, tone: natureTone(row.nature), variant: "normal" };
}

export function voucherCells(row: VoucherRow): VoucherCells {
  const party = row.party ?? (row.asPerDetails ? null : row.particulars);
  return {
    date: displayDate(row.date),
    chip: voucherChip(row),
    voucherNo: row.voucherNo ?? "—",
    party: party ? { text: party, muted: false } : { text: row.asPerDetails ? "(as per details)" : "—", muted: true },
    narration: row.narration ?? "",
    amount: formatAmount(row.amount),
    branch: row.branchName ?? "—",
    by: row.createdBy ?? "",
  };
}

/** "65 vouchers · 1 cancelled pair" under the list; the pairs only when the server counts them. */
export function voucherFootText(totalRows: number, cancelledPairs: number | null, draftsOnly: boolean): string {
  if (draftsOnly) return plural(totalRows, "draft", "drafts");
  const parts = [plural(totalRows, "voucher", "vouchers")];
  if (cancelledPairs) parts.push(plural(cancelledPairs, "cancelled pair", "cancelled pairs"));
  return parts.join(" · ");
}
