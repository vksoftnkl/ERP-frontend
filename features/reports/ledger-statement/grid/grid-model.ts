/**
 * The rows the voucher grid draws, in order (plan §8.2 – §8.5).
 *
 * Three kinds are the report's own: voucher rows (loaded) and placeholders
 * (a page not loaded yet), one per `totalRows`. Around them the grid draws
 * synthetic rows that are NOT in `rows[]`:
 *
 * - Opening balance b/f  ← `header.period.opening`
 * - Total for the period ← `header.period.debit/credit`, NEVER Σ of the rows
 * - Closing balance c/f  ← `header.period.closing`
 *
 * Total and Closing only appear once the last page is loaded, so a total can
 * never be misread as a partial one. Leg sub-rows under an expanded "as per
 * details" row are client-side children, and they carry no report index, so
 * they never enter the paging maths.
 */
import { previousDay } from "../wire/dates";
import type { Bal, PeriodSummary, VoucherLeg, VoucherRow } from "../wire/types";
import { isLastPageLoaded, loadedRowCount, rowAt, type PagesState } from "../query/pages";

export type LegsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; legs: VoucherLeg[] };

export type GridRow =
  | { kind: "opening"; key: string; bal: Bal; asOf: string }
  | { kind: "voucher"; key: string; index: number; row: VoucherRow }
  | { kind: "placeholder"; key: string; index: number }
  | { kind: "leg"; key: string; parentId: string; leg: VoucherLeg }
  | { kind: "legs-status"; key: string; parentId: string; status: "loading" | "error"; message?: string }
  | { kind: "empty"; key: string }
  | { kind: "total"; key: string; debit: string; credit: string }
  | { kind: "closing"; key: string; bal: Bal; asOf: string };

export type GridModel = {
  rows: GridRow[];
  /** Report rows not loaded yet; the foot says so while > 0. */
  pendingRows: number;
};

/** The legs to show under an expanded row: the contra side, not this ledger's own. */
export function contraLegs(legs: VoucherLeg[]): VoucherLeg[] {
  return legs.filter((leg) => !leg.isThisLedger);
}

export function buildGridModel(args: {
  period: PeriodSummary | null;
  pages: PagesState | null;
  expanded: ReadonlySet<string>;
  legsOf: (row: VoucherRow) => LegsState | undefined;
}): GridModel {
  const { period, pages, expanded, legsOf } = args;
  const rows: GridRow[] = [];
  if (period) {
    rows.push({ kind: "opening", key: "opening", bal: period.opening, asOf: previousDay(period.fromDate) });
  }
  if (!pages) return { rows, pendingRows: 0 };

  for (let index = 0; index < pages.totalRows; index += 1) {
    const row = rowAt(pages, index);
    if (!row) {
      // Same key as the voucher that will replace it, so focus survives the page arriving.
      rows.push({ kind: "placeholder", key: `r${index}`, index });
      continue;
    }
    rows.push({ kind: "voucher", key: `r${index}`, index, row });
    if (!row.asPerDetails || !expanded.has(row.voucherId)) continue;
    const legs = legsOf(row);
    if (!legs || legs.status === "loading") {
      rows.push({ kind: "legs-status", key: `ls${index}`, parentId: row.voucherId, status: "loading" });
    } else if (legs.status === "error") {
      rows.push({
        kind: "legs-status",
        key: `ls${index}`,
        parentId: row.voucherId,
        status: "error",
        message: legs.message,
      });
    } else {
      contraLegs(legs.legs).forEach((leg) => {
        rows.push({ kind: "leg", key: `l${index}:${leg.rowNo}`, parentId: row.voucherId, leg });
      });
    }
  }

  if (pages.totalRows === 0) rows.push({ kind: "empty", key: "empty" });

  const complete = isLastPageLoaded(pages);
  if (complete && period) {
    rows.push({ kind: "total", key: "total", debit: period.debit.amount, credit: period.credit.amount });
    rows.push({ kind: "closing", key: "closing", bal: period.closing, asOf: period.toDate });
  }
  return { rows, pendingRows: complete ? 0 : pages.totalRows - loadedRowCount(pages) };
}

/** The report indices a range of grid rows covers, for loading the pages under the viewport. */
export function indexSpan(rows: readonly GridRow[], first: number, last: number): [number, number] | null {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (let i = Math.max(0, first); i <= Math.min(rows.length - 1, last); i += 1) {
    const row = rows[i];
    if (row.kind === "voucher" || row.kind === "placeholder") {
      lo = Math.min(lo, row.index);
      hi = Math.max(hi, row.index);
    }
  }
  return Number.isFinite(lo) ? [lo, hi] : null;
}

/**
 * Pair lookup for hover highlighting (§8.4). The server sends no pair id yet
 * (§13.5), so a CANCELLED row and its REVERSAL are matched by one naming the
 * other's voucher number in its narration. Loaded rows only.
 */
export function pairOf(row: VoucherRow, loaded: readonly VoucherRow[]): VoucherRow | undefined {
  if (row.rowKind === "NORMAL") return undefined;
  const wanted = row.rowKind === "CANCELLED" ? "REVERSAL" : "CANCELLED";
  const mentions = (a: VoucherRow, b: VoucherRow) =>
    Boolean(b.voucherNo && a.narration && a.narration.toLowerCase().includes(b.voucherNo.toLowerCase()));
  return loaded.find(
    (other) =>
      other.voucherId !== row.voucherId &&
      other.rowKind === wanted &&
      (mentions(other, row) || mentions(row, other)),
  );
}
