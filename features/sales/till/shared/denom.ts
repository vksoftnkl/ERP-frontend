/**
 * The cash count by denomination — Qt `TillDenomCount`, minus the widgets.
 *
 * S1 (the opening float), S3 (a pickup / top-up / paid-in) and S4 (End Shift)
 * all count the drawer the same way: two grids side by side, the notes on the
 * left and the coins on the right (half and half when the list names no
 * kinds), a Qty per denomination with its amount beside it, and a last
 * "Loose / other" line on the right for coin in a bag or a torn note, typed as
 * one figure.
 *
 * The denominations are the server's own list (`/till/denominations/list`:
 * active, valid today, in sort order). The count is posted as lines
 * `{ tenderTypeId 1, denominationId, qty }` — the server prices them (face
 * value × qty) — plus `{ tenderTypeId 1, enteredAmount }` for the loose line.
 * The total shown here is the same sum in paise.
 */
import { amountInputPaise, paiseToNumber, toPaise } from "./money";
import type { TillCountLine, TillDenominationRow } from "./wire/types";

/** CASH_TENDER_TYPE_ID on the server — pinned by Acc_Tender_Types.sql. */
export const CASH_TENDER_TYPE_ID = 1;

/** The Qty box's ceiling, as the Qt spin box. */
export const MAX_DENOM_QTY = 99999;

export type Denomination = {
  id: string;
  label: string;
  /** NOTE / COIN (anything else counts as neither). */
  kind: string;
  valuePaise: number;
};

/** The counted figures: qty per denomination id, and the loose line as typed. */
export type DenomCountValue = {
  qty: Readonly<Record<string, number>>;
  loose: string;
};

export const EMPTY_COUNT: DenomCountValue = Object.freeze({ qty: Object.freeze({}), loose: "" });

/** The server's rows, as the count needs them; a row with no id or value is skipped. */
export function toDenominations(rows: readonly TillDenominationRow[]): Denomination[] {
  const out: Denomination[] = [];
  for (const row of rows) {
    const valuePaise = toPaise(row?.tdnValue);
    const id = typeof row?.tdnId === "string" ? row.tdnId : "";
    if (!id || valuePaise === null || valuePaise <= 0) continue;
    out.push({
      id,
      label: typeof row.tdnLabel === "string" && row.tdnLabel.trim() ? row.tdnLabel : String(row.tdnValue),
      kind: typeof row.tdnKind === "string" ? row.tdnKind.toUpperCase() : "",
      valuePaise,
    });
  }
  return out;
}

export type DenomLayout = {
  /** Enter order: down the left grid, then down the right. */
  ordered: Denomination[];
  left: Denomination[];
  right: Denomination[];
};

/**
 * Notes on the left, coins on the right — keeping the server's order inside
 * each kind. With no kinds (or only one) it is half and half, the extra row on
 * the left.
 */
export function layoutDenominations(list: readonly Denomination[]): DenomLayout {
  const notes = list.filter((d) => d.kind === "NOTE").length;
  const byKind = notes > 0 && notes < list.length;
  const ordered = byKind
    ? [...list.filter((d) => d.kind === "NOTE"), ...list.filter((d) => d.kind !== "NOTE")]
    : [...list];
  const half = byKind ? notes : Math.ceil(list.length / 2);
  return { ordered, left: ordered.slice(0, half), right: ordered.slice(half) };
}

/** A typed Qty as a whole number of pieces: digits only, capped, blank = 0. */
export function parseQty(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  if (!/^\d+$/.test(trimmed)) return null;
  const qty = Number.parseInt(trimmed, 10);
  return Math.min(qty, MAX_DENOM_QTY);
}

export function qtyOf(value: DenomCountValue, id: string): number {
  const qty = value.qty[id];
  return typeof qty === "number" && Number.isFinite(qty) && qty > 0 ? Math.trunc(qty) : 0;
}

/** One line's amount in paise. */
export function lineAmountPaise(denom: Denomination, value: DenomCountValue): number {
  return qtyOf(value, denom.id) * denom.valuePaise;
}

export function loosePaise(value: DenomCountValue): number {
  return amountInputPaise(value.loose);
}

/** Every note and coin plus the loose line, in paise. */
export function countedPaise(list: readonly Denomination[], value: DenomCountValue): number {
  let sum = 0;
  for (const denom of list) sum += lineAmountPaise(denom, value);
  return sum + loosePaise(value);
}

/** The lines a count posts: qty > 0 only, in screen order, then the loose figure. */
export function countLines(list: readonly Denomination[], value: DenomCountValue): TillCountLine[] {
  const lines: TillCountLine[] = [];
  for (const denom of layoutDenominations(list).ordered) {
    const qty = qtyOf(value, denom.id);
    if (qty > 0) lines.push({ tenderTypeId: CASH_TENDER_TYPE_ID, denominationId: denom.id, qty });
  }
  const loose = loosePaise(value);
  if (loose > 0) lines.push({ tenderTypeId: CASH_TENDER_TYPE_ID, enteredAmount: paiseToNumber(loose) });
  return lines;
}

/** A new value with one denomination's qty set (0 removes it). */
export function withQty(value: DenomCountValue, id: string, qty: number): DenomCountValue {
  const next: Record<string, number> = { ...value.qty };
  if (qty > 0) next[id] = Math.min(Math.trunc(qty), MAX_DENOM_QTY);
  else delete next[id];
  return { qty: next, loose: value.loose };
}
