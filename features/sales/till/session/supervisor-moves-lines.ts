/**
 * The lines of the cashier's "Supervisor movements" panel — Qt
 * `TillSupervisorMoves::load` without the widget: every Pickup and Top-up on
 * the session, read from grid 147 (the cockpit's money documents), one line
 * each, oldest first.
 *
 *   10:42   Pickup (taken out)   ₹ 5,000.00   by RAVI   TDrp/26/0012
 *
 * A voided one keeps its line and says so (the cashier still saw the cash
 * move). Everything else on the grid (drops, paid-ins, exchanges, the float)
 * is the cashier's own doing and is left out.
 */
import { sortRowsBy, textOf } from "../shared/format";
import { formatMoney, paiseOf } from "../shared/money";
import type { GridRow } from "../shared/wire/types";

/** Qt separates the parts with three spaces; the panel keeps them (`white-space: pre-wrap`). */
const GAP = "   ";

export function supervisorMoveLines(rows: readonly GridRow[]): string[] {
  const lines: string[] = [];
  for (const row of sortRowsBy(rows, "md_time")) {
    const kind = textOf(row, "md_kind");
    if (kind !== "PICKUP" && kind !== "TOP_UP") continue;
    // tcm_status is POSTED | VOIDED (ck_tcm_status); Qt compares "VOID" and never marks one.
    const status = textOf(row, "md_status").trim().toUpperCase();
    const voided = status === "VOIDED" || status === "VOID";
    const what = kind === "PICKUP" ? "Pickup (taken out)" : "Top-up (put in)";
    lines.push(
      [textOf(row, "md_clock"), what, `₹ ${formatMoney(paiseOf(row.md_amount))}`, `by ${textOf(row, "md_by")}`, textOf(row, "md_doc")].join(
        GAP,
      ) + (voided ? `${GAP}— VOID` : ""),
    );
  }
  return lines;
}
