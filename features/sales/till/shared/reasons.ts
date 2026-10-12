/**
 * Till reasons — grid 134 "MAIN LIST - TILL REASONS", the same registered grid
 * Till Masters lists them from.
 *
 * The grid binds every token QUOTED (`'icompany_id'`, `'icategory'`,
 * `'iinactive'`), and an unsent quoted token stays a literal word: the filter
 * then matches nothing and the list is silently EMPTY. So all three are always
 * sent — `icategory: ""` for every category, `iinactive` "false" for the active
 * rows only (a shipped row this company has its own copy of left out) or
 * "true" for every reason a past event may name.
 */
import { flagOf, textOf } from "./format";
import { toPaise } from "./money";
import type { GridRow } from "./wire/types";

export type TillReason = {
  id: string;
  category: string;
  code: string;
  name: string;
  ledgerId: string;
  ledgerName: string;
  needsNote: boolean;
  needsRef: boolean;
  /** 0 = no cap. */
  maxAmountPaise: number;
  active: boolean;
  /** A shipped row this company has replaced with its own. */
  overridden: boolean;
};

export function reasonGridParams(companyId: string, includeInactive: boolean): Record<string, string> {
  return { icompany_id: companyId, icategory: "", iinactive: includeInactive ? "true" : "false" };
}

export function toReasons(rows: readonly GridRow[]): TillReason[] {
  return rows
    .map((row) => ({
      id: textOf(row, "trs_id"),
      category: textOf(row, "trs_category").toUpperCase(),
      code: textOf(row, "trs_code"),
      name: textOf(row, "trs_name"),
      ledgerId: textOf(row, "trs_ledger_id"),
      ledgerName: textOf(row, "ledger_name"),
      needsNote: flagOf(row, "trs_needs_note"),
      needsRef: flagOf(row, "trs_needs_ref"),
      maxAmountPaise: Math.max(0, toPaise(row.trs_max_amount) ?? 0),
      active: flagOf(row, "trs_is_active"),
      overridden: flagOf(row, "overridden"),
    }))
    .filter((reason) => reason.id);
}

/** The usable reasons of one category: active, and not replaced by the company's own. */
export function reasonsOf(reasons: readonly TillReason[], category: string): TillReason[] {
  return reasons.filter((reason) => reason.category === category && reason.active && !reason.overridden);
}

export function reasonById(reasons: readonly TillReason[], id: string): TillReason | null {
  if (!id) return null;
  return reasons.find((reason) => reason.id === id) ?? null;
}
