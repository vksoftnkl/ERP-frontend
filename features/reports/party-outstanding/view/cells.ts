/**
 * Server rows → what each cell prints, and in which tone. Pure, and the only
 * place a cell's text is decided, so the mockup can be asserted to the
 * character without rendering React (`cells.test.ts`).
 *
 * NO ARITHMETIC. Every figure is a string the server sent, formatted; every
 * age and overdue count is an integer the server sent. Colour is presentation
 * of a server fact (a bucket's POSITION, an age against the user's own bucket
 * edges, a row's side). Nothing here reads the clock: `cells.test.ts` freezes
 * it far from As on and expects the same cells.
 */
import { displayDate } from "@/features/reports/shared/wire/dates";
import { formatAmount, formatBal, formatCell, isZeroAmount, sameBal } from "@/features/reports/shared/wire/money";
import type { Bal, BillRow, OutstandingSide, PartyFlag, PartyRow, PartyTotals, Side } from "../wire/types";

export type Tone = "accent" | "credit" | "danger" | "amber" | "orange" | "info" | "muted" | "sales" | "purchase" | null;

export type Cell = { text: string; tone: Tone; title?: string; italic?: boolean };

const plain = (text: string, tone: Tone = null): Cell => ({ text, tone });

/** Receivable: what is owed is Dr. Payable: Cr. */
export function owedSideOf(side: OutstandingSide): Side {
  return side === "PAYABLE" ? "CR" : "DR";
}

export function onAccountSideOf(side: OutstandingSide): Side {
  return side === "PAYABLE" ? "DR" : "CR";
}

const sideWord = (side: Side) => (side === "DR" ? "Dr" : "Cr");

/** A Net figure: accent on the owed side, green on the on-account side. */
export function netCell(net: Bal, side: OutstandingSide): Cell {
  if (isZeroAmount(net.amount)) return plain(formatBal(net));
  return plain(formatBal(net), net.side === onAccountSideOf(side) ? "credit" : "accent");
}

/** Bucket columns are coloured by POSITION: the 3rd amber, 4th orange, then red. */
export function bucketTone(index: number): Tone {
  if (index < 2) return null;
  if (index === 2) return "amber";
  if (index === 3) return "orange";
  return "danger";
}

/**
 * Days against the user's own edges: red above the last-but-one, amber above
 * the middle one. With 30·60·90·180 that is red > 90, amber > 60.
 */
export function ageTone(days: number | null, edges: readonly number[]): Tone {
  if (days === null || edges.length === 0) return null;
  const red = edges.length >= 2 ? edges[edges.length - 2] : null;
  const amber = edges[Math.floor((edges.length - 1) / 2)];
  if (red !== null && days > red) return "danger";
  if (edges.length >= 2 && days > amber) return "amber";
  return null;
}

/* ------------------------------------------------------------ flags */

export type Chip = { label: string; tone: Tone; title?: string };

export function flagChip(flag: PartyFlag | string, edges: readonly number[]): Chip {
  switch (flag) {
    case "CHQ_BOUNCED":
      return { label: "CHQ BOUNCED", tone: "danger", title: "A cheque from this party bounced on or before As on." };
    case "OVER_180": {
      const last = edges[edges.length - 1];
      return {
        label: last === undefined ? "OLDEST BUCKET" : `> ${last} DAYS`,
        tone: "danger",
        title: "The oldest pending bill is past the last bucket.",
      };
    }
    case "ADVANCE":
      return { label: "ADVANCE", tone: "credit", title: "Net is on the on-account side: the party has paid ahead." };
    case "OVER_LIMIT":
      return { label: "OVER LIMIT", tone: "amber", title: "Net outstanding is above the credit limit." };
    default:
      return { label: String(flag).replace(/_/g, " "), tone: "muted" };
  }
}

/* -------------------------------------------------------- party row */

export type PartyCells = {
  name: string;
  flags: Chip[];
  area: string;
  crDays: string;
  bills: string;
  owed: Cell;
  onAccount: Cell;
  net: Cell;
  buckets: Cell[];
  overdue: Cell;
  oldest: Cell;
  pdc: Cell;
};

export type GridContext = { side: OutstandingSide; edges: readonly number[] };

export function partyCells(row: PartyRow, ctx: GridContext): PartyCells {
  return {
    name: row.name,
    flags: row.flags.map((flag) => flagChip(flag, ctx.edges)),
    area: row.area ?? "",
    crDays: row.creditDays === null ? "" : String(row.creditDays),
    bills: row.bills === 0 ? "" : String(row.bills),
    owed: plain(formatCell(row.owed)),
    onAccount: plain(formatCell(row.onAccount), "credit"),
    net: netCell(row.net, ctx.side),
    buckets: row.buckets.map((amount, i) => plain(formatCell(amount), bucketTone(i))),
    overdue: plain(formatCell(row.overdue), "danger"),
    oldest: plain(row.oldestDays === null ? "" : `${row.oldestDays} d`, ageTone(row.oldestDays, ctx.edges)),
    pdc: plain(formatCell(row.pdcInHand), "info"),
  };
}

/** The pinned totals row: `/parties.totals`, ALWAYS, never a sum of loaded pages. */
export function totalCells(totals: PartyTotals, parties: number, ctx: GridContext): PartyCells {
  return {
    name: `Total · ${parties} ${parties === 1 ? "party" : "parties"}`,
    flags: [],
    area: "",
    crDays: "",
    bills: String(totals.bills),
    owed: plain(formatAmount(totals.owed)),
    onAccount: plain(formatCell(totals.onAccount), "credit"),
    net: netCell(totals.net, ctx.side),
    buckets: totals.buckets.map((amount, i) => plain(formatCell(amount), bucketTone(i))),
    overdue: plain(formatCell(totals.overdue), "danger"),
    oldest: plain(""),
    pdc: plain(formatCell(totals.pdcInHand), "info"),
  };
}

/* --------------------------------------------------------- bill row */

/** billType + srcDocType → the Type chip. Presentation only. */
export function billChip(row: Pick<BillRow, "billType" | "srcDocType" | "voucherTypeId">): Chip {
  if ((row.srcDocType ?? "").toUpperCase() === "CHEQUE_BOUNCE_CHARGE") return { label: "BNC CHARGE", tone: "danger" };
  switch (row.billType.toUpperCase()) {
    case "OPENING":
      return { label: "OPENING", tone: "amber" };
    case "SALES":
      return { label: "SALES", tone: "sales" };
    case "SALES_RETURN":
      return { label: "CR NOTE", tone: "credit", title: "Sales return" };
    case "ADVANCE":
      return { label: "ADVANCE", tone: "credit" };
    case "PURCHASE":
      return { label: "PURCHASE", tone: "purchase" };
    case "PURCHASE_RETURN":
      return { label: "DR NOTE", tone: "amber", title: "Purchase return" };
    case "JOURNAL":
      if (row.voucherTypeId === 27) return { label: "CR NOTE", tone: "credit" };
      if (row.voucherTypeId === 26) return { label: "DR NOTE", tone: "amber" };
      return { label: "JOURNAL", tone: "muted" };
    default:
      return { label: row.billType.replace(/_/g, " "), tone: "muted" };
  }
}

export const NO_DUE_DATE_TIP = "No due date on the bill. Due = bill date + credit days.";
export const COUNTER_HINT = "paid at counter";

export type BillCells = {
  date: string;
  chip: Chip;
  refno: string;
  branch: string;
  due: Cell;
  billAmount: string;
  adjusted: string;
  pending: Cell;
  age: Cell;
  overdue: Cell;
  remarks: string;
  /** A data fault the server flagged: shown, never hidden. */
  warning: string | null;
};

export function billCells(row: BillRow, ctx: GridContext): BillCells {
  const onAccount = row.side === "ON_ACCOUNT";
  const overdue = row.overdueDays !== null && row.overdueDays > 0;
  let due: Cell;
  if (onAccount) {
    // On-account items are never aged and never due (backend §4.4).
    due = plain("—", "muted");
  } else if (row.dueDate) {
    due = plain(displayDate(row.dueDate), overdue ? "danger" : null);
  } else {
    due = { text: displayDate(row.dueEff), tone: overdue ? "danger" : "muted", italic: true, title: NO_DUE_DATE_TIP };
  }
  const pendingSide = onAccount ? onAccountSideOf(ctx.side) : owedSideOf(ctx.side);
  const remarks = [row.remarks ?? "", row.tenderDerived ? COUNTER_HINT : ""].filter(Boolean).join(" · ");
  return {
    date: displayDate(row.docDate),
    chip: billChip(row),
    refno: row.docRefno ?? "—",
    branch: row.branchName ?? "—",
    due,
    billAmount: formatAmount(row.billAmount),
    adjusted: formatCell(row.adjusted),
    pending: plain(`${formatAmount(row.pending)} ${sideWord(pendingSide)}`, onAccount ? "credit" : null),
    age: plain(String(row.ageDays), onAccount ? null : ageTone(row.ageDays, ctx.edges) === "danger" ? "danger" : null),
    overdue: plain(overdue ? `${row.overdueDays} d` : "", "danger"),
    remarks,
    warning: row.dataWarning,
  };
}

/* ------------------------------------------------------ ledger check */

export type LedgerCheck = { ok: boolean; text: string; title?: string };

export const LEDGER_MISMATCH_TIP = "The ledger and the bills disagree. A posting moved one without the other.";

/**
 * The bills' net against the party ledger's closing on As on (plan §9.2).
 * Compared as STRINGS: both come from the server formatted the same way, so
 * no parse is needed, and a mismatch is a real finding that is never hidden.
 */
export function ledgerCheck(net: Bal, ledgerClosing: Bal): LedgerCheck {
  if (sameBal(net, ledgerClosing)) return { ok: true, text: "= ledger closing ✓" };
  return { ok: false, text: `≠ ledger ${formatBal(ledgerClosing)}`, title: LEDGER_MISMATCH_TIP };
}
