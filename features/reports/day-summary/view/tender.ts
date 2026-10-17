/**
 * The By tender and No tender tabs' texts (server notes 126 §4; the Qt
 * screen `account_day_summary_entry.cpp`), decided here so they can be
 * asserted in node like `cells.ts`.
 *
 * Every row figure is a string the server sent. The ONE sum on this screen is
 * the By tender footer's debit / credit: the route sends no totals, and the Qt
 * footer adds the groups. `sumAmounts` does it exactly on the digits (bigint,
 * no float), and only for that line. A server `totals` block would retire it.
 */
import { displayDate } from "@/features/reports/shared/wire/dates";
import { formatAmount, formatBal, formatCell, isZeroAmount } from "@/features/reports/shared/wire/money";
import type { NoTenderPayload, TenderGroup, TenderLine } from "../wire/types";
import { countText, plural } from "./cells";

export const NO_TENDER_LABEL = "— no tender —";

/** The Qt hint over the By tender grid (its "From" is this screen's Date). */
export const TENDER_HINT =
  'Each cash / bank ledger split by how the money moved. A "no tender" row with movement in the range is ' +
  "money nobody said how it moved — see the No tender tab. Opening is the year's lines before the Date.";

export const GROUP_BY_LABEL = {
  TENDER: "Tender master (each machine / QR)",
  TYPE: "Tender type (all CARD together)",
} as const;

/** A group with neither a tender nor a tender type: the lines no tender row labels. */
export function isNoTender(group: Pick<TenderGroup, "tenderId" | "tenderTypeId">): boolean {
  return group.tenderId === null && group.tenderTypeId === null;
}

/**
 * Painted red: a no-tender group that MOVED in the range. One whose only
 * figure is an opening from before the Date is history, not today's gap.
 */
export function isUntendered(group: Pick<TenderGroup, "tenderId" | "tenderTypeId" | "debit" | "credit">): boolean {
  return isNoTender(group) && (!isZeroAmount(group.debit) || !isZeroAmount(group.credit));
}

export type TenderGroupCells = {
  ledger: string;
  type: string;
  tender: string;
  opening: string;
  debit: string;
  credit: string;
  closing: string;
  danger: boolean;
};

/** As the Qt grid: opening / closing as `1,234.00 Dr` / `Cr` (bare `0.00`), debit / credit always printed. */
export function tenderGroupCells(group: TenderGroup): TenderGroupCells {
  return {
    ledger: group.ledgerName,
    type: isNoTender(group) ? NO_TENDER_LABEL : (group.tenderTypeName ?? ""),
    tender: group.tenderName ?? "",
    opening: formatBal(group.opening),
    debit: formatAmount(group.debit),
    credit: formatAmount(group.credit),
    closing: formatBal(group.closing),
    danger: isUntendered(group),
  };
}

const AMOUNT = /^(-?)(\d+)(?:\.(\d+))?$/;

/**
 * Σ of amount strings, exact: each is read as a whole number of its smallest
 * decimal unit (a bigint), never as a float. Only strings the parser checked
 * reach it; anything else throws rather than being counted as zero.
 */
export function sumAmounts(amounts: readonly string[]): string {
  const parts = amounts.map((amount) => {
    const match = AMOUNT.exec(amount.trim());
    if (!match) throw new Error(`not an amount: ${JSON.stringify(amount)}`);
    return { negative: match[1] === "-", integer: match[2], decimals: match[3] ?? "" };
  });
  const scale = Math.max(2, ...parts.map((p) => p.decimals.length));
  let total = BigInt(0);
  for (const p of parts) {
    const units = BigInt(p.integer + p.decimals.padEnd(scale, "0"));
    total += p.negative ? -units : units;
  }
  const negative = total < BigInt(0);
  const digits = (negative ? -total : total).toString().padStart(scale + 1, "0");
  return `${negative ? "-" : ""}${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}

/** "7 groups · debit 3,40,320.00 · credit 2,47,100.00 · 1 with no tender in the range". */
export function tenderFootText(groups: readonly TenderGroup[]): string {
  const debit = sumAmounts(groups.map((g) => g.debit));
  const credit = sumAmounts(groups.map((g) => g.credit));
  const untendered = groups.filter(isUntendered).length;
  const parts = [plural(groups.length, "group", "groups"), `debit ${formatAmount(debit)}`, `credit ${formatAmount(credit)}`];
  if (untendered > 0) parts.push(`${countText(untendered)} with no tender in the range`);
  return parts.join(" · ");
}

/* ------------------------------------------------------------- No tender */

/** The tab's label: the count once the list is in and not empty. */
export function noTenderTabLabel(count: number | null): string {
  return count ? `No tender (${countText(count)})` : "No tender";
}

export const NO_TENDER_CLEAN = "No cash or bank line without a tender in this range. This is how it should be.";

/** The line over the list: green when empty, else red with the count, the amount and the count per type. */
export function noTenderHead(payload: Pick<NoTenderPayload, "count" | "amount" | "byVoucherType" | "rows">): {
  tone: "ok" | "bad";
  text: string;
} {
  if (payload.count === 0) return { tone: "ok", text: NO_TENDER_CLEAN };
  const lines = plural(payload.count, "cash / bank line", "cash / bank lines");
  const byType = payload.byVoucherType.map((t) => `${t.voucherTypeCode ?? "—"} ${countText(t.count)}`).join(", ");
  let text = `${lines} with no tender, ${formatAmount(payload.amount)} — each one is a transaction to look into.`;
  if (byType) text += ` · ${byType}`;
  if (payload.count > payload.rows.length) text += ` (first ${countText(payload.rows.length)} shown)`;
  return { tone: "bad", text };
}

export type NoTenderCells = {
  date: string;
  voucher: string;
  kind: string;
  party: string;
  ledger: string;
  debit: string;
  credit: string;
};

/** As the Qt list: a zero side is blank; a reversal mirror says so after its type. */
export function noTenderCells(line: TenderLine): NoTenderCells {
  return {
    date: displayDate(line.voucherDate),
    voucher: line.voucherNo ?? "—",
    kind: `${line.voucherTypeCode ?? ""}${line.isMirror ? " (reversal)" : ""}`,
    party: line.partyName ?? "",
    ledger: line.ledgerName,
    debit: formatCell(line.debit),
    credit: formatCell(line.credit),
  };
}
