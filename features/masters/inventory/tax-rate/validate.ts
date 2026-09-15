import type { TaxRateLedgerRow } from "./types";

/**
 * Client-side checks before save (§5.5).
 *
 * Every message names the ROW NUMBER. The database would otherwise answer with
 * `ux_trl_rate_role`, which means nothing to anyone reading it.
 */

export type LedgerRowValidationError = {
  rowKey: string;
  field: "role" | "ledger" | "supplyNature";
  message: string;
};

/** `(role, nature)` as the unique index sees it — blank nature included. */
function pairKey(row: TaxRateLedgerRow): string {
  return `${row.role.trim().toUpperCase()}|${row.supplyNature}`;
}

export function getLedgerRowsValidationError(
  rows: TaxRateLedgerRow[],
): LedgerRowValidationError | null {
  const seen = new Map<string, number>();

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const rowNo = index + 1;

    if (!row.role.trim()) {
      return {
        rowKey: row.rowKey,
        field: "role",
        message: `Row ${rowNo}: choose a posting role.`,
      };
    }

    if (!row.ledgerId.trim()) {
      return {
        rowKey: row.rowKey,
        field: "ledger",
        message:
          `Row ${rowNo}: an override with no ledger says nothing — choose one, ` +
          "or delete the row to fall back to the posting ledger map.",
      };
    }

    // A tax role already implies its nature: CGST and SGST exist only on an
    // intra-state sale and IGST only on an inter-state one, so narrowing one
    // further could never be the best match. The editor greys the cell; this is
    // the guard for a row that arrived narrowed from elsewhere.
    if (row.supplyNature && !row.roleBySupply) {
      return {
        rowKey: row.rowKey,
        field: "supplyNature",
        message:
          `Row ${rowNo}: ${row.roleLabel || row.role} already implies its supply ` +
          "nature and cannot be narrowed.",
      };
    }

    const key = pairKey(row);
    const firstAt = seen.get(key);
    if (firstAt !== undefined) {
      // Two rows both left blank land here too — the case `NULLS NOT DISTINCT`
      // makes illegal and a naive "skip the empties" dedupe misses.
      return {
        rowKey: row.rowKey,
        field: "role",
        message:
          `Row ${rowNo} repeats row ${firstAt}: one role answers one supply ` +
          "nature once.",
      };
    }
    seen.set(key, rowNo);
  }

  return null;
}
