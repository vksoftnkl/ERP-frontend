/**
 * The filter bar, and the parameter contract of grid 121.
 *
 * ── Nine bare parameters, ALL sent, EVERY time ───────────────────────────
 * As on grid 109: PostgreSQL resolves every bare token when the statement is
 * prepared, so a missing one fails the whole call; `""` is how "no filter" is
 * said. But grid 121 spells the scope `icompany_id` / `ibranch_id` /
 * `iacc_year` — NOT grid 109's `iapd_*` — so the received `gridParams` cannot
 * be reused.
 *
 * The search is `isearch` inside `grid_param` (a plain ILIKE on leaf, payee
 * and favouring), never the runner's own `search`.
 */
import { accountingYearBounds, addYears } from "../../domain/dates";
import type { IssuedScope, IssuedStatus } from "../issued.types";

/** The ticks, one status each — no pairing as on the received side. */
export const ISSUED_TICKS = [
  { key: "HELD", label: "Not presented" },
  { key: "CLEARED", label: "Presented" },
  { key: "BOUNCED", label: "Returned unpaid" },
  { key: "CANCELLED", label: "Stopped / void" },
  { key: "REPLACED", label: "Replaced" },
] as const;
export type IssuedTick = (typeof ISSUED_TICKS)[number]["key"];

/** What still needs the operator: not yet presented, or back from the bank. */
export const ISSUED_DEFAULT_TICKS: readonly IssuedTick[] = ["HELD", "BOUNCED"];

export type IssuedFilters = {
  ticks: readonly IssuedTick[];
  from: string;
  to: string;
  bankLedgerId: string;
  bankLedgerName: string;
  partyId: string;
  partyName: string;
  search: string;
};

/**
 * The default window, on the CHEQUE date: the accounting year the screen was
 * opened in, to a year past its end. A cheque we write cannot be dated before
 * its payment, so nothing of the year is earlier than its first day; a
 * post-dated one can run up to a year ahead.
 */
export function issuedDateRange(
  accYear: string,
  beginDate?: string | null,
  endDate?: string | null,
): { from: string; to: string } {
  const bounds = accountingYearBounds(accYear, beginDate, endDate);
  if (!bounds) {
    return { from: "", to: "" };
  }
  return { from: bounds.start, to: addYears(bounds.end, 1) };
}

export function defaultIssuedFilters(range: { from: string; to: string }): IssuedFilters {
  return {
    ticks: ISSUED_DEFAULT_TICKS,
    from: range.from,
    to: range.to,
    bankLedgerId: "",
    bankLedgerName: "",
    partyId: "",
    partyName: "",
    search: "",
  };
}

/** Nothing ticked is EVERY status, not no rows. */
export function issuedStatusesFor(ticks: readonly IssuedTick[]): IssuedStatus[] {
  return ISSUED_TICKS.filter((tick) => ticks.includes(tick.key)).map((tick) => tick.key);
}

export type IssuedGridParams = {
  icompany_id: string;
  ibranch_id: string;
  iacc_year: string;
  istatus: string;
  ifrom: string;
  ito: string;
  ibank_ledger_id: string;
  iparty_id: string;
  isearch: string;
};

/** All nine, always. */
export function issuedGridParams(filters: IssuedFilters, scope: IssuedScope): IssuedGridParams {
  return {
    icompany_id: scope.companyId,
    ibranch_id: scope.branchId,
    iacc_year: scope.accYear,
    istatus: issuedStatusesFor(filters.ticks).join(","),
    ifrom: filters.from.trim(),
    ito: filters.to.trim(),
    ibank_ledger_id: filters.bankLedgerId.trim(),
    iparty_id: filters.partyId.trim(),
    isearch: filters.search.trim(),
  };
}

/**
 * What the summary reads: everything still out (HELD and BOUNCED) for the
 * scope and the bank filter — the other filters do not narrow it, so the
 * tiles answer "what is our bank book carrying", not "what is on screen".
 */
export function issuedSummaryParams(filters: IssuedFilters, scope: IssuedScope): IssuedGridParams {
  return {
    icompany_id: scope.companyId,
    ibranch_id: scope.branchId,
    iacc_year: scope.accYear,
    istatus: "HELD,BOUNCED",
    ifrom: "",
    ito: "",
    ibank_ledger_id: filters.bankLedgerId.trim(),
    iparty_id: "",
    isearch: "",
  };
}

/** The display names are left out — they change nothing about the rows. */
export function issuedFilterSignature(filters: IssuedFilters): string {
  return JSON.stringify([
    issuedStatusesFor(filters.ticks),
    filters.from.trim(),
    filters.to.trim(),
    filters.bankLedgerId.trim(),
    filters.partyId.trim(),
    filters.search.trim(),
  ]);
}
