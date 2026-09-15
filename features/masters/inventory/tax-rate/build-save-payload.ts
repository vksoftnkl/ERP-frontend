import {
  toNullableString,
  toNonNegativeNumber,
  toUpper,
} from "@/app/master/_shared/crud-utils";
import { GENERATED_SPLIT_FIELDS } from "./constants";
import { parseRatePerc } from "./derived";
import type { TaxRateLedgerRow } from "./types";

/**
 * `POST /tax-rates/create` — the header and its ledger overrides, one body.
 *
 * Three rules here are not optional:
 *
 *  1. The GENERATED splits are stripped. The API rejects `tax_cgst_perc` /
 *     `tax_sgst_perc` / `tax_igst_perc` outright, and `tax_supersedes_name` is a
 *     display-only field the read path adds.
 *  2. `ck_tax_cess_agrees` — a basis of NONE must be sent with zero figures, and
 *     PERCENT / PER_UNIT with the other figure zeroed, or the row is refused.
 *     They are zeroed HERE rather than by clearing the inputs, so switching a
 *     basis back to None does not strand what the operator typed.
 *  3. `lines` is ALWAYS sent. `[]` means "delete every override", which is what
 *     an operator who cleared the grid meant; omitting the key means "leave the
 *     grid alone". These are different requests.
 */

export type TaxRateSaveValues = Record<string, string>;

/**
 * Zeroes the cess figures the basis says are not in play.
 *
 * PERCENT needs perc > 0 and per-unit = 0, PER_UNIT the reverse, BOTH needs both,
 * NONE needs neither. Only the zeroing is done here — whether a PERCENT basis
 * actually carries a non-zero figure is the validator's question (and the
 * database's), not this function's.
 */
function buildCessFigures(
  basisRaw: string,
  percRaw: string,
  perUnitRaw: string,
): { basis: string; perc: number; perUnit: number } {
  const basis = toUpper(basisRaw) || "NONE";
  const perc = toNonNegativeNumber(percRaw ?? "0", 0);
  const perUnit = toNonNegativeNumber(perUnitRaw ?? "0", 0);
  if (basis === "PERCENT") {
    return { basis, perc, perUnit: 0 };
  }
  if (basis === "PER_UNIT") {
    return { basis, perc: 0, perUnit };
  }
  if (basis === "BOTH") {
    return { basis, perc, perUnit };
  }
  return { basis: "NONE", perc: 0, perUnit: 0 };
}

/**
 * One editor row as the API wants it.
 *
 * A blank supply nature is sent as `null`, never `""`: the unique index is
 * `NULLS NOT DISTINCT`, so null is what makes one row answer both natures — and
 * `""` is not a value `ck_trl_supply_nature` accepts at all.
 *
 * A row WITH `trl_id` is an update, one WITHOUT is an insert, and a row on the
 * rate but absent from the array is soft deleted.
 */
export function buildLedgerLinePayload(
  row: TaxRateLedgerRow,
): Record<string, unknown> {
  const line: Record<string, unknown> = {
    trl_role: row.role.trim().toUpperCase(),
    trl_supply_nature: row.supplyNature ? row.supplyNature : null,
    trl_ledger_id: row.ledgerId.trim(),
    trl_remarks: toNullableString(row.remarks ?? ""),
    trl_is_active: row.isActive,
  };
  if (row.trlId) {
    line.trl_id = row.trlId;
  }
  return line;
}

export function buildTaxRateSavePayload(params: {
  values: TaxRateSaveValues;
  lines: TaxRateLedgerRow[];
  shouldUpdate: boolean;
  editingItemId: string | number | null;
}): Record<string, unknown> {
  const { values, lines, shouldUpdate, editingItemId } = params;

  const cess = buildCessFigures(
    values.tax_cess_basis ?? "",
    values.tax_cess_perc ?? "0",
    values.tax_cess_per_unit ?? "0",
  );
  // The SECOND, state cess. `sbi_acess_*`, `gdr_state_cess_value` and the 'State
  // Cess' duty head all expect it, and it is zero on every seeded rate today —
  // which is exactly why forgetting it would look correct for a year (§4.3).
  const acess = buildCessFigures(
    values.tax_acess_basis ?? "",
    values.tax_acess_perc ?? "0",
    values.tax_acess_per_unit ?? "0",
  );

  const supersedes = (values.tax_supersedes_id ?? "").trim();

  const payload: Record<string, unknown> = {
    tax_name: (values.tax_name ?? "").trim(),
    tax_code: toNullableString(values.tax_code ?? ""),
    tax_taxability: toUpper(values.tax_taxability ?? "") || "TAXABLE",
    tax_rate_perc: parseRatePerc(values.tax_rate_perc),
    tax_cess_basis: cess.basis,
    tax_cess_perc: cess.perc,
    tax_cess_per_unit: cess.perUnit,
    tax_acess_basis: acess.basis,
    tax_acess_perc: acess.perc,
    tax_acess_per_unit: acess.perUnit,
    tax_supersedes_id: supersedes ? supersedes : null,
    tax_sort_order: Math.trunc(toNonNegativeNumber(values.tax_sort_order ?? "0", 0)),
    tax_is_reverse_charge: (values.tax_is_reverse_charge ?? "false") === "true",
    tax_is_active: (values.tax_is_active ?? "true") === "true",
    // Rule 3. Always present, even empty — a form library that drops empty arrays
    // would turn "delete every override" into "leave them alone".
    lines: lines.map(buildLedgerLinePayload),
  };

  if (shouldUpdate && editingItemId !== null && editingItemId !== "") {
    payload.tax_id = String(editingItemId);
  }

  // Rule 1. Belt and braces: nothing above writes them, and this keeps it true if
  // a later edit spreads `values` in.
  for (const field of GENERATED_SPLIT_FIELDS) {
    delete payload[field];
  }
  delete payload.tax_supersedes_name;

  return payload;
}
