/**
 * `abj_adj_type` → which column of the bills grid the figure belongs in.
 *
 * An UNKNOWN type is skipped, not folded into Receive. A figure in the wrong
 * column is worse than a missing one: it reads as money the customer handed
 * over, and the operator reconciles against it.
 */
import type { BillAdjType } from "../receipt.types";

export type BillColumnOfAdj = "receive" | "discount" | "writeOff" | "roundOff" | null;

export function billColumnOf(adjType: BillAdjType | string | null | undefined): BillColumnOfAdj {
  switch ((adjType ?? "").trim().toUpperCase()) {
    // Every way money (or a credit) can land on a bill ends in the same cell:
    // the grid has one Receive column and `creditsApplied[]` is what records
    // which of them was a credit.
    case "ALLOCATION":
    case "ADVANCE_ADJUST":
    case "NOTE_ADJUST":
    case "TRANSFER":
    case "":
      return "receive";
    case "DISCOUNT":
      return "discount";
    case "WRITEOFF":
      return "writeOff";
    case "ROUND_OFF":
      return "roundOff";
    default:
      return null;
  }
}
