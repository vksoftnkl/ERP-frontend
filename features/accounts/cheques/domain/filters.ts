/**
 * The filter bar, and the parameter contract of grid 109.
 *
 * ── Nine bare parameters, ALL sent, EVERY time ───────────────────────────
 * Grid 109's SQL names nine bare identifiers and PostgreSQL resolves every one
 * of them when the statement is prepared. Leave one out and the WHOLE call
 * fails — `column "isearch" does not exist` (verified 2026-09-24) — it is not
 * a filter quietly ignored. The SQL guards each with `NULLIF(…,'') IS NULL`,
 * so an empty string is how "no filter" is said.
 *
 * ── The search is `isearch`, inside `grid_param` ─────────────────────────
 * NEVER the generic `search` query key the shared table lifts out on its own.
 * `search=55492` with no `isearch` returned zero rows and no meta, which looks
 * exactly like an empty register.
 */
import type { ChequeScope, ChequeStatus } from "./types";

/** The ticks, in the order they are drawn. */
export const STATUS_TICKS = [
  { key: "HELD", label: "Held" },
  { key: "DEPOSITED", label: "Deposited" },
  { key: "BOUNCED", label: "Bounced" },
  { key: "CLEARED", label: "Cleared" },
  // "The paper left the register" — one idea to an operator, two statuses to
  // the table. Ticking it sends both.
  { key: "RETURNED", label: "Returned" },
  { key: "REPLACED", label: "Replaced" },
] as const;
export type StatusTick = (typeof STATUS_TICKS)[number]["key"];

/** What is still in play. */
export const DEFAULT_TICKS: readonly StatusTick[] = ["HELD", "DEPOSITED"];

export type ChequeFilters = {
  ticks: readonly StatusTick[];
  from: string;
  to: string;
  bankLedgerId: string;
  /** Shown in the field before the dropdown has loaded. */
  bankLedgerName: string;
  partyId: string;
  partyName: string;
  search: string;
};

export function defaultFilters(range: { from: string; to: string }): ChequeFilters {
  return {
    ticks: DEFAULT_TICKS,
    from: range.from,
    to: range.to,
    bankLedgerId: "",
    bankLedgerName: "",
    partyId: "",
    partyName: "",
    search: "",
  };
}

/**
 * The statuses the ticks mean. NOTHING ticked is every status, not no rows:
 * an operator who unticks the last box has cleared the filter, and an empty
 * grid would look broken rather than filtered.
 */
export function statusesFor(ticks: readonly StatusTick[]): ChequeStatus[] {
  const out: ChequeStatus[] = [];
  for (const tick of STATUS_TICKS) {
    if (!ticks.includes(tick.key)) {
      continue;
    }
    out.push(tick.key);
    if (tick.key === "RETURNED") {
      out.push("CANCELLED");
    }
  }
  return out;
}

export type GridParams = {
  iapd_company_id: string;
  iapd_branch_id: string;
  iapd_acc_year: string;
  istatus: string;
  ifrom: string;
  ito: string;
  ibank_ledger_id: string;
  iparty_id: string;
  isearch: string;
};

/** All nine, always — see the note at the top of this file. */
export function gridParams(filters: ChequeFilters, scope: ChequeScope): GridParams {
  return {
    iapd_company_id: scope.companyId,
    iapd_branch_id: scope.branchId,
    iapd_acc_year: scope.accYear,
    istatus: statusesFor(filters.ticks).join(","),
    ifrom: filters.from.trim(),
    ito: filters.to.trim(),
    ibank_ledger_id: filters.bankLedgerId.trim(),
    iparty_id: filters.partyId.trim(),
    isearch: filters.search.trim(),
  };
}

/**
 * A fingerprint of what the filters SELECT, for clearing the ticks when it
 * changes: a ticked row a filter has hidden must never be deposited unseen.
 * The display names are left out — they change nothing about the rows.
 */
export function filterSignature(filters: ChequeFilters): string {
  return JSON.stringify([
    statusesFor(filters.ticks),
    filters.from.trim(),
    filters.to.trim(),
    filters.bankLedgerId.trim(),
    filters.partyId.trim(),
    filters.search.trim(),
  ]);
}
