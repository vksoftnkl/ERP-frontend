/**
 * The GST rate master's API shapes, mirroring the server's
 * `tax-rate-master/types/tax-rate-api.types.ts` exactly.
 *
 * Two tables, one URL: `/tax-rates/create` saves the header and its ledger
 * overrides (`lines`) in one transaction, and `/tax-rates/get` returns the same
 * shape back. There is deliberately no per-line endpoint.
 */

/** `accounts.acc_ledger_role.alr_role` values that a rate may override. */
export type TaxRateSupplyNature = "INTRA" | "INTER";

/**
 * One ledger override — a (role, supply nature) pair that this rate posts
 * somewhere other than where `accounts.acc_ledger_map` would send it.
 *
 * `trl_role_label` / `trl_ledger_name` are resolved on the read paths only. They
 * are ignored on write and null on the rows echoed back by create and delete, so
 * the editor keeps its own copy of both rather than trusting a save to return them.
 */
export type TaxRateLedgerPayload = {
  trl_id: string;
  trl_tax_id: string;
  trl_role: string;
  trl_role_label?: string | null;
  trl_supply_nature: string | null;
  trl_ledger_id: string;
  trl_ledger_name?: string | null;
  trl_remarks: string | null;
  trl_is_active: boolean;
  trl_is_deleted: boolean;
};

/**
 * A rate, whole.
 *
 * `tax_cgst_perc` / `tax_sgst_perc` / `tax_igst_perc` are GENERATED columns —
 * they come back computed from `tax_rate_perc` and are REJECTED on write, so the
 * screen may display them but must never send them.
 */
export type TaxRatePayload = {
  tax_id: string;
  tax_name: string;
  tax_code: string | null;
  tax_sort_order: number;
  tax_taxability: string;
  tax_is_reverse_charge: boolean;
  tax_rate_perc: number;
  tax_cgst_perc: number | null;
  tax_sgst_perc: number | null;
  tax_igst_perc: number | null;
  tax_cess_basis: string;
  tax_cess_perc: number;
  tax_cess_per_unit: number;
  tax_acess_basis: string;
  tax_acess_perc: number;
  tax_acess_per_unit: number;
  tax_supersedes_id: string | null;
  tax_supersedes_name?: string | null;
  tax_is_active: boolean;
  tax_is_deleted: boolean;
  lines: TaxRateLedgerPayload[];
};

/**
 * One row of the Ledgers tab, as the editor holds it.
 *
 * `rowKey` is local and never sent: React needs a stable key for a row that does
 * not have a `trl_id` yet. `roleLabel` / `ledgerName` are carried beside the
 * codes so the pickers can render a saved row's text without a lookup round-trip.
 *
 * `remarks` is kept even though the column is hidden (§5.1) — hiding a column
 * must not silently drop what another client wrote into it.
 */
export type TaxRateLedgerRow = {
  rowKey: string;
  trlId: string | null;
  role: string;
  roleLabel: string;
  /** True when the role's `alr_by_supply` allows narrowing (§5.3). */
  roleBySupply: boolean;
  /** "" is the default and a real choice: "answers both natures". */
  supplyNature: "" | TaxRateSupplyNature;
  ledgerId: string;
  ledgerName: string;
  remarks: string;
  isActive: boolean;
};

/** `GET /tax-rates/resolve` — one role, and where it actually posts. */
export type TaxRateResolvedLedger = {
  role: string;
  role_label: string;
  role_group: string;
  supply_nature: string | null;
  ledger_id: string | null;
  ledger_name: string | null;
  /**
   * OVERRIDE = this rate carries a row of its own, DEFAULT = it inherits
   * `accounts.acc_ledger_map`, UNMAPPED = nothing answers and a voucher touching
   * the role cannot be posted yet.
   */
  source: "OVERRIDE" | "DEFAULT" | "UNMAPPED";
  source_row_id: string | null;
};

export type TaxRateResolution = {
  tax_id: string;
  tax_name: string;
  supply_nature: string | null;
  roles: TaxRateResolvedLedger[];
};
